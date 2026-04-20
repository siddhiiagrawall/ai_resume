/**
 * ragChatService.ts — RAG Chat Engine (Standard + Streaming)
 *
 * What is RAG (Retrieval-Augmented Generation)?
 * ─────────────────────────────────────────────
 * Standard LLM: User Q → GPT → Answer (GPT may hallucinate — it doesn't know your PDF)
 * RAG:          User Q → embed Q → find relevant chunks → GPT + chunks → Grounded Answer
 *
 * This service has TWO modes:
 *
 * 1. chatWithResume()       — Standard: waits for full response, returns it at once
 *    Used by: POST /api/chat/:resumeId
 *
 * 2. streamChatWithResume() — Streaming (SSE): yields tokens one-by-one as GPT generates them
 *    Used by: POST /api/chat/:resumeId/stream
 *    How streaming works:
 *      - LangChain supports streaming via model.stream() instead of model.invoke()
 *      - Each chunk that arrives from OpenAI's token stream is immediately forwarded
 *        to the HTTP response as a Server-Sent Event (SSE)
 *      - The browser receives tokens in real time → chat "types itself" like ChatGPT
 *      - SSE format: "data: <token>\n\n" — a standard HTTP streaming protocol
 *
 * Why SSE instead of WebSockets for streaming?
 *   SSE is simpler for one-directional server→client streams.
 *   WebSockets are bidirectional — overkill for chat completion streaming.
 *   SSE works over plain HTTP/1.1, no upgrade handshake needed.
 */

import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { searchResumeChunks } from '../vector/resumeVectorService.js';
import { getResume } from '../neo4j/resumeService.js';
import type { Response } from 'express';
import dotenv from 'dotenv';

dotenv.config();

// ─── Model Instances ──────────────────────────────────────────────────────────

// Standard model — used for non-streaming responses
const model = new ChatOpenAI({
  modelName: 'gpt-4o-mini',
  temperature: 0.7,        // Balanced: factual but conversational
  openAIApiKey: process.env.OPENAI_API_KEY,
});

// Streaming model — streaming: true enables token-by-token output
// We use a separate instance so each can be tuned independently
const streamingModel = new ChatOpenAI({
  modelName: 'gpt-4o-mini',
  temperature: 0.7,
  openAIApiKey: process.env.OPENAI_API_KEY,
  streaming: true,         // Enables the .stream() method on the LangChain chain
});

// ─── In-Memory Conversation Store ────────────────────────────────────────────
//
// Maps sessionId → array of { role, content } message objects
//
// ⚠️  Production limitation: this Map is process-local
//     - Lost on server restart
//     - Not shared across multiple server instances
// ✅  Production fix: replace with Redis (SET chatSession:{id} JSON EX 86400)
const conversationMemory = new Map<string, Array<{ role: string; content: string }>>();

// ─── Shared Prompt Builder ────────────────────────────────────────────────────

/**
 * buildPrompt — constructs the LangChain prompt template for a given session
 *
 * Injects three types of context into the prompt:
 *  1. Retrieved resume chunks (RAG) — the most relevant text passages
 *  2. Structured skills list (Neo4j) — for precise factual lookup
 *  3. Conversation history — last 6 messages for multi-turn coherence
 *
 * System message is deliberately instructive: "If not in context, say so."
 * This prevents GPT from hallucinating facts about the resume.
 */
function buildPrompt(context: string, skills: string[], history: Array<{ role: string; content: string }>) {
  return ChatPromptTemplate.fromMessages([
    ['system', `You are an expert AI assistant helping recruiters analyze a resume. 
Answer questions accurately and professionally based strictly on the resume context below.
If specific information is not in the context, clearly state that.
Format your responses with markdown when helpful (use **bold**, bullet lists, etc).

Resume Context (relevant sections):
${context}

Candidate's Extracted Skills: ${skills.join(', ')}`],
    // Inject the last 6 messages (3 user + 3 assistant turns) for conversation continuity
    // Older messages are dropped to stay within the model's context window
    ...history.slice(-6).map(
      msg => [msg.role === 'user' ? 'human' : 'ai', msg.content] as [string, string]
    ),
    ['human', '{question}'],
  ]);
}

// ─── Standard (Non-Streaming) Chat ───────────────────────────────────────────

/**
 * chatWithResume — full-response RAG chat
 *
 * Waits for GPT to finish generating the ENTIRE response before returning it.
 * Simpler to implement, but user sees no output until generation is complete.
 *
 * @param resumeId  - UUID of the resume (scope for ChromaDB search + Neo4j fetch)
 * @param message   - The user's current question
 * @param sessionId - Optional: existing session ID for multi-turn context
 * @returns         - { response: full AI text, sessionId: string }
 */
