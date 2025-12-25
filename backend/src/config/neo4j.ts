import neo4j from 'neo4j-driver';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
const user = process.env.NEO4J_USER || 'neo4j';
const password = process.env.NEO4J_PASSWORD || 'password';

export const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

export async function testConnection() {
  try {
    const session = driver.session();
    const result = await session.run('RETURN 1 as test');
    await session.close();
    console.log('✅ Neo4j connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Neo4j connection failed:', error);
    return false;
  }
}

// Initialize schema
export async function initializeSchema() {
  const session = driver.session();
  try {
    // Create indexes for better performance
    await session.run(`
      CREATE INDEX job_id IF NOT EXISTS FOR (j:Job) ON (j.id)
    `);
    await session.run(`
      CREATE INDEX resume_id IF NOT EXISTS FOR (r:Resume) ON (r.id)
    `);
    await session.run(`
      CREATE INDEX skill_name IF NOT EXISTS FOR (s:Skill) ON (s.name)
    `);
    console.log('✅ Neo4j schema initialized');
  } catch (error) {
    console.error('⚠️ Schema initialization error (may already exist):', error);
  } finally {
    await session.close();
  }
}

