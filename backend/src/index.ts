/**
 * index.ts — Express Server Entry Point
 *
 * Responsibilities:
 *  - Configure middleware (CORS, JSON parsing, static files)
 *  - Register API route groups
 *  - Initialize DB connections (non-blocking, so server starts fast)
 *  - Start HTTP server
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdir } from 'fs/promises';
import jobRoutes from './routes/jobs.js';
import resumeRoutes from './routes/resumes.js';
import chatRoutes from './routes/chat.js';
import { testConnection, initializeSchema } from './config/neo4j.js';
import { initializeChroma } from './config/chroma.js';
import { errorHandler } from './middleware/errorHandler.js';

// Load environment variables from .env file BEFORE anything else reads process.env
dotenv.config();

// ESM (ES Modules) doesn't have __dirname — we reconstruct it from import.meta.url
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Path where uploaded PDF/TXT resumes will be saved to disk
const uploadsDir = join(__dirname, '../uploads');

// ─── Middleware ───────────────────────────────────────────────────────────────

// Allow cross-origin requests from the React dev server (localhost:5173)
app.use(cors());

// Parse JSON request bodies (e.g., { title: "...", description: "..." })
app.use(express.json());

// Parse URL-encoded form bodies (legacy form submissions)
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files at /uploads/<filename>
// e.g., GET /uploads/resume-1712345-john_cv.pdf returns the binary file
app.use('/uploads', express.static(uploadsDir));

// ─── Routes ──────────────────────────────────────────────────────────────────

// All job-related endpoints: POST/GET /api/jobs, GET /api/jobs/:id/matches
app.use('/api/jobs', jobRoutes);

// All resume endpoints: POST /api/resumes (upload), GET /api/resumes/:id
app.use('/api/resumes', resumeRoutes);

// Chat with a resume via RAG: POST /api/chat/:resumeId
app.use('/api/chat', chatRoutes);

// Simplest possible health check — useful for load balancers and monitoring
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
// MUST be registered AFTER all routes — Express identifies error middleware
// by the 4-argument signature (err, req, res, next)
app.use(errorHandler);

// ─── Initialization ───────────────────────────────────────────────────────────

/**
 * initialize() — bootstraps the server
 *
 * Key design decision: DB initialization is NON-BLOCKING.
 * The server starts listening IMMEDIATELY, even if Neo4j/ChromaDB
 * aren't fully connected yet. This prevents startup failures during dev
 * and makes the server resilient to temporary DB unavailability.
 */
async function initialize() {
  // Ensure the uploads directory exists (recursive = no error if already exists)
  try {
    await mkdir(uploadsDir, { recursive: true });
    console.log('✅ Uploads directory ready');
  } catch (error) {
    console.error('⚠️ Uploads directory warning:', error);
  }
  
  // Fire-and-forget IIFE: DB init runs concurrently with server startup
  // Note: errors here are caught and logged, NOT propagated to crash the server
  (async () => {
    try {
      await testConnection();   // Verify Neo4j is reachable via Bolt protocol
      await initializeSchema(); // Create indexes for fast node lookups
    } catch (err: any) {
      console.error('⚠️ Neo4j warning:', err?.message || err);
    }
    
    try {
      await initializeChroma(); // Create the 'resumes' vector collection if missing
    } catch (err: any) {
      console.error('⚠️ Chroma warning:', err?.message || err);
    }
    
    console.log('✅ Database initialization attempts completed');
  })();
  
  // Server starts listening BEFORE DB init finishes — intentional!
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📋 Health check: http://localhost:${PORT}/api/health`);
  });
}

initialize();
