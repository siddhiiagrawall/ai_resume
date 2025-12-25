import { chromaClient, RESUME_COLLECTION_NAME } from '../../config/chroma.js';
import { embedDocuments } from '../ai/embedder.js';
import { chunkText } from '../resumeParser.js';

export async function storeResumeEmbeddings(resumeId: string, text: string): Promise<void> {
  try {
    // Get or create collection
    let collection;
    try {
      collection = await chromaClient.getCollection({ name: RESUME_COLLECTION_NAME } as any);
    } catch {
      // Collection doesn't exist, create it
      collection = await chromaClient.createCollection({ name: RESUME_COLLECTION_NAME });
    }
    
    // Chunk the resume text
    const chunks = chunkText(text, 1000, 200);
    
    // Generate embeddings
    const embeddings = await embedDocuments(chunks);
    
    // Prepare documents for Chroma
    const ids = chunks.map((_, idx) => `${resumeId}_chunk_${idx}`);
    const metadatas = chunks.map(() => ({ resumeId }));
    
    // Add to collection
    await collection.add({
      ids,
      embeddings,
      documents: chunks,
      metadatas,
    });
    
    console.log(`✅ Stored ${chunks.length} chunks for resume ${resumeId}`);
  } catch (error) {
    console.error('Error storing resume embeddings:', error);
    // Don't throw - allow resume creation to continue
  }
}

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
      return []; // Collection doesn't exist
    }
    
    const { embedText } = await import('../ai/embedder.js');
    const queryEmbedding = await embedText(query);
    
    // Query with filter for specific resume
    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: topK,
      where: { resumeId: { $eq: resumeId } },
    });
    
    if (!results.documents || !results.documents[0]) {
      return [];
    }
    
    const documents = results.documents[0];
    const distances = results.distances?.[0] || [];
    
    return documents
      .filter((doc: string | null): doc is string => doc !== null)
      .map((doc: string, idx: number) => ({
        text: doc,
        score: 1 - ((distances[idx] || 0) / 2), // Convert distance to similarity
      }));
  } catch (error) {
    console.error('Error searching resume chunks:', error);
    return [];
  }
}

