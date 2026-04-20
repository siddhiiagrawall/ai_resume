/**
 * matchExplainer.ts — AI-Powered Match Evaluation Service
 *
 * Takes a job description and a candidate's resume content and asks GPT to
 * generate a structured, professional evaluation of why the candidate is or
 * isn't a good fit for the role.
 *
 * Why this feature matters for interviewers/recruiters:
 *   A raw score (84% match) tells you nothing about WHY.
 *   This service bridges that gap: instead of just ranking candidates,
 *   it explains the ranking in plain English.
 *
 * Output format (Markdown):
 *   ## ✅ Strengths
 *   - Point 1
 *   ## ⚠️ Gaps & Concerns
 *   - Point 1
 *   ## 💬 Suggested Interview Questions
 *   1. Question based on a gap
 *
 * Architecture note:
 *   This is a "generation" task (not extraction), so temperature is higher (0.4)
 *   to allow more natural language while still being structured.
 *   We use GPT-4o-mini for cost efficiency — the prompt is structured enough
 *   that the smaller model produces excellent results.
 */

import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { getJob } from '../neo4j/jobService.js';
import { searchResumeChunks } from '../vector/resumeVectorService.js';
import { getResume } from '../neo4j/resumeService.js';
import dotenv from 'dotenv';

dotenv.config();

// Temperature 0.4: structured but natural — deterministic enough for consistent
// formatting, creative enough for non-robotic prose
const model = new ChatOpenAI({
  modelName: 'gpt-4o-mini',
  temperature: 0.4,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

/**
 * EXPLAINER_PROMPT — creates the evaluation prompt
 *
 * We inject:
 *  - Job title + description (what the employer needs)
 *  - Required skills list (from Neo4j graph extraction)
 *  - candidate's matched vs missing skills (from hybrid matching)
 *  - Candidate's resume text chunks (from ChromaDB — most relevant sections)
 *
 * Output is ALWAYS in Markdown with the 3 required sections.
 * The strict format instruction prevents GPT from adding filler prose.
 */
const EXPLAINER_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are an expert technical recruiter AI. Analyze how well a candidate fits a job role and provide a structured evaluation.
Always respond in this exact Markdown format:

## ✅ Strengths
(List 3-5 specific strengths based on the resume content and job requirements)

## ⚠️ Gaps & Concerns
(List 2-4 specific gaps or concerns)

## 💬 Suggested Interview Questions
(List 3-5 targeted questions to probe the gaps or verify the strengths)

Be specific — reference actual skills, technologies, and experiences from the resume. Avoid generic statements.`,
  ],
  [
    'human',
    `JOB TITLE: {jobTitle}

JOB DESCRIPTION:
{jobDescription}

REQUIRED SKILLS: {requiredSkills}

CANDIDATE'S MATCHED SKILLS: {matchedSkills}
CANDIDATE'S MISSING SKILLS: {missingSkills}

RESUME CONTENT (most relevant sections):
{resumeContext}

Provide the structured evaluation.`,
  ],
]);

/**
 * ExplainMatchResult — structured return type
 */
export interface ExplainMatchResult {
  explanation: string; // Markdown string with strengths, gaps, interview questions
  jobTitle: string;
  resumeName: string;
  matchedSkills: string[];
  missingSkills: string[];
}

/**
 * explainMatch — generates an AI evaluation of a candidate for a specific job
 *
 * Called when a recruiter clicks "View AI Evaluation" on a match card.
 * Fetches all required data in parallel (job + resume metadata + resume chunks)
 * to minimize latency.
 *
 * @param jobId      - UUID of the job posting
 * @param resumeId   - UUID of the candidate's resume
 * @param matchedSkills - Skills the candidate already has (from matchingService)
 * @param missingSkills - Skills the candidate is missing (from matchingService)
 * @returns           - ExplainMatchResult with markdown explanation
 */
export async function explainMatch(
  jobId: string,
  resumeId: string,
  matchedSkills: string[],
  missingSkills: string[]
): Promise<ExplainMatchResult> {
  // Fetch job, resume metadata, and resume content chunks in PARALLEL
  // Promise.all runs all three concurrently instead of sequentially
  // This reduces latency from (A + B + C)ms to max(A, B, C)ms
  //
  // FIX: The ChromaDB query must be meaningful natural-language text, NOT a UUID.
  // We first fetch job + resume, then use those details to build a semantic query.
  // getJob and getResume run in parallel; then we query ChromaDB with actual text.
  const [job, resume] = await Promise.all([
    getJob(jobId),
    getResume(resumeId),
  ]);

  if (!job) throw new Error(`Job ${jobId} not found`);
  if (!resume) throw new Error(`Resume ${resumeId} not found`);

  // Build a meaningful semantic query from job context:
  // Combining job title + top required skills gives ChromaDB the right signal
  // to surface the resume sections most relevant to this specific role.
  const semanticQuery = `${job.title} ${job.skills.join(' ')} experience skills`;
  const relevantChunks = await searchResumeChunks(resumeId, semanticQuery, 6);

  // Join the top 6 retrieved resume chunks into a single context string
  const resumeContext = relevantChunks.map(c => c.text).join('\n\n');

  // Build and invoke the evaluation chain
  const chain = EXPLAINER_PROMPT.pipe(model);
  const response = await chain.invoke({
    jobTitle: job.title,
    jobDescription: job.description,
    requiredSkills: job.skills.join(', '),
    matchedSkills: matchedSkills.join(', ') || 'None identified',
    missingSkills: missingSkills.join(', ') || 'None — strong match!',
    resumeContext,
  });

  return {
    explanation: response.content as string,
    jobTitle: job.title,
    resumeName: resume.name,
    matchedSkills,
    missingSkills,
  };
}
