import { OpenAIEmbeddings } from '@langchain/openai';
import dotenv from 'dotenv';

dotenv.config();

const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: 'text-embedding-3-small',
});

export async function embedText(text: string): Promise<number[]> {
  const result = await embeddings.embedQuery(text);
  return result;
}

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const result = await embeddings.embedDocuments(texts);
  return result;
}

