import { driver } from '../../config/neo4j.js';
import { extractSkills } from '../ai/skillExtractor.js';
import { v4 as uuidv4 } from 'uuid';

export interface Job {
  id: string;
  title: string;
  description: string;
  skills: string[];
  createdAt: string;
}

export async function createJob(title: string, description: string): Promise<Job> {
  const session = driver.session();
  const id = uuidv4();
  
  try {
    // Extract skills
    const skills = await extractSkills(`${title}\n\n${description}`);
    
    // Create job node
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
    
    // Create skill nodes and relationships
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
      return null;
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

