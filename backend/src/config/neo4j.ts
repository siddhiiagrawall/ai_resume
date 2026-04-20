/**
 * neo4j.ts — Neo4j Graph Database Connection & Schema Setup
 *
 * What is Neo4j?
 *  Neo4j is a GRAPH DATABASE. Data is stored as:
 *   - NODES        → entities (Resume, Job, Skill, Company, Institution)
 *   - RELATIONSHIPS → typed directed edges (HAS_SKILL, REQUIRES_SKILL, WORKED_AT, HAS_DEGREE)
 *   - PROPERTIES   → key-value data on both nodes and relationships
 *
 * Why a graph DB for this project?
 *  The core features are graph traversal problems:
 *   "Find resumes whose skills overlap with job requirements"
 *     → MATCH (j:Job)-[:REQUIRES_SKILL]->(s:Skill)<-[:HAS_SKILL]-(r:Resume)
 *   "Find candidates who worked at Google and know Python"
 *     → MATCH (r:Resume)-[:WORKED_AT]->(:Company {name:"Google"})
 *        MATCH (r)-[:HAS_SKILL]->(:Skill {name:"Python"})
 *  These are trivial in Cypher but require multi-table JOINs in SQL.
 *
 * Full Graph Schema (after enrichment):
 *   (Resume)-[:HAS_SKILL]->(Skill)
 *   (Resume)-[:WORKED_AT {role, durationYears}]->(Company)
 *   (Resume)-[:HAS_DEGREE {degree, field}]->(Institution)
 *   (Job)-[:REQUIRES_SKILL]->(Skill)
 *
 * Bolt protocol (port 7687):
 *  Neo4j speaks the Bolt binary protocol for application connections.
 *  The Neo4j Browser UI runs on port 7474 (HTTP) — for humans, not apps.
 */

import neo4j from 'neo4j-driver';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
const user = process.env.NEO4J_USER || 'neo4j';
const password = process.env.NEO4J_PASSWORD || 'password';

/**
 * Neo4j Driver — application-wide singleton connection pool
 *
 * The driver manages a pool of Bolt connections internally.
 * Each query uses a SESSION (lightweight wrapper over the pool).
 * Pattern: const session = driver.session(); ... finally { await session.close(); }
 */
export const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

/**
 * testConnection — verifies Neo4j is reachable with a minimal query
 * Returns true/false — server starts even if Neo4j is temporarily unavailable
 */
export async function testConnection() {
  try {
    const session = driver.session();
    await session.run('RETURN 1 as test');
    await session.close();
    console.log('✅ Neo4j connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Neo4j connection failed:', error);
    return false;
  }
}

/**
 * initializeSchema — creates all indexes for the full enriched graph schema
 *
 * Without indexes, every lookup is a FULL SCAN of all nodes.
 * With indexes, lookups by indexed properties are O(log n) B-tree operations.
 *
 * `IF NOT EXISTS` makes every CREATE INDEX idempotent — safe on every restart.
 *
 * Indexes created:
 *  Core identifiers (lookup by UUID):
 *   - Resume.id       → fast getResume(), updateResumeQualityScore()
 *   - Job.id          → fast getJob(), explainMatch(), findTopMatches()
 *
 *  Shared entity names (used in MERGE — must be fast to avoid duplicates):
 *   - Skill.name      → MERGE (s:Skill {name}) in createResume/createJob
 *   - Company.name    → MERGE (c:Company {name}) in createResume
 *   - Institution.name→ MERGE (inst:Institution {name}) in createResume
 */
export async function initializeSchema() {
  const session = driver.session();
  try {
    // Core node ID indexes
    await session.run(`CREATE INDEX job_id IF NOT EXISTS FOR (j:Job) ON (j.id)`);
    await session.run(`CREATE INDEX resume_id IF NOT EXISTS FOR (r:Resume) ON (r.id)`);

    // Shared entity name indexes (critical for MERGE performance)
    await session.run(`CREATE INDEX skill_name IF NOT EXISTS FOR (s:Skill) ON (s.name)`);
    await session.run(`CREATE INDEX company_name IF NOT EXISTS FOR (c:Company) ON (c.name)`);
    await session.run(`CREATE INDEX institution_name IF NOT EXISTS FOR (i:Institution) ON (i.name)`);

    console.log('✅ Neo4j schema initialized (5 indexes)');
  } catch (error) {
    console.error('⚠️ Schema initialization warning:', error);
  } finally {
    await session.close();
  }
}
