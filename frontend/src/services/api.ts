/**
 * api.ts — Frontend HTTP Service Layer (Enhanced)
 *
 * All API calls to the Express backend from the React frontend.
 * Single Axios instance with shared config.
 *
 * New endpoints added:
 *  - resumeApi.getMatches()              → hybrid matching results
 *  - jobApi.explainMatch()               → AI evaluation (strengths, gaps, questions)
 *  - jobApi.getSkillGapPlan()            → personalized learning roadmap
 *  - chatApi.sendMessage()               → standard (non-streaming) chat
 *  The streaming chat endpoint is called directly with fetch() in ResumeChat.tsx
 *  because Axios doesn't natively support SSE/ReadableStream responses.
 */

import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Single Axios instance — shared across all API functions.
 * Benefits: one place to add auth headers, request interceptors, error handling.
 */
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Type Definitions ─────────────────────────────────────────────────────────

export interface Job {
  id: string;
  title: string;
  description: string;
  skills: string[];
  createdAt: string;
}

export interface Company {
  name: string;
  role: string;
  durationYears: number;
}

export interface Education {
  degree: string;
  field: string;
  institution: string;
}

export interface ScoreBreakdown {
  structure: number;
  specificity: number;
  skillsDepth: number;
  readability: number;
  grade: 'A' | 'B' | 'C' | 'D';
  feedback: string;
}

export interface Resume {
  id: string;
  name: string;
  fileUrl: string;
  text: string;
  skills: string[];
  companies: Company[];      // NEW: work history from graph extraction
  education: Education[];    // NEW: degrees from graph extraction
  qualityScore?: number;     // NEW: 0-100 AI quality score
  scoreBreakdown?: ScoreBreakdown; // NEW: per-dimension breakdown (returned on upload)
  createdAt: string;
}

/** Result of the hybrid matching engine for one resume */
export interface MatchResult {
  resumeId: string;
  resumeName: string;
  matchPercentage: number;
  matchedSkills: string[];
  missingSkills: string[];
  score: number;
}

/** AI evaluation of a candidate for a specific job */
export interface MatchExplanation {
  explanation: string;       // Markdown string (strengths, gaps, interview questions)
  jobTitle: string;
  resumeName: string;
  matchedSkills: string[];
  missingSkills: string[];
}

/** Personalized skill gap learning plan */
export interface SkillGapPlan {
  plan: string;              // Markdown roadmap (week-by-week learning)
  missingSkills: string[];
  estimatedWeeks: number;   // Quick estimate for the UI badge
}

/** Candidate pipeline status for a job application */
export type CandidateStatus = 'reviewing' | 'shortlisted' | 'interviewing' | 'rejected' | 'offered';

// ─── Job API ──────────────────────────────────────────────────────────────────

export const jobApi = {
  /** POST /api/jobs */
  create: async (title: string, description: string): Promise<Job> => {
    const response = await api.post<Job>('/jobs', { title, description });
    return response.data;
  },

  /** GET /api/jobs */
  getAll: async (): Promise<Job[]> => {
    const response = await api.get<Job[]>('/jobs');
    return response.data;
  },

  /** GET /api/jobs/:id */
  getById: async (id: string): Promise<Job> => {
    const response = await api.get<Job>(`/jobs/${id}`);
    return response.data;
  },

  /**
   * GET /api/jobs/:id/matches/:resumeId/explain
   *
   * Sends matchedSkills and missingSkills as query params (computed by prior match call).
   * The server uses these to skip re-running the full matching algorithm.
   */
  explainMatch: async (
    jobId: string,
    resumeId: string,
    matchedSkills: string[],
    missingSkills: string[]
  ): Promise<MatchExplanation> => {
    const response = await api.get<MatchExplanation>(
      `/jobs/${jobId}/matches/${resumeId}/explain`,
      {
        params: {
          matchedSkills: matchedSkills.join(','),
          missingSkills: missingSkills.join(','),
        },
      }
    );
    return response.data;
  },

  /**
   * GET /api/jobs/:id/gap-plan/:resumeId
   * Returns a personalized markdown learning roadmap for missing skills.
   */
  getSkillGapPlan: async (jobId: string, resumeId: string): Promise<SkillGapPlan> => {
    const response = await api.get<SkillGapPlan>(`/jobs/${jobId}/gap-plan/${resumeId}`);
    return response.data;
  },

  /** DELETE /api/jobs/:id */
  delete: async (id: string): Promise<void> => {
    await api.delete(`/jobs/${id}`);
  },

  /**
   * PATCH /api/jobs/:id/matches/:resumeId/status
   * Sets candidate pipeline status: reviewing | shortlisted | interviewing | rejected | offered
   */
  updateCandidateStatus: async (
    jobId: string,
    resumeId: string,
    status: CandidateStatus
  ): Promise<void> => {
    await api.patch(`/jobs/${jobId}/matches/${resumeId}/status`, { status });
  },

  /** GET /api/jobs/:id/statuses → { resumeId: status } map */
  getCandidateStatuses: async (jobId: string): Promise<Record<string, CandidateStatus>> => {
    const response = await api.get<Record<string, CandidateStatus>>(`/jobs/${jobId}/statuses`);
    return response.data;
  },
};

// ─── Resume API ────────────────────────────────────────────────────────────────

export const resumeApi = {
  /**
   * POST /api/resumes — multipart file upload
   * Response now includes qualityScore and scoreBreakdown in addition to resume data.
   */
  upload: async (file: File): Promise<Resume> => {
    const formData = new FormData();
    formData.append('resume', file);
    const response = await api.post<Resume>('/resumes', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  /** GET /api/resumes */
  getAll: async (): Promise<Resume[]> => {
    const response = await api.get<Resume[]>('/resumes');
    return response.data;
  },

  /** GET /api/resumes/:id */
  getById: async (id: string): Promise<Resume> => {
    const response = await api.get<Resume>(`/resumes/${id}`);
    return response.data;
  },

  /** GET /api/jobs/:jobId/matches?top=N */
  getMatches: async (jobId: string, top: number = 10): Promise<MatchResult[]> => {
    const response = await api.get<MatchResult[]>(`/jobs/${jobId}/matches`, {
      params: { top },
    });
    return response.data;
  },

  /** DELETE /api/resumes/:id — deletes Neo4j node + ChromaDB chunks + disk file */
  delete: async (id: string): Promise<void> => {
    await api.delete(`/resumes/${id}`);
  },

  /**
   * POST /api/resumes/:id/reprocess
   * Re-runs GPT extraction + scoring without re-uploading the file.
   * Returns the updated Resume with new qualityScore and scoreBreakdown.
   */
  reprocess: async (id: string): Promise<Resume> => {
    const response = await api.post<Resume>(`/resumes/${id}/reprocess`);
    return response.data;
  },
};

// ─── Chat API ──────────────────────────────────────────────────────────────────

export const chatApi = {
  /**
   * POST /api/chat/:resumeId — standard (non-streaming) chat
   * Use this as a fallback. Prefer the streaming endpoint in the UI.
   */
  sendMessage: async (
    resumeId: string,
    message: string,
    sessionId?: string
  ): Promise<{ response: string; sessionId: string }> => {
    const response = await api.post<{ response: string; sessionId: string }>(
      `/chat/${resumeId}`,
      { message, sessionId }
    );
    return response.data;
  },

  /** GET /api/chat/:resumeId/history/:sessionId */
  getHistory: async (resumeId: string, sessionId: string) => {
    const response = await api.get(`/chat/${resumeId}/history/${sessionId}`);
    return response.data;
  },
};
