/**
 * resumeService.ts — Resume Graph Operations (Neo4j) — Enhanced Schema
 *
 * Manages the full candidate graph. The schema is now richer:
 *
 *   (Resume)-[:HAS_SKILL]->(Skill)
 *   (Resume)-[:WORKED_AT {role, durationYears}]->(Company)
 *   (Resume)-[:HAS_DEGREE {degree, field}]->(Institution)
 *
 * All three node types (Skill, Company, Institution) use MERGE:
 *   → "Google" is ONE Company node shared across ALL resumes who worked there
 *   → "Python" is ONE Skill node connected to every resume that has it
 *   → This is the CORE POWER of a graph database — relationships are first-class
 *
 * Key graph queries enabled by this schema:
 *   "Find all resumes who worked at Google AND know Python"
 *   "Find all CS graduates with 3+ years of experience"
 *   "Most common career path for React developers in our pool"
 *
 * Resume interface is extended to include companies and education.
 */

import { driver } from '../../config/neo4j.js';
// Import types and extractFullProfile from skillExtractor — single source of truth
// Avoids redefining Company/Education interfaces that already exist there
import { extractFullProfile, Company, Education } from '../ai/skillExtractor.js';
import { v4 as uuidv4 } from 'uuid';

// ─── Types ─────────────────────────────────────────────────────────────────────

// Company and Education types are imported from skillExtractor.ts (single source of truth)
export type { Company, Education };

/**
 * Resume — enriched with companies and education
 *
 * The Resume interface now carries full profile information:
 *   skills     → string[]  (HAS_SKILL relationships)
 *   companies  → Company[] (WORKED_AT relationships)
 *   education  → Education[] (HAS_DEGREE relationships)
 */
export interface Resume {
  id: string;
  name: string;
  fileUrl: string;
  text: string;
  skills: string[];
  companies: Company[];
  education: Education[];
  qualityScore?: number;    // Resume quality score (0-100), set by resumeScorer
  createdAt: string;
}

// ─── Write Operations ─────────────────────────────────────────────────────────

/**
 * createResume — stores a parsed resume with full graph enrichment
 *
 * Flow:
 *  1. extractFullProfile(text) → GPT returns { skills, companies, education }
 *  2. CREATE Resume node
 *  3. MERGE Skill nodes → CREATE HAS_SKILL for each skill
 *  4. MERGE Company nodes → CREATE WORKED_AT (with role + durationYears) for each company
 *  5. MERGE Institution nodes → CREATE HAS_DEGREE (with degree + field) for each degree
 *
 * All in a single Neo4j session — connections are pooled, not recreated per write.
 *
 * @param name    - original filename
 * @param fileUrl - relative URL path
 * @param text    - full extracted resume text
 * @param qualityScore - optional AI quality score (0-100)
 */
export async function createResume(
  name: string,
  fileUrl: string,
  text: string,
  qualityScore?: number
): Promise<Resume> {
  const session = driver.session();
  const id = uuidv4();

  try {
    // One GPT call extracts all three data types simultaneously
    // Single call is ~2x faster than three sequential calls
    const profile = await extractFullProfile(text);
    const { skills, companies, education } = profile;

    // ── Create Resume node ──────────────────────────────────────────────────
    await session.run(
      `CREATE (r:Resume {
        id: $id,
        name: $name,
        fileUrl: $fileUrl,
        text: $text,
        qualityScore: $qualityScore,
        createdAt: datetime()
      })`,
      {
        id,
        name,
        fileUrl,
        // Text truncated for Neo4j storage — full text lives in ChromaDB vector chunks
        text: text.substring(0, 10000),
        qualityScore: qualityScore ?? null,
      }
    );

    // ── Skills → HAS_SKILL relationships ───────────────────────────────────
    // MERGE skill: one "Python" node for the entire graph (shared across all resumes)
    for (const skill of skills) {
      await session.run(
        `MATCH (r:Resume {id: $resumeId})
         MERGE (s:Skill {name: $skill})
         CREATE (r)-[:HAS_SKILL]->(s)`,
        { resumeId: id, skill }
      );
    }

    // ── Companies → WORKED_AT relationships ────────────────────────────────
    // Relationship properties (role, durationYears) live ON THE EDGE, not the node
    // This allows: "Google worked at by 5 candidates in different roles"
    for (const company of companies) {
      await session.run(
        `MATCH (r:Resume {id: $resumeId})
         MERGE (c:Company {name: $name})
         CREATE (r)-[:WORKED_AT {role: $role, durationYears: $durationYears}]->(c)`,
        {
          resumeId: id,
          name: company.name,
          role: company.role || 'Unknown',
          durationYears: company.durationYears || 0,
        }
      );
    }

    // ── Education → HAS_DEGREE relationships ───────────────────────────────
    // Degree and field stored on the RELATIONSHIP (not on Institution node)
    // Institution node is just a name — the credential details vary per person
    for (const edu of education) {
      await session.run(
        `MATCH (r:Resume {id: $resumeId})
         MERGE (inst:Institution {name: $institution})
         CREATE (r)-[:HAS_DEGREE {degree: $degree, field: $field}]->(inst)`,
        {
          resumeId: id,
          institution: edu.institution || 'Unknown',
          degree: edu.degree || 'Unknown',
          field: edu.field || 'Unknown',
        }
      );
    }

    return {
      id,
      name,
      fileUrl,
      text,
      skills,
      companies,
      education,
      qualityScore,
      createdAt: new Date().toISOString(),
    };
  } finally {
    await session.close(); // Always return connection to pool
  }
}

