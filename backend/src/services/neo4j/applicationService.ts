/**
 * applicationService.ts — Candidate Application Status Management (Neo4j)
 *
 * Manages the APPLIED_TO relationship between Resume and Job nodes.
 *
 * Graph schema added here:
 *   (Resume)-[:APPLIED_TO {status, updatedAt}]->(Job)
 *
 * Status lifecycle:
 *   (none) → reviewing → shortlisted → interviewing → rejected
 *                                    ↗ offered
 *
 * Why store status as a relationship property (not a separate node)?
 *   The relationship already exists conceptually (resume applied to job).
 *   Adding properties to it keeps the data co-located and avoids
 *   an extra node type just for metadata.
 *
 * Why MERGE instead of CREATE for the relationship?
 *   A candidate can only have ONE status per job. MERGE ensures idempotency —
 *   calling upsertStatus twice updates rather than duplicating the relationship.
 */

import { driver } from '../../config/neo4j.js';

export type CandidateStatus = 'reviewing' | 'shortlisted' | 'interviewing' | 'rejected' | 'offered';

export interface ApplicationStatus {
  resumeId: string;
  jobId: string;
  status: CandidateStatus;
  updatedAt: string;
}

/**
 * upsertApplicationStatus — sets or updates a candidate's status for a job
 *
 * MERGE creates the relationship if it doesn't exist, or matches it if it does.
 * SET updates the properties in both cases.
 *
 * @param jobId    - UUID of the job posting
 * @param resumeId - UUID of the candidate's resume
 * @param status   - new status value
 */
export async function upsertApplicationStatus(
  jobId: string,
  resumeId: string,
  status: CandidateStatus
): Promise<ApplicationStatus> {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (j:Job {id: $jobId}), (r:Resume {id: $resumeId})
       MERGE (r)-[a:APPLIED_TO]->(j)
       SET a.status = $status, a.updatedAt = datetime()
       RETURN a.status as status, a.updatedAt as updatedAt`,
      { jobId, resumeId, status }
    );

    if (result.records.length === 0) {
      throw new Error(`Job ${jobId} or Resume ${resumeId} not found`);
    }

    return {
      resumeId,
      jobId,
      status: result.records[0].get('status') as CandidateStatus,
      updatedAt: result.records[0].get('updatedAt').toString(),
    };
  } finally {
    await session.close();
  }
}

/**
 * getApplicationStatuses — returns all candidate statuses for a given job
 *
 * Returns a map of { resumeId → status } for fast O(1) lookup in the frontend.
 * This is fetched alongside match results so every match card knows its status.
 *
 * @param jobId - UUID of the job
 * @returns     - { [resumeId]: CandidateStatus }
 */
export async function getApplicationStatuses(
  jobId: string
): Promise<Record<string, CandidateStatus>> {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (r:Resume)-[a:APPLIED_TO]->(j:Job {id: $jobId})
       RETURN r.id as resumeId, a.status as status`,
      { jobId }
    );

    const statuses: Record<string, CandidateStatus> = {};
    result.records.forEach(record => {
      statuses[record.get('resumeId')] = record.get('status') as CandidateStatus;
    });
    return statuses;
  } finally {
    await session.close();
  }
}
