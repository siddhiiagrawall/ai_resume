/**
 * resumeVectorService.ts — Resume Chunk Embedding Storage & Retrieval
 *
 * This service bridges the gap between raw resume text and ChromaDB.
 * It handles:
 *  1. Chunking → Embedding → Storing (at upload time)
 *  2. Querying by semantic similarity filtered to a specific resume (at chat/search time)
 *
 * ChromaDB collection structure for this project:
 *   Collection name: "resumes"
 *   Each document = one text chunk from a resume
 *   Document ID format: "{resumeId}_chunk_{index}"
 *   Metadata on each doc: { resumeId: string }  ← used for per-resume filtering
 */

import { chromaClient, RESUME_COLLECTION_NAME } from '../../config/chroma.js';
import { embedDocuments } from '../ai/embedder.js';
import { chunkText } from '../resumeParser.js';

/**
 * storeResumeEmbeddings — processes and stores a resume in ChromaDB
 *
 * Called immediately after a resume is saved to Neo4j.
 * The vector embeddings enable semantic search ("find experience similar to AWS")
 * which keyword-based search (Neo4j skills graph) cannot do.
 *
 * Steps:
 *  1. Chunk the full text into 1000-char sliding windows (200-char overlap)
 *  2. Batch-embed all chunks via OpenAI text-embedding-3-small
 *  3. Store chunks + embeddings + metadata in ChromaDB collection
 *
 * @param resumeId - UUID of the resume (must match Neo4j node ID for cross-DB joins)
 * @param text     - full extracted text of the resume
 */
export async function storeResumeEmbeddings(resumeId: string, text: string): Promise<void> {
  try {
    // Get or create the ChromaDB collection — handles both first-run and normal cases
    let collection;
    try {
      // Happy path: collection already exists from a previous run
      collection = await chromaClient.getCollection({ name: RESUME_COLLECTION_NAME } as any);
    } catch {
      // First time: collection doesn't exist yet — create it
      collection = await chromaClient.createCollection({ name: RESUME_COLLECTION_NAME });
    }
    
    // Chunk the resume text into overlapping windows
    // chunkSize=1000 chars ≈ ~200 words — granular enough for specific Q&A
    // overlap=200 chars — prevents context loss at chunk boundaries
    const chunks = chunkText(text, 1000, 200);
    
    // Batch embed all chunks in one API call (more efficient than one-by-one)
    // Returns a 1536-dim float array per chunk
    const embeddingsArr = await embedDocuments(chunks);
    
    // ChromaDB needs:
    //  - ids: unique string per document (globally unique across collection)
    //  - embeddings: the float vectors
    //  - documents: the original text (for retrieval/display)
    //  - metadatas: arbitrary key-value pairs (used for filtering)
    const ids = chunks.map((_, idx) => `${resumeId}_chunk_${idx}`);
    const metadatas = chunks.map(() => ({ resumeId })); // Tag each chunk with its source resumeId
    
    await collection.add({
      ids,
      embeddings: embeddingsArr,
      documents: chunks,
      metadatas,
    });
    
    console.log(`✅ Stored ${chunks.length} chunks for resume ${resumeId}`);
  } catch (error) {
    console.error('Error storing resume embeddings:', error);
    // Non-fatal: resume creation in Neo4j already succeeded.
    // The resume will be searchable by graph (skill keywords) but not by vector.
    // In production, you'd queue a retry job here.
  }
}

/**
 * searchResumeChunks — finds the most relevant resume chunks for a given query
 *
 * Used by: ragChatService.ts (to retrieve context before generating answers)
 * Also used by: matchingService.ts indirectly (via embedText + collection.query)
 *
 * The `where` filter is critical — it restricts the search to chunks
 * belonging to the specific resume. Without it, a question about "Sarah's
 * Python experience" might retrieve chunks from other resumes.
 *
 * @param resumeId - UUID of the resume to search within
 * @param query    - natural language question (e.g., "What databases have they used?")
 * @param topK     - number of chunks to retrieve (default: 5)
 * @returns        - array of { text, score } pairs, sorted by relevance (descending)
 */
export async function searchResumeChunks(
  resumeId: string,
  query: string,
  topK: number = 5
): Promise<Array<{ text: string; score: number }>> {
  try {
    let collection;
    try {
      collection = await chromaClient.getCollection({ name: RESUME_COLLECTION_NAME } as any);
    } catch {
      return []; // ChromaDB not available — return empty (RAG will answer without context)
    }
    
    // Dynamic import to avoid circular dependency issues
    const { embedText } = await import('../ai/embedder.js');
    
    // Embed the query text — this is the vector we'll find closest neighbors to
    const queryEmbedding = await embedText(query);
    
    // Query ChromaDB:
    //   queryEmbeddings: the search vector
    //   nResults: how many closest chunks to return
    //   where: metadata filter — ONLY chunks from this specific resume
    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: topK,
      where: { resumeId: { $eq: resumeId } }, // ChromaDB metadata filter syntax
    });
    
    if (!results.documents || !results.documents[0]) {
      return [];
    }
    
    // ChromaDB returns parallel arrays: [documents[0], distances[0]]
    // documents[0][i] corresponds to distances[0][i]
    const documents = results.documents[0];
    const distances = results.distances?.[0] || [];
    
    return documents
      .filter((doc: string | null): doc is string => doc !== null) // Type guard removes nulls
      .map((doc: string, idx: number) => ({
        text: doc,
        // Convert L2 distance to similarity score in [0, 1]:
        // L2 distance for unit-normalized vectors ∈ [0, 2]
        // similarity = 1 - (distance / 2) maps this to [0, 1]
        score: 1 - ((distances[idx] || 0) / 2),
      }));
  } catch (error) {
    console.error('Error searching resume chunks:', error);
    return []; // Non-fatal: RAG chat will still work, just without retrieved context
  }
}

/**
 * deleteResumeEmbeddings — removes all ChromaDB chunks belonging to a resume
 *
 * Called when a resume is deleted to prevent orphaned vectors from affecting
 * future semantic searches and wasting storage.
 *
 * Strategy:
 *   1. Query ChromaDB for all chunk IDs with this resumeId in metadata
 *   2. Delete them by ID — ChromaDB delete by metadata where clause
 *
 * Why get IDs first instead of deleting by where clause directly?
 *   ChromaDB's delete() with just `where` filter works in newer versions,
 *   but we use get() → delete by IDs for maximum compatibility with v1.x
 *
 * @param resumeId - UUID of the resume whose chunks to delete
 */
export async function deleteResumeEmbeddings(resumeId: string): Promise<void> {
  try {
    let collection;
    try {
      collection = await chromaClient.getCollection({ name: RESUME_COLLECTION_NAME } as any);
    } catch {
      // Collection doesn't exist — nothing to delete
      return;
    }

    // Get all chunk IDs for this resume using the metadata filter
    const existing = await collection.get({
      where: { resumeId: { $eq: resumeId } },
    });

    if (existing.ids && existing.ids.length > 0) {
      await collection.delete({ ids: existing.ids });
      console.log(`✅ Deleted ${existing.ids.length} chunks for resume ${resumeId}`);
    }
  } catch (error) {
    // Non-fatal: log but don't throw — Neo4j delete already succeeded
    console.error('Error deleting resume embeddings:', error);
  }
}
