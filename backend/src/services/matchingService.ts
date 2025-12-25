import { driver } from '../config/neo4j.js';
import { chromaClient, RESUME_COLLECTION_NAME } from '../config/chroma.js';
import { embedText } from './ai/embedder.js';
import { getJob } from './neo4j/jobService.js';
import { getResume } from './neo4j/resumeService.js';

export interface MatchResult {
  resumeId: string;
  resumeName: string;
  matchPercentage: number;
  matchedSkills: string[];
  missingSkills: string[];
  score: number;
}

export async function findTopMatches(jobId: string, topN: number = 10): Promise<MatchResult[]> {
  const session = driver.session();
  
  try {
    // Get job and its required skills
    const job = await getJob(jobId);
    if (!job) {
      throw new Error('Job not found');
    }
    
    // Get all resumes with their skills from Neo4j
    const resumeResult = await session.run(
      `MATCH (r:Resume)
       OPTIONAL MATCH (r)-[:HAS_SKILL]->(s:Skill)
       RETURN r.id as resumeId, r.name as resumeName, collect(s.name) as skills`
    );
    
    const jobSkills = new Set(job.skills.map(s => s.toLowerCase()));
    const matches: MatchResult[] = [];
    
    // Calculate graph-based match (skill overlap)
    for (const record of resumeResult.records) {
      const resumeId = record.get('resumeId');
      const resumeName = record.get('resumeName');
      const resumeSkills = record.get('skills').filter((s: string | null) => s !== null);
      
      const resumeSkillsSet = new Set(resumeSkills.map((s: string) => s.toLowerCase()));
      
      // Calculate matched and missing skills
      const matchedSkills = job.skills.filter(js => 
        resumeSkillsSet.has(js.toLowerCase())
      );
      const missingSkills = job.skills.filter(js => 
        !resumeSkillsSet.has(js.toLowerCase())
      );
      
      // Graph match percentage
      const graphMatchPct = job.skills.length > 0
        ? (matchedSkills.length / job.skills.length) * 100
        : 0;
      
      matches.push({
        resumeId,
        resumeName,
        matchPercentage: graphMatchPct,
        matchedSkills,
        missingSkills,
        score: graphMatchPct, // Will be enhanced with vector similarity
      });
    }
    
    // Enhance with vector similarity
    try {
      const jobEmbedding = await embedText(`${job.title}\n\n${job.description}`);
      let collection;
      try {
        collection = await chromaClient.getCollection({ name: RESUME_COLLECTION_NAME } as any);
      } catch {
        // Collection doesn't exist, skip vector matching
        console.log('Chroma collection not available, using graph-only matching');
        return matches.sort((a, b) => b.score - a.score).slice(0, topN);
      }
      
      // Query similar resumes
      const queryResult = await collection.query({
        queryEmbeddings: [jobEmbedding],
        nResults: Math.min(topN * 2, matches.length), // Get more for re-ranking
      });
      
      // Create a map of resumeId -> vector similarity
      const vectorScores = new Map<string, number>();
      if (queryResult.ids && queryResult.ids[0]) {
        queryResult.ids[0].forEach((id: string, idx: number) => {
          const distances = queryResult.distances?.[0];
          if (distances) {
            // Convert distance to similarity (1 - normalized distance)
            const similarity = 1 - (distances[idx] / 2); // Normalize to 0-1
            vectorScores.set(id, similarity * 100); // Convert to percentage
          }
        });
      }
      
      // Combine graph and vector scores
      matches.forEach(match => {
        const vectorScore = vectorScores.get(match.resumeId) || 0;
        // Weighted combination: 60% graph, 40% vector
        match.score = (match.matchPercentage * 0.6) + (vectorScore * 0.4);
        match.matchPercentage = match.score; // Update match percentage
      });
    } catch (error) {
      console.warn('Vector similarity calculation failed, using graph-only scores:', error);
    }
    
    // Sort by combined score and return top N
    return matches
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
      
  } finally {
    await session.close();
  }
}

