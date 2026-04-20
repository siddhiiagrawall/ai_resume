/**
 * jobService.ts — Job Posting Graph Operations (Neo4j)
 *
 * Manages Job nodes in the Neo4j graph — mirroring the Resume pattern.
 *
 * Graph schema managed here:
 *   (Job)-[:REQUIRES_SKILL]->(Skill)
 *
 * The same Skill nodes are shared between Jobs and Resumes.
 * This is the foundation for graph-based matching:
 * "Find all Resumes whose HAS_SKILL relationships overlap with
 *  a Job's REQUIRES_SKILL relationships."
 *
 * In Cypher:
 *   MATCH (j:Job {id: $jobId})-[:REQUIRES_SKILL]->(s:Skill)<-[:HAS_SKILL]-(r:Resume)
 *   RETURN r, collect(s) as matchedSkills
 */

import { driver } from '../../config/neo4j.js';
import { extractSkills } from '../ai/skillExtractor.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Job — canonical job type used across the backend
 */
export interface Job {
  id: string;          // UUID v4 — unique job identifier
  title: string;       // e.g., "Senior React Developer"
  description: string; // Full job description text (used for skill extraction)
  skills: string[];    // AI-extracted required skills (stored as graph relationships)
  createdAt: string;
}

/**
 * createJob — creates a job posting and extracts its required skills
 *
 * Same pattern as createResume:
 *  1. Extract skills from job title + description via GPT
 *  2. Create Job node in Neo4j
 *  3. MERGE Skill nodes and create REQUIRES_SKILL relationships
 *
 * @param title       - job title (e.g., "Backend Engineer - Node.js")
 * @param description - full job description text (responsibilities, requirements, etc.)
 */
export async function createJob(title: string, description: string): Promise<Job> {
  const session = driver.session();
  const id = uuidv4();
  
  try {
    // Concatenate title + description for richer context during skill extraction
    // Title alone might not contain all required skills ("Senior React Developer"
    // → "React", "JavaScript" from title; "GraphQL, REST APIs" from description)
    const skills = await extractSkills(`${title}\n\n${description}`);
    
    // Create the Job node — no text truncation needed (descriptions are typically shorter)
    await session.run(
      `CREATE (j:Job {
        id: $id,
        title: $title,
        description: $description,
        createdAt: datetime()
      })
      RETURN j`,
      { id, title, description }
    );
    
    // Create REQUIRES_SKILL relationships
    // MERGE skill nodes — "Python" is the SAME node whether it appears in 100 jobs or 1
    // This allows bidirectional graph queries: Job→Skills→Resumes and Resume→Skills→Jobs
    for (const skill of skills) {
      await session.run(
        `MATCH (j:Job {id: $jobId})
         MERGE (s:Skill {name: $skill})
         CREATE (j)-[:REQUIRES_SKILL]->(s)`,
        { jobId: id, skill }
      );
    }
    
    const job: Job = {
      id,
      title,
      description,
      skills,
      createdAt: new Date().toISOString(),
    };
    
    return job;
  } finally {
    await session.close();
  }
}

/**
 * getJob — retrieve a single job with its required skills
 *
 * OPTIONAL MATCH ensures we return the job even if no skill relationships
 * were created (e.g., if skill extraction failed).
 */
export async function getJob(id: string): Promise<Job | null> {
  const session = driver.session();
  
  try {
    const result = await session.run(
      `MATCH (j:Job {id: $id})
       OPTIONAL MATCH (j)-[:REQUIRES_SKILL]->(s:Skill)
       RETURN j, collect(s.name) as skills`,
      { id }
    );
    
    if (result.records.length === 0) {
      return null; // Job not found → HTTP 404
    }
    
    const record = result.records[0];
    const jobNode = record.get('j').properties;
    const skills = record.get('skills').filter((s: string | null) => s !== null);
    
    return {
      id: jobNode.id,
      title: jobNode.title,
      description: jobNode.description,
      skills,
      createdAt: jobNode.createdAt?.toString() || new Date().toISOString(),
    };
  } finally {
    await session.close();
  }
}

/**
 * getAllJobs — returns all job postings, newest first
 *
 * Production note: this is a full scan (no pagination).
 * Add SKIP/LIMIT for large datasets.
 */
export async function getAllJobs(): Promise<Job[]> {
  const session = driver.session();
  
  try {
    const result = await session.run(
      `MATCH (j:Job)
       OPTIONAL MATCH (j)-[:REQUIRES_SKILL]->(s:Skill)
       RETURN j, collect(s.name) as skills
       ORDER BY j.createdAt DESC`
    );
    
    return result.records.map(record => {
      const jobNode = record.get('j').properties;
      const skills = record.get('skills').filter((s: string | null) => s !== null);
      
      return {
        id: jobNode.id,
        title: jobNode.title,
        description: jobNode.description,
        skills,
        createdAt: jobNode.createdAt?.toString() || new Date().toISOString(),
      };
    });
  } finally {
    await session.close();
  }
}

/**
 * deleteJob — removes a job posting and all its REQUIRES_SKILL relationships
 *
 * DETACH DELETE cascades relationship removal before node deletion.
 * Skill nodes are preserved — they're shared across all jobs and resumes.
 *
 * @param id - UUID of the job to delete
 * @returns  - true if deleted, false if not found
 */
export async function deleteJob(id: string): Promise<boolean> {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (j:Job {id: $id})
       WITH j, j.id as deletedId
       DETACH DELETE j
       RETURN deletedId`,
      { id }
    );
    return result.records.length > 0;
  } finally {
    await session.close();
  }
}
