/**
 * matchingService.ts — Hybrid Resume-Job Matching Engine
 *
 * This is the core algorithmic service of the platform.
 * It combines two complementary matching strategies:
 *
 * 1. GRAPH-BASED (Neo4j): Measures exact skill keyword overlap
 *    - Precision: if a resume says "React" and the job needs "React", it's a match
 *    - Weakness: "Machine Learning" ≠ "ML" in keyword terms
 *
 * 2. VECTOR-BASED (ChromaDB): Measures semantic similarity via embeddings
 *    - Recall: captures synonyms, related concepts, domain context
 *    - Weakness: two unrelated documents can have moderate similarity
 *
 * Final score = 60% graph + 40% vector (heuristic weighting)
 * The hybrid fusion balances precision (keyword) and recall (semantic).
 */

import { driver } from '../config/neo4j.js';
import { chromaClient, RESUME_COLLECTION_NAME } from '../config/chroma.js';
import { embedText } from './ai/embedder.js';
import { getJob } from './neo4j/jobService.js';
import { getResume } from './neo4j/resumeService.js';

/**
 * MatchResult — the shape returned by the matching engine per resume
 */
export interface MatchResult {
  resumeId: string;
  resumeName: string;
  matchPercentage: number; // Final combined score (0-100)
  matchedSkills: string[]; // Skills the resume has that the job requires
  missingSkills: string[]; // Skills the job requires but the resume lacks
  score: number;           // Raw combined score (same value as matchPercentage after fusion)
}

/**
 * findTopMatches — given a job ID, return the N best matching resumes
 *
 * Algorithm:
 *  Phase 1: Pull all resumes + skills from Neo4j graph → compute overlap scores
 *  Phase 2: Embed job description → query ChromaDB → get vector similarity scores
 *  Phase 3: Fuse scores with weights → sort → return top N
 */
export async function findTopMatches(jobId: string, topN: number = 10): Promise<MatchResult[]> {
  // Each route handler should have its own session (NOT shared) to avoid
  // cross-request data contamination. Sessions are lightweight wrappers.
  const session = driver.session();
  
  try {
    // Fetch the target job with its extracted required skills from Neo4j
    const job = await getJob(jobId);
    if (!job) {
      throw new Error('Job not found');
    }
    
    // ─── Phase 1: Graph-Based Skill Overlap ─────────────────────────────────
    
    // Single Cypher query fetches ALL resumes and their skills in one roundtrip.
    // OPTIONAL MATCH is used so that resumes with ZERO skills still appear
    // (with null values in the skills array instead of being excluded entirely).
    const resumeResult = await session.run(
      `MATCH (r:Resume)
       OPTIONAL MATCH (r)-[:HAS_SKILL]->(s:Skill)
       RETURN r.id as resumeId, r.name as resumeName, collect(s.name) as skills`
    );
    
    // Convert job skills to lowercase Set for O(1) lookup during intersection
    const jobSkills = new Set(job.skills.map(s => s.toLowerCase()));
    const matches: MatchResult[] = [];
    
    for (const record of resumeResult.records) {
      const resumeId = record.get('resumeId');
      const resumeName = record.get('resumeName');
      
      // Filter nulls that appear when a resume has no skill relationships
      const resumeSkills = record.get('skills').filter((s: string | null) => s !== null);
      const resumeSkillsSet = new Set(resumeSkills.map((s: string) => s.toLowerCase()));
      
      // Partition job's required skills into matched vs missing
      const matchedSkills = job.skills.filter(js => resumeSkillsSet.has(js.toLowerCase()));
      const missingSkills = job.skills.filter(js => !resumeSkillsSet.has(js.toLowerCase()));
      
      // Graph match %= matched skills / total required skills
      // Guard against division-by-zero when job has no listed skills
      const graphMatchPct = job.skills.length > 0
        ? (matchedSkills.length / job.skills.length) * 100
        : 0;
      
      matches.push({
        resumeId,
        resumeName,
        matchPercentage: graphMatchPct,
        matchedSkills,
        missingSkills,
        score: graphMatchPct, // Will be updated by Phase 3 vector fusion
      });
    }
    
    // ─── Phase 2: Vector Similarity ─────────────────────────────────────────
    
    try {
      // Embed the FULL job description to capture semantic meaning
      // This vector represents "what kind of work / domain / tech context is this job about"
      const jobEmbedding = await embedText(`${job.title}\n\n${job.description}`);
      
      let collection;
      try {
        collection = await chromaClient.getCollection({ name: RESUME_COLLECTION_NAME } as any);
      } catch {
        // ChromaDB collection missing (e.g., first run, Docker not running)
        // Gracefully degrade to graph-only scores
        console.log('Chroma collection not available, using graph-only matching');
        return matches.sort((a, b) => b.score - a.score).slice(0, topN);
      }
      
      // Query ChromaDB for resume chunks closest to the job embedding
      // nResults = topN * 2: over-fetch candidates so we have enough to re-rank
      const queryResult = await collection.query({
        queryEmbeddings: [jobEmbedding],
        nResults: Math.min(topN * 2, matches.length),
      });
      
      // Build a map of resumeId → vector similarity score for fast O(1) merge
      const vectorScores = new Map<string, number>();
      if (queryResult.ids && queryResult.ids[0]) {
        queryResult.ids[0].forEach((id: string, idx: number) => {
          const distances = queryResult.distances?.[0];
          if (distances) {
            // ChromaDB returns L2 (Euclidean) distance; convert to similarity:
            // L2 distance for normalized vectors is in [0, 2]; divide by 2 to get [0, 1]
            // Then invert: high similarity = low distance
            const similarity = 1 - (distances[idx] / 2);
            vectorScores.set(id, similarity * 100); // Scale to 0-100 to match graph score
          }
        });
      }
      
      // ─── Phase 3: Score Fusion ─────────────────────────────────────────────
      
      matches.forEach(match => {
        const vectorScore = vectorScores.get(match.resumeId) || 0;
        
        // Weighted blend: 60% graph (exact skills) + 40% vector (semantic meaning)
        // Rationale: explicit skill match is more reliable than semantic similarity;
        // vector score catches synonyms and context the graph misses.
        match.score = (match.matchPercentage * 0.6) + (vectorScore * 0.4);
        match.matchPercentage = match.score; // Expose the fused score as the public-facing metric
      });
    } catch (error) {
      // Vector phase is optional — if OpenAI or Chroma fails, fall back to graph-only
      console.warn('Vector similarity calculation failed, using graph-only scores:', error);
    }
    
    // Sort by descending combined score and return the top N
    return matches
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
      
  } finally {
    // ALWAYS close the session — returns the connection back to the Neo4j pool
    await session.close();
  }
}
