// Dynamic import to avoid pdf-parse initialization issues
let pdfParse: any;
async function getPdfParse() {
  if (!pdfParse) {
    pdfParse = (await import('pdf-parse')).default;
  }
  return pdfParse;
}

import { readFile } from 'fs/promises';
import { extname } from 'path';

export async function parseResume(filePath: string, mimeType: string): Promise<string> {
  const ext = extname(filePath).toLowerCase();
  
  if (ext === '.pdf' || mimeType === 'application/pdf') {
    const buffer = await readFile(filePath);
    const pdfParser = await getPdfParse();
    const data = await pdfParser(buffer);
    return data.text;
  } else if (ext === '.txt' || mimeType === 'text/plain') {
    const content = await readFile(filePath, 'utf-8');
    return content;
  } else {
    throw new Error(`Unsupported file type: ${ext}`);
  }
}

export function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
  }
  
  return chunks;
}

