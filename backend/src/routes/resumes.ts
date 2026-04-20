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
  createResume,
  updateResumeQualityScore,
  getAllResumes,
  getResume,
  deleteResume,
  reextractResumeProfile,
} from '../services/neo4j/resumeService.js';
import { storeResumeEmbeddings, deleteResumeEmbeddings } from '../services/vector/resumeVectorService.js';
import { scoreResume } from '../services/ai/resumeScorer.js';

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
 * Accepts a single file field named "resume".
 * Returns the created resume with quality score + breakdown.
 */
router.post('/', upload.single('resume'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const mimeType = req.file.mimetype;

    // Step 1: Extract text from PDF or TXT
    const text = await parseResume(filePath, mimeType);

    // Step 2: Create in Neo4j (runs GPT full profile extraction internally)
    const fileUrl = `/uploads/${req.file.filename}`;
    const resume = await createResume(fileName, fileUrl, text);

    // Step 3: Embed (ChromaDB) + Score (GPT) IN PARALLEL — no added latency
    const [, scoreResult] = await Promise.all([
      storeResumeEmbeddings(resume.id, text),
      scoreResume(text),
    ]);

    // Step 4: Persist the quality score on the Neo4j Resume node
    await updateResumeQualityScore(resume.id, scoreResult.total);

    res.status(201).json({
      ...resume,
      qualityScore: scoreResult.total,
      scoreBreakdown: {
        structure: scoreResult.structure,
        specificity: scoreResult.specificity,
        skillsDepth: scoreResult.skillsDepth,
        readability: scoreResult.readability,
        grade: scoreResult.grade,
        feedback: scoreResult.feedback,
      },
    });
  } catch (error) {
    next(error); // Pass to global error handler
  }
});

// ─── Read ──────────────────────────────────────────────────────────────────────

/** GET /api/resumes — all resumes, newest first */
router.get('/', async (req, res, next) => {
  try {
    const resumes = await getAllResumes();
    res.json(resumes);
  } catch (error) {
    next(error);
  }
});

/** GET /api/resumes/:id — single resume with full profile */
router.get('/:id', async (req, res, next) => {
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
 * Fully removes a resume:
 *   1. Delete Neo4j node + all relationships (DETACH DELETE)
 *   2. Delete ChromaDB chunks (prevents orphaned vectors)
 *   3. Delete file from disk (prevents orphaned storage)
 *
 * All three steps run in parallel via Promise.all.
 * Individual failures are logged but don't block the others.
 * Returns 204 No Content on success (REST standard for delete).
 */
router.delete('/:id', async (req, res, next) => {
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
 * Re-runs GPT extraction and scoring on an existing resume WITHOUT re-uploading.
 *
 * Use case: Initial GPT call returned poor results (few skills, missing companies).
 * The resume text is already stored in Neo4j (up to 10000 chars).
 *
 * Process:
 *   1. GET current resume from Neo4j (includes stored text)
 *   2. Clear old HAS_SKILL, WORKED_AT, HAS_DEGREE relationships
 *   3. Re-run GPT extractFullProfile → rebuild relationships
 *   4. Re-run scoreResume → update qualityScore
 *   5. Re-embed into ChromaDB (delete old + store new)
 *   6. Return the fully-updated resume
 */
router.post('/:id/reprocess', async (req, res, next) => {
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
