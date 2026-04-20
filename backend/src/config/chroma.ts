/**
 * chroma.ts — ChromaDB Vector Database Connection & Collection Setup
 *
 * What is ChromaDB?
 *  ChromaDB is an open-source VECTOR DATABASE — it stores and searches over
 *  high-dimensional float arrays (embeddings/vectors) using approximate nearest
 *  neighbor (ANN) algorithms.
 *
 * Why a vector DB instead of a normal DB?
 *  You can't query "find texts semantically similar to X" with SQL or Neo4j.
 *  Traditional DBs compare exact values. Vector DBs compare geometric distance
 *  between floating-point vectors.
 *
 *  Example: Query = "cloud computing experience"
 *   - SQL/Neo4j: looks for exact keyword "cloud computing" → misses "AWS", "GCP", "Azure"
 *   - ChromaDB: finds all resume chunks with similar meaning → returns AWS, GCP, K8s mentions
 *
 * How ChromaDB works:
 *  1. Text → embedding model → float[1536]  ("dense vector")
 *  2. Store vectors in ChromaDB with an HNSW index
 *  3. At query time: embed query → find K closest vectors via HNSW traversal
 *  4. Return the original text documents associated with the closest vectors
 *
 * HNSW (Hierarchical Navigable Small World):
 *  A graph-based ANN algorithm. Builds a multi-layer proximity graph of vectors.
 *  Search navigates from coarse-to-fine layers — O(log n) instead of O(n) brute force.
 *
 * This server connects to ChromaDB running as a Docker container on port 8000.
 */

import { ChromaClient } from 'chromadb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ChromaDB runs as a separate HTTP server (NOT embedded in this process)
// The client sends REST requests to it — distinct from Neo4j's Bolt binary protocol
const chromaUrl = process.env.CHROMA_URL || 'http://localhost:8000';

/**
 * chromaClient — application-wide singleton ChromaDB HTTP client
 *
 * Unlike Neo4j's connection pool, ChromaDB uses stateless HTTP.
 * Each call creates an HTTP request; no persistent connection to manage.
 */
export const chromaClient = new ChromaClient({
  path: chromaUrl,
});

/**
 * Collection name for all resume embeddings
 *
 * A "collection" in ChromaDB is analogous to a table in SQL or an index in Elasticsearch.
 * All documents (resume text chunks) live in ONE collection, distinguished by
 * per-document metadata: { resumeId: string }
 *
 * Alternative design: one collection per resume — rejected because ChromaDB
 * performs better with fewer, larger collections, and cross-resume similarity
 * search (for job matching) is easier with a single collection.
 */
export const RESUME_COLLECTION_NAME = 'resumes';

/**
 * initializeChroma — ensures the 'resumes' collection exists
 *
 * Idempotent: checks for existence before creating, so safe on every restart.
 * Errors are caught and logged — server starts even if ChromaDB is unreachable.
 * In this case, vector-based features degrade gracefully (graph-only matching,
 * RAG chat returns no retrieved context).
 */
export async function initializeChroma() {
  try {
    // List all collections and check if 'resumes' exists
    const collections = await chromaClient.listCollections();
    const exists = collections.some((c: any) => c.name === RESUME_COLLECTION_NAME);
    
    if (!exists) {
      // First-time setup: create the collection with descriptive metadata
      await chromaClient.createCollection({
        name: RESUME_COLLECTION_NAME,
        metadata: { description: 'Resume embeddings for semantic search' },
      });
      console.log('✅ Chroma collection created');
    } else {
      console.log('✅ Chroma collection already exists');
    }
  } catch (error: any) {
    // Non-fatal: allow server to start without ChromaDB
    // Matching and chat will fall back to graph-only mode
    console.error('⚠️ Chroma initialization failed (will retry later):', error?.message || error);
  }
}
