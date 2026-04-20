/**
 * embedder.ts — Text Embedding Service
 *
 * Text embeddings are dense numerical vectors (arrays of floats) where
 * semantically similar texts produce vectors with high cosine similarity.
 *
 * Conceptually:
 *   "Machine Learning" → [0.12, -0.34, 0.78, ...]  (1536 dimensions)
 *   "Deep Learning"    → [0.10, -0.32, 0.80, ...]  ← close to above
 *   "Cooking recipes"  → [-0.55, 0.22, -0.11, ...] ← far from above
 *
 * Model: text-embedding-3-small
 *   - OpenAI's latest small embedding model
 *   - 1536 dimensions (balanced between quality and storage cost)
 *   - Faster and cheaper than text-embedding-3-large (3072 dims)
 *   - Excellent for document retrieval tasks
 *
 * Uses:
 *   1. embedText()      — for query-time embedding of user questions / job descriptions
 *   2. embedDocuments() — for batch embedding of resume text chunks at upload time
 */

import { OpenAIEmbeddings } from '@langchain/openai';
import dotenv from 'dotenv';

dotenv.config();

// Single LangChain OpenAIEmbeddings instance — reused across all calls.
// Internally manages the HTTP connection to OpenAI's embeddings endpoint.
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: 'text-embedding-3-small', // 1536-dim vectors; cost-effective for RAG
});

/**
 * embedText — converts a single string to a 1536-dimensional vector
 *
 * Use this for:
 *  - Embedding a user's chat question before searching ChromaDB
 *  - Embedding a job description for job-resume matching
 *
 * @param text - the string to embed (question, job desc, etc.)
 * @returns    - float array of 1536 dimensions representing semantic meaning
 */
export async function embedText(text: string): Promise<number[]> {
  const result = await embeddings.embedQuery(text);
  // embedQuery is optimized for search queries (uses a "query" instruction prefix internally)
  return result;
}

/**
 * embedDocuments — batch-embeds an array of text strings
 *
 * Use this for:
 *  - Embedding all the text chunks of an uploaded resume (batch = more efficient)
 *
 * Difference from embedText:
 *  - embedDocuments uses a "passage" instruction prefix (asymmetric embeddings)
 *  - embedQuery uses a "query" instruction prefix
 *  - Asymmetric embedding: query vector ↔ document vector similarity > doc ↔ doc
 *
 * @param texts - array of chunk strings (e.g., ["...work history...", "...skills..."])
 * @returns     - array of float arrays, one per input string
 */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const result = await embeddings.embedDocuments(texts);
  return result;
}
