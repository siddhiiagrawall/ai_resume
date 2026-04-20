/**
 * routes/jobs.ts — Job Posting API Endpoints (Full)
 *
 * Endpoints:
 *   POST   /api/jobs                                → create job (GPT skill extraction)
 *   GET    /api/jobs                                → list all jobs
 *   GET    /api/jobs/:id                            → get single job
 *   DELETE /api/jobs/:id                            → delete job
 *   GET    /api/jobs/:id/matches                    → hybrid matching (top resumes)
 *   GET    /api/jobs/:id/matches/:resumeId/explain  → AI evaluation
 *   GET    /api/jobs/:id/gap-plan/:resumeId         → skill gap learning path
 *   PATCH  /api/jobs/:id/matches/:resumeId/status   → set candidate status
 *   GET    /api/jobs/:id/statuses                   → get all candidate statuses for job
 */

import express from 'express';
import { z } from 'zod';
import { createJob, getJob, getAllJobs, deleteJob } from '../services/neo4j/jobService.js';
import { findTopMatches } from '../services/matchingService.js';
import { explainMatch } from '../services/ai/matchExplainer.js';
import { generateSkillGapPlan } from '../services/ai/skillGapAdvisor.js';
import { getResume } from '../services/neo4j/resumeService.js';
import { upsertApplicationStatus, getApplicationStatuses } from '../services/neo4j/applicationService.js';

const router = express.Router();

// ─── Zod Validation Schemas ────────────────────────────────────────────────────

/**
 * CreateJobSchema — validates POST /api/jobs body
 * Prevents empty/short inputs from reaching GPT (saves tokens + improves output quality)
 */
const CreateJobSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200),
  description: z.string().min(20, 'Description must be at least 20 characters').max(10000),
});

/**
 * StatusSchema — validates PATCH .../status body
 * Strict enum prevents typos from being stored in the graph
 */
const StatusSchema = z.object({
  status: z.enum(['reviewing', 'shortlisted', 'interviewing', 'rejected', 'offered'], {
    errorMap: () => ({ message: 'Status must be one of: reviewing, shortlisted, interviewing, rejected, offered' }),
  }),
});

// ─── CRUD ────────────────────────────────────────────────────────────────────

/**
 * POST /api/jobs — create a job posting with GPT skill extraction
 */
router.post('/', async (req, res, next) => {
  try {
    // Validate with Zod before touching any service
    const parsed = CreateJobSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        issues: parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
      });
    }
    const { title, description } = parsed.data;
    const job = await createJob(title, description);
    res.status(201).json(job);
  } catch (error) {
    next(error);
  }
});

/** GET /api/jobs — all jobs, newest first */
router.get('/', async (req, res, next) => {
  try {
    res.json(await getAllJobs());
  } catch (error) {
    next(error);
  }
});

/** GET /api/jobs/:id — single job with skills */
router.get('/:id', async (req, res, next) => {
  try {
    const job = await getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/jobs/:id
 * Removes the job node + all REQUIRES_SKILL relationships via DETACH DELETE.
 * Returns 204 No Content on success.
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await deleteJob(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Job not found' });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ─── Matching ─────────────────────────────────────────────────────────────────

/**
 * GET /api/jobs/:id/matches?top=N
 * Runs hybrid matching (graph 60% + vector 40%) for the given job.
 */
router.get('/:id/matches', async (req, res, next) => {
  try {
    const topN = parseInt(req.query.top as string) || 10;
    const matches = await findTopMatches(req.params.id, topN);
    res.json(matches);
  } catch (error) {
    next(error);
  }
});

// ─── AI Evaluation ────────────────────────────────────────────────────────────

/**
 * GET /api/jobs/:id/matches/:resumeId/explain
 * Generates AI evaluation: strengths, gaps, interview questions.
 * matchedSkills and missingSkills passed as comma-separated query params.
 */
router.get('/:id/matches/:resumeId/explain', async (req, res, next) => {
  try {
    const { id: jobId, resumeId } = req.params;
    const matchedSkills = req.query.matchedSkills
      ? (req.query.matchedSkills as string).split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const missingSkills = req.query.missingSkills
      ? (req.query.missingSkills as string).split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const result = await explainMatch(jobId, resumeId, matchedSkills, missingSkills);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ─── Skill Gap Learning Path ──────────────────────────────────────────────────

/**
 * GET /api/jobs/:id/gap-plan/:resumeId
 * Generates a week-by-week learning roadmap for the candidate's missing skills.
 */
router.get('/:id/gap-plan/:resumeId', async (req, res, next) => {
  try {
    const { id: jobId, resumeId } = req.params;
    const [job, resume] = await Promise.all([getJob(jobId), getResume(resumeId)]);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!resume) return res.status(404).json({ error: 'Resume not found' });

    const resumeSkillsLower = new Set(resume.skills.map(s => s.toLowerCase()));
    const missingSkills = job.skills.filter(s => !resumeSkillsLower.has(s.toLowerCase()));
    const plan = await generateSkillGapPlan(job.title, resume.skills, missingSkills);
    res.json(plan);
  } catch (error) {
    next(error);
  }
});

// ─── Candidate Status Tracking ────────────────────────────────────────────────

/**
 * PATCH /api/jobs/:id/matches/:resumeId/status
 * Sets or updates a candidate's pipeline status for this job.
 * Creates or updates the (Resume)-[:APPLIED_TO {status}]->(Job) relationship.
 * Body: { status: 'reviewing' | 'shortlisted' | 'interviewing' | 'rejected' | 'offered' }
 */
router.patch('/:id/matches/:resumeId/status', async (req, res, next) => {
  try {
    const { id: jobId, resumeId } = req.params;

    // Validate status value with Zod
    const parsed = StatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        issues: parsed.error.issues.map(i => i.message),
      });
    }

    const result = await upsertApplicationStatus(jobId, resumeId, parsed.data.status);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/jobs/:id/statuses
 * Returns all candidate statuses for this job as a map: { resumeId → status }
 * Fetched alongside match results so card badges are populated in one request.
 */
router.get('/:id/statuses', async (req, res, next) => {
  try {
    const statuses = await getApplicationStatuses(req.params.id);
    res.json(statuses);
  } catch (error) {
    next(error);
  }
});

export default router;
