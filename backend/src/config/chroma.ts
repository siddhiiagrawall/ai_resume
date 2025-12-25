import { ChromaClient } from 'chromadb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const chromaUrl = process.env.CHROMA_URL || 'http://localhost:8000';


export const chromaClient = new ChromaClient({
  path: chromaUrl,
});

export const RESUME_COLLECTION_NAME = 'resumes';

export async function initializeChroma() {
  try {
    // Get or create collection
    const collections = await chromaClient.listCollections();
    const exists = collections.some((c: any) => c.name === RESUME_COLLECTION_NAME);
    
    if (!exists) {
      await chromaClient.createCollection({
        name: RESUME_COLLECTION_NAME,
        metadata: { description: 'Resume embeddings for semantic search' },
      });
      console.log('✅ Chroma collection created');
    } else {
      console.log('✅ Chroma collection already exists');
    }
  } catch (error: any) {
    console.error('⚠️ Chroma initialization failed (will retry later):', error?.message || error);
    // Don't throw - allow server to start without Chroma
  }
}

