import { driver } from '../../config/neo4j.js';
import { extractSkills } from '../ai/skillExtractor.js';
import { v4 as uuidv4 } from 'uuid';

export interface Resume {
  id: string;
  name: string;
  fileUrl: string;
  text: string;
  skills: string[];
  createdAt: string;
}

export async function createResume(name: string, fileUrl: string, text: string): Promise<Resume> {
  const session = driver.session();
  const id = uuidv4();
  
  try {
    // Extract skills
    const skills = await extractSkills(text);
    
    // Create resume node
    await session.run(
      `CREATE (r:Resume {
        id: $id,
        name: $name,
        fileUrl: $fileUrl,
        text: $text,
        createdAt: datetime()
      })
      RETURN r`,
      { id, name, fileUrl, text: text.substring(0, 10000) } // Limit text size in Neo4j
    );
    
    // Create skill nodes and relationships
    for (const skill of skills) {
      await session.run(
        `MATCH (r:Resume {id: $resumeId})
         MERGE (s:Skill {name: $skill})
         CREATE (r)-[:HAS_SKILL]->(s)`,
        { resumeId: id, skill }
      );
    }
    
    const resume: Resume = {
      id,
      name,
      fileUrl,
      text,
      skills,
      createdAt: new Date().toISOString(),
    };
    
    return resume;
  } finally {
    await session.close();
  }
}

export async function getResume(id: string): Promise<Resume | null> {
  const session = driver.session();
  
  try {
    const result = await session.run(
      `MATCH (r:Resume {id: $id})
       OPTIONAL MATCH (r)-[:HAS_SKILL]->(s:Skill)
       RETURN r, collect(s.name) as skills`,
      { id }
    );
    
    if (result.records.length === 0) {
      return null;
    }
    
    const record = result.records[0];
    const resumeNode = record.get('r').properties;
    const skills = record.get('skills').filter((s: string | null) => s !== null);
    
    return {
      id: resumeNode.id,
      name: resumeNode.name,
      fileUrl: resumeNode.fileUrl,
      text: resumeNode.text,
      skills,
      createdAt: resumeNode.createdAt?.toString() || new Date().toISOString(),
    };
  } finally {
    await session.close();
  }
}

export async function getAllResumes(): Promise<Resume[]> {
  const session = driver.session();
  
  try {
    const result = await session.run(
      `MATCH (r:Resume)
       OPTIONAL MATCH (r)-[:HAS_SKILL]->(s:Skill)
       RETURN r, collect(s.name) as skills
       ORDER BY r.createdAt DESC`
    );
    
    return result.records.map(record => {
      const resumeNode = record.get('r').properties;
      const skills = record.get('skills').filter((s: string | null) => s !== null);
      
      return {
        id: resumeNode.id,
        name: resumeNode.name,
        fileUrl: resumeNode.fileUrl,
        text: resumeNode.text,
        skills,
        createdAt: resumeNode.createdAt?.toString() || new Date().toISOString(),
      };
    });
  } finally {
    await session.close();
  }
}