// ─── Read Operations ──────────────────────────────────────────────────────────

/**
 * getResume — fetches a single resume with full profile data
 *
 * Single Cypher query using 3x OPTIONAL MATCH to get skills, companies, and education.
 * OPTIONAL MATCH ensures the resume is returned even if any category is empty.
 * collect() aggregates multiple rows into arrays per category.
 */
export async function getResume(id: string): Promise<Resume | null> {
  const session = driver.session();

  try {
    const result = await session.run(
      `MATCH (r:Resume {id: $id})
       OPTIONAL MATCH (r)-[:HAS_SKILL]->(s:Skill)
       OPTIONAL MATCH (r)-[w:WORKED_AT]->(c:Company)
       OPTIONAL MATCH (r)-[d:HAS_DEGREE]->(inst:Institution)
       RETURN r,
              collect(DISTINCT s.name) as skills,
              collect(DISTINCT {name: c.name, role: w.role, durationYears: w.durationYears}) as companies,
              collect(DISTINCT {degree: d.degree, field: d.field, institution: inst.name}) as education`,
      { id }
    );

    if (result.records.length === 0) return null;

    const record = result.records[0];
    const resumeNode = record.get('r').properties;
    const skills = record.get('skills').filter((s: string | null) => s !== null);
    const companies = record.get('companies').filter((c: any) => c.name != null);
    const education = record.get('education').filter((e: any) => e.institution != null);

    return {
      id: resumeNode.id,
      name: resumeNode.name,
      fileUrl: resumeNode.fileUrl,
      text: resumeNode.text,
      skills,
      companies,
      education,
      qualityScore: resumeNode.qualityScore ?? undefined,
      createdAt: resumeNode.createdAt?.toString() || new Date().toISOString(),
    };
  } finally {
    await session.close();
  }
}

/**
 * getAllResumes — returns all resumes with full profile data, newest first
 */
export async function getAllResumes(): Promise<Resume[]> {
  const session = driver.session();

  try {
    const result = await session.run(
      `MATCH (r:Resume)
       OPTIONAL MATCH (r)-[:HAS_SKILL]->(s:Skill)
       OPTIONAL MATCH (r)-[w:WORKED_AT]->(c:Company)
       OPTIONAL MATCH (r)-[d:HAS_DEGREE]->(inst:Institution)
       RETURN r,
              collect(DISTINCT s.name) as skills,
              collect(DISTINCT {name: c.name, role: w.role, durationYears: w.durationYears}) as companies,
              collect(DISTINCT {degree: d.degree, field: d.field, institution: inst.name}) as education
       ORDER BY r.createdAt DESC`
    );

    return result.records.map(record => {
      const resumeNode = record.get('r').properties;
      const skills = record.get('skills').filter((s: string | null) => s !== null);
      const companies = record.get('companies').filter((c: any) => c.name != null);
      const education = record.get('education').filter((e: any) => e.institution != null);

      return {
        id: resumeNode.id,
        name: resumeNode.name,
        fileUrl: resumeNode.fileUrl,
        text: resumeNode.text,
        skills,
        companies,
        education,
        qualityScore: resumeNode.qualityScore ?? undefined,
        createdAt: resumeNode.createdAt?.toString() || new Date().toISOString(),
      };
    });
  } finally {
    await session.close();
  }
}

