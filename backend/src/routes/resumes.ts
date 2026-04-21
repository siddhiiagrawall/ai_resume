/**
 * routes/resumes.ts — Resume Upload, Retrieval, Delete & Reprocess Endpoints
 *
 * File upload pipeline triggered by POST /api/resumes:
 *   1. Multer validates + saves file to disk
 *   2. resumeParser  → extracts text from PDF/TXT
 *   3. createResume  → GPT extracts full profile + stores in Neo4j graph
 *   4. Promise.all   → ChromaDB embedding + resume scoring IN PARALLEL
 *   5. Return resume JSON with quality score to client
 *
 * New endpoints:
 *   DELETE /api/resumes/:id        → deletes Neo4j node + ChromaDB chunks + disk file
 *   POST   /api/resumes/:id/reprocess → re-runs GPT extraction + scoring (no re-upload)
 */

import express from 'express';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { unlink } from 'fs/promises';
import { z } from 'zod';
import { parseResume } from '../services/resumeParser.js';
import {
  updateResumeQualityScore,
  getAllResumes,
  getResume,
  deleteResume,
  reextractResumeProfile,
  createPendingResume,
} from '../services/neo4j/resumeService.js';
import { storeResumeEmbeddings, deleteResumeEmbeddings } from '../services/vector/resumeVectorService.js';
import { scoreResume } from '../services/ai/resumeScorer.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { resumeQueue } from '../workers/resumeQueue.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Zod Validation Schemas ────────────────────────────────────────────────────

/**
 * ChatMessageSchema — validates chat request bodies
 * Prevents empty messages and excessively-long prompts that waste GPT tokens
 */
const ReprocessQuerySchema = z.object({
  // No body required for reprocess — the resume text already lives in Neo4j
});

// ─── Multer Configuration ──────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = join(__dirname, '../../uploads');
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + '-' + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.mimetype === 'text/plain') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and TXT files are allowed'));
    }
  },
});

const router = express.Router();

// ─── Upload ───────────────────────────────────────────────────────────────────

/**
 * POST /api/resumes
 * Uploads file, extracts raw text, creates a pending node, and enqueues background processing.
 */
router.post('/', requireAuth, upload.single('resume'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const mimeType = req.file.mimetype;

    // Fast sync operation to get text
    const text = await parseResume(filePath, mimeType);

    // Create stub node in Neo4j
    const fileUrl = `/uploads/${req.file.filename}`;
    const id = await createPendingResume(fileName, fileUrl, text);

    // Add to BullMQ Queue for AI processing
    const job = await resumeQueue.add('process-resume', { id, text });

    res.status(202).json({ id, jobId: job.id, status: 'QUEUED' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/resumes/status/:id
 * Poll for background processing status.
 */
router.get('/status/:id', requireAuth, async (req, res, next) => {
  try {
    const resume = await getResume(req.params.id);
    if (!resume) return res.status(404).json({ error: 'Resume not found' });
    
    res.json({ status: resume.status || 'COMPLETED', qualityScore: resume.qualityScore });
  } catch (error) {
    next(error);
  }
});

// ─── Retrieval ────────────────────────────────────────────────────────────────

// GET all resumes (Recruiter ONLY)
router.get('/', requireAuth, requireRole('RECRUITER'), async (req, res, next) => {
  try {
    res.json(await getAllResumes());
  } catch (error) {
    next(error);
  }
});

// GET single resume by ID (Candidate or Recruiter)
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const resume = await getResume(req.params.id);
    if (!resume) return res.status(404).json({ error: 'Resume not found' });
    res.json(resume);
  } catch (error) {
    next(error);
  }
});

// ─── Delete ────────────────────────────────────────────────────────────────────

/**
 * DELETE /api/resumes/:id
 * Removes Neo4j node, ChromaDB embeddings, and the uploaded file from disk.
 * Parallel execution for low latency. (Recruiter ONLY)
 */
router.delete('/:id', requireAuth, requireRole('RECRUITER'), async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get resume first so we have fileUrl for disk deletion
    const resume = await getResume(id);
    if (!resume) return res.status(404).json({ error: 'Resume not found' });

    // Build absolute disk path from fileUrl (/uploads/resume-xxx.pdf → disk path)
    const filename = resume.fileUrl.replace('/uploads/', '');
    const filePath = join(__dirname, '../../uploads', filename);

    // Run all three deletions in parallel — each is independently non-fatal
    await Promise.all([
      deleteResume(id),                            // Neo4j DETACH DELETE
      deleteResumeEmbeddings(id),                  // ChromaDB chunk cleanup
      unlink(filePath).catch(() => { /* file may already be gone */ }),
    ]);

    // 204 No Content — REST standard for successful delete with no response body
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ─── Reprocess ─────────────────────────────────────────────────────────────────

/**
 * POST /api/resumes/:id/reprocess
 * Clears old extracted relationships, re-runs GPT extraction, re-scores, and re-embeds.
 * Used when the first AI extraction failed or missed data. (Recruiter ONLY)
 */
router.post('/:id/reprocess', requireAuth, requireRole('RECRUITER'), async (req, res, next) => {
  try {
    const { id } = req.params;

    // Fetch existing resume — we need the stored text for re-extraction
    const resume = await getResume(id);
    if (!resume) return res.status(404).json({ error: 'Resume not found' });

    // Re-run extraction + scoring + re-embedding in parallel where possible
    const [profile, scoreResult] = await Promise.all([
      reextractResumeProfile(id, resume.text),   // Clears + re-creates graph relations
      scoreResume(resume.text),                   // Re-scores the resume quality
    ]);

    // Persist updated score + re-embed (must happen after reextract)
    await Promise.all([
      updateResumeQualityScore(id, scoreResult.total),
      deleteResumeEmbeddings(id).then(() => storeResumeEmbeddings(id, resume.text)),
    ]);

    // Return updated resume
    const updated = await getResume(id);
    res.json({
      ...updated,
      qualityScore: scoreResult.total,
      scoreBreakdown: {
        structure: scoreResult.structure,
        specificity: scoreResult.specificity,
        skillsDepth: scoreResult.skillsDepth,
        readability: scoreResult.readability,
        grade: scoreResult.grade,
        feedback: scoreResult.feedback,
      },
      reprocessed: true,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
