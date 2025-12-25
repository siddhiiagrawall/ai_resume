import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { searchResumeChunks } from '../vector/resumeVectorService.js';
import { getResume } from '../neo4j/resumeService.js';
import dotenv from 'dotenv';

dotenv.config();

const model = new ChatOpenAI({
  modelName: 'gpt-4o-mini',
  temperature: 0.7,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

// Simple in-memory conversation memory (can be replaced with Mem0)
const conversationMemory = new Map<string, Array<{ role: string; content: string }>>();

export async function chatWithResume(
  resumeId: string,
  message: string,
  sessionId?: string
): Promise<{ response: string; sessionId: string }> {
  const session = sessionId || `session_${resumeId}_${Date.now()}`;
  
  // Get resume context
  const resume = await getResume(resumeId);
  if (!resume) {
    throw new Error('Resume not found');
  }
  
  // Retrieve relevant chunks
  const relevantChunks = await searchResumeChunks(resumeId, message, 5);
  const context = relevantChunks.map(c => c.text).join('\n\n');
  
  // Get conversation history
  const history = conversationMemory.get(session) || [];
  
  // Build prompt with context and history
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', `You are an AI assistant helping to answer questions about a resume.
Use the following resume context to answer questions accurately. If the information is not in the context, say so.

Resume Context:
${context}

Resume Skills: ${resume.skills.join(', ')}`],
    ...history.slice(-6).map(msg => [msg.role === 'user' ? 'human' : 'ai', msg.content] as [string, string]),
    ['human', '{question}'],
  ]);
  
  const chain = prompt.pipe(model);
  const response = await chain.invoke({ question: message });
  
  const aiResponse = response.content as string;
  
  // Update conversation memory
  const updatedHistory = [
    ...history,
    { role: 'user', content: message },
    { role: 'assistant', content: aiResponse },
  ];
  conversationMemory.set(session, updatedHistory.slice(-10)); // Keep last 10 messages
  
  return {
    response: aiResponse,
    sessionId: session,
  };
}

export function getConversationHistory(sessionId: string): Array<{ role: string; content: string }> {
  return conversationMemory.get(sessionId) || [];
}