export async function chatWithResume(
  resumeId: string,
  message: string,
  sessionId?: string
): Promise<{ response: string; sessionId: string }> {
  const session = sessionId || `session_${resumeId}_${Date.now()}`;

  // Step 1: Get resume metadata (name, skills) from Neo4j
  const resume = await getResume(resumeId);
  if (!resume) throw new Error('Resume not found');

  // Step 2: Retrieve top-5 most relevant text chunks from ChromaDB
  const relevantChunks = await searchResumeChunks(resumeId, message, 5);
  const context = relevantChunks.map(c => c.text).join('\n\n');

  // Step 3: Load conversation history from in-memory store
  const history = conversationMemory.get(session) || [];

  // Step 4: Build and invoke prompt chain
  const prompt = buildPrompt(context, resume.skills, history);
  const chain = prompt.pipe(model);
  const response = await chain.invoke({ question: message });
  const aiResponse = response.content as string;

  // Step 5: Persist this exchange in memory (trim to last 10 messages)
  const updatedHistory = [
    ...history,
    { role: 'user', content: message },
    { role: 'assistant', content: aiResponse },
  ];
  conversationMemory.set(session, updatedHistory.slice(-10));

  return { response: aiResponse, sessionId: session };
}

// ─── Streaming Chat (SSE) ─────────────────────────────────────────────────────

/**
 * streamChatWithResume — streaming RAG chat via Server-Sent Events
 *
 * Instead of awaiting the full response, this function:
 *  1. Calls LangChain's chain.stream() which returns an AsyncIterator
 *  2. For each token chunk yielded, writes an SSE event to the HTTP response
 *  3. Client receives tokens in real-time and appends them to the UI
 *
 * SSE Protocol:
 *  - Content-Type: text/event-stream
 *  - Each event: "data: <JSON>\n\n"  (double newline terminates the event)
 *  - "[DONE]" is a sentinel value signaling end of stream (same as OpenAI's API)
 *
 * The Express `res` object is written to directly (not returned) because
 * streaming is inherently side-effectful — we can't return a Promise<string>
 * when content is being sent incrementally.
 *
 * @param resumeId  - UUID of resume
 * @param message   - User's question
 * @param sessionId - Optional existing session ID
 * @param res       - Express Response object (written to directly for SSE)
 */
export async function streamChatWithResume(
  resumeId: string,
  message: string,
  sessionId: string | undefined,
  res: Response
): Promise<void> {
  const session = sessionId || `session_${resumeId}_${Date.now()}`;

  // ── Set SSE headers ──────────────────────────────────────────────────────
  // text/event-stream tells the browser this is an SSE connection
  // Cache-Control: no-cache prevents any proxy from buffering the stream
  // Connection: keep-alive keeps the HTTP connection open for the duration
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*'); // CORS for SSE
  res.flushHeaders(); // Send headers immediately — starts the SSE connection

  try {
    // Step 1: Fetch resume + relevant chunks (same as standard chat)
    const resume = await getResume(resumeId);
    if (!resume) {
      res.write(`data: ${JSON.stringify({ error: 'Resume not found' })}\n\n`);
      res.end();
      return;
    }

    const relevantChunks = await searchResumeChunks(resumeId, message, 5);
    const context = relevantChunks.map(c => c.text).join('\n\n');
    const history = conversationMemory.get(session) || [];

    // Step 2: Build prompt + stream
    const prompt = buildPrompt(context, resume.skills, history);
    const chain = prompt.pipe(streamingModel);

    // Send sessionId as the FIRST event so the client knows which session to use
    res.write(`data: ${JSON.stringify({ type: 'session', sessionId: session })}\n\n`);

    // Step 3: Iterate over the token stream
    // chain.stream() returns an AsyncGenerator — each yield is a partial message chunk
    let fullResponse = '';
    const stream = await chain.stream({ question: message });

    for await (const chunk of stream) {
      const token = chunk.content as string;
      if (token) {
        fullResponse += token; // Accumulate to save to memory at the end
        // Send each token as an SSE event: { type: 'token', content: '...' }
        res.write(`data: ${JSON.stringify({ type: 'token', content: token })}\n\n`);
      }
    }

    // Step 4: Signal end of stream with [DONE] sentinel
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();

    // Step 5: Save the complete response to conversation memory
    const updatedHistory = [
      ...history,
      { role: 'user', content: message },
      { role: 'assistant', content: fullResponse },
    ];
    conversationMemory.set(session, updatedHistory.slice(-10));

  } catch (error) {
    console.error('Streaming chat error:', error);
    // Even on error, send a graceful SSE error event (don't crash the stream)
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to generate response' })}\n\n`);
    res.end();
  }
}

/**
 * getConversationHistory — returns full message history for a session
 * Used by: GET /api/chat/:resumeId/history/:sessionId
 */
export function getConversationHistory(
  sessionId: string
): Array<{ role: string; content: string }> {
  return conversationMemory.get(sessionId) || [];
}
