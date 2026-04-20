/**
 * routes/chat.ts — Chat API Endpoints (Standard + Streaming SSE)
 *
 * Two chat modes:
 *   POST /api/chat/:resumeId        — Standard: waits for full GPT response
 *   POST /api/chat/:resumeId/stream — Streaming SSE: tokens arrive in real-time
 *   GET  /api/chat/:resumeId/history/:sessionId — returns stored conversation
 *
 * SSE vs WebSockets:
 *   SSE is HTTP/1.1, server→client only, simple for token streaming.
 *   WebSockets are bidirectional — overkill for LLM completion streams.
 *
 * Input Validation:
 *   - message must be 1–2000 characters (prevents empty + token-bomb attacks)
 *   - sessionId must be a UUID if provided (prevents injection)
 */

import express from 'express';
import { z } from 'zod';
import {
  chatWithResume,
  streamChatWithResume,
  getConversationHistory,
} from '../services/chat/ragChatService.js';

const router = express.Router();

// ─── Zod Validation ────────────────────────────────────────────────────────────

/**
 * ChatBodySchema — validates request bodies for both standard and streaming chat
 *
 * - message: 1–2000 chars prevents empty messages and token bombs
 * - sessionId: optional UUID — if omitted, a new session is created
 */
const ChatBodySchema = z.object({
  message: z
    .string({ required_error: 'message is required' })
    .min(1, 'Message cannot be empty')
    .max(2000, 'Message too long — maximum 2000 characters'),
  sessionId: z.string().uuid('sessionId must be a valid UUID').optional(),
});

// ─── Standard Chat ─────────────────────────────────────────────────────────────

/**
 * POST /api/chat/:resumeId
 * Body: { message: string, sessionId?: string }
 * Returns: { response: string, sessionId: string }
 */
router.post('/:resumeId', async (req, res, next) => {
  try {
    const parsed = ChatBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        issues: parsed.error.issues.map(i => i.message),
      });
    }
    const { message, sessionId } = parsed.data;
    const result = await chatWithResume(req.params.resumeId, message, sessionId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ─── Streaming Chat (SSE) ──────────────────────────────────────────────────────

/**
 * POST /api/chat/:resumeId/stream
 * SSE streaming — tokens flow to client in real-time.
 *
 * Why POST for SSE?
 *   Browser EventSource only supports GET. We need a body (message + sessionId),
 *   so we use fetch() + ReadableStream on the client instead.
 *
 * Event types sent over the stream:
 *   { type: 'session', sessionId: '...' }  — first event, client stores this
 *   { type: 'token',   content: '...' }    — one per GPT token
 *   { type: 'done' }                       — stream complete
 *   { type: 'error',   message: '...' }    — on failure
 */
router.post('/:resumeId/stream', async (req, res, next) => {
  const parsed = ChatBodySchema.safeParse(req.body);
  if (!parsed.success) {
    // Can't use SSE error format here (headers not set yet) — use plain JSON
    return res.status(400).json({
      error: 'Validation failed',
      issues: parsed.error.issues.map(i => i.message),
    });
  }
  const { message, sessionId } = parsed.data;

  // streamChatWithResume sets SSE headers and writes directly to res
  await streamChatWithResume(req.params.resumeId, message, sessionId, res);
});

// ─── Conversation History ─────────────────────────────────────────────────────

/**
 * GET /api/chat/:resumeId/history/:sessionId
 * Returns the stored conversation history for a session.
 * Used by the frontend to restore the chat on page refresh.
 *
 * Note: History is currently in-memory. Upgrade path: Redis with TTL.
 */
router.get('/:resumeId/history/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const history = getConversationHistory(sessionId);
    res.json({ history });
  } catch (error) {
    next(error);
  }
});

export default router;