/**
 * updateResumeQualityScore — updates the quality score on an existing Resume node
 * Called after resumeScorer runs asynchronously post-upload
 */
export async function updateResumeQualityScore(resumeId: string, score: number): Promise<void> {
  const session = driver.session();
  try {
    await session.run(
      `MATCH (r:Resume {id: $resumeId}) SET r.qualityScore = $score`,
      { resumeId, score }
    );
  } finally {
    await session.close();
  }
}

// ─── Delete Operations ─────────────────────────────────────────────────────────

/**
 * deleteResume — removes a resume and all its relationships from Neo4j
 *
 * DETACH DELETE is the key Cypher clause:
 *   - Without DETACH: deleting a node with relationships throws an error
 *   - With DETACH: all incoming/outgoing relationships are removed first,
 *     then the node is deleted — atomic and clean
 *
 * Note: Skill/Company/Institution nodes are NOT deleted — they're shared entities.
 *   If "Google" is referenced by 10 resumes and we delete one, the other 9 keep
 *   their WORKED_AT → Google relationship intact.
 *
 * @param id - UUID of the resume to delete
 * @returns  - true if deleted, false if not found
 */
export async function deleteResume(id: string): Promise<boolean> {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (r:Resume {id: $id})
       WITH r, r.id as deletedId
       DETACH DELETE r
       RETURN deletedId`,
      { id }
    );
    // If the MATCH found nothing, records array will be empty
    return result.records.length > 0;
  } finally {
    await session.close();
  }
}

// ─── Reprocess Operations ──────────────────────────────────────────────────────

/**
 * reextractResumeProfile — clears and re-runs GPT extraction on an existing resume
 *
 * When to use:
 *   - Initial GPT extraction returned too few skills (rate limit, bad response)
 *   - User wants to re-score with updated GPT model
 *   - Resume text was partially corrupted on first upload
 *
 * Process:
 *   1. Remove all HAS_SKILL, WORKED_AT, HAS_DEGREE relationships (not the node itself)
 *   2. Re-run extractFullProfile() on the stored text
 *   3. Re-create relationships with fresh data
 *   4. Return updated skills/companies/education for the response
 *
 * The Resume node itself (id, name, fileUrl, text, createdAt) is PRESERVED.
 * Only the extracted profile data is refreshed.
 */
export async function reextractResumeProfile(
  resumeId: string,
  text: string
): Promise<{ skills: string[]; companies: any[]; education: any[] }> {
  const session = driver.session();
  try {
    // Step 1: Remove all existing profile relationships (but keep the node)
    // We remove only outgoing relationships from this Resume node
    await session.run(
      `MATCH (r:Resume {id: $resumeId})
       OPTIONAL MATCH (r)-[rs:HAS_SKILL]->()  DELETE rs
       WITH r
       OPTIONAL MATCH (r)-[rw:WORKED_AT]->()  DELETE rw
       WITH r
       OPTIONAL MATCH (r)-[rd:HAS_DEGREE]->() DELETE rd`,
      { resumeId }
    );

    // Step 2: Re-run GPT extraction on the resume text
    const profile = await extractFullProfile(text);
    const { skills, companies, education } = profile;

    // Step 3: Re-create skill relationships
    for (const skill of skills) {
      await session.run(
        `MATCH (r:Resume {id: $resumeId})
         MERGE (s:Skill {name: $skill})
         CREATE (r)-[:HAS_SKILL]->(s)`,
        { resumeId, skill }
      );
    }

    // Step 4: Re-create company relationships
    for (const company of companies) {
      await session.run(
        `MATCH (r:Resume {id: $resumeId})
         MERGE (c:Company {name: $name})
         CREATE (r)-[:WORKED_AT {role: $role, durationYears: $durationYears}]->(c)`,
        { resumeId, name: company.name, role: company.role || 'Unknown', durationYears: company.durationYears || 0 }
      );
    }

    // Step 5: Re-create education relationships
    for (const edu of education) {
      await session.run(
        `MATCH (r:Resume {id: $resumeId})
         MERGE (inst:Institution {name: $institution})
         CREATE (r)-[:HAS_DEGREE {degree: $degree, field: $field}]->(inst)`,
        { resumeId, institution: edu.institution || 'Unknown', degree: edu.degree || 'Unknown', field: edu.field || 'Unknown' }
      );
    }

    return { skills, companies, education };
  } finally {
    await session.close();
  }
}

