/**
 * resumeParser.ts — PDF/TXT Text Extraction & Chunking
 *
 * Two responsibilities:
 *  1. parseResume() — extracts raw text from uploaded PDF or TXT files
 *  2. chunkText()   — splits long text into overlapping windows for embedding
 *
 * Why chunking?
 *  LLMs have context length limits (e.g., ~8192 tokens for GPT-3.5).
 *  Embedding an entire 10-page resume as a single vector loses granularity —
 *  a question about "AWS experience" would search against a vector representing
 *  the ENTIRE resume, not just the relevant section. Chunks give finer search
 *  resolution.
 */

// ─── Dynamic Import Pattern for pdf-parse ─────────────────────────────────────
//
// Problem: pdf-parse has a side-effect at module initialization — it tries to
// read test fixture files (`test/data/05-versions-space.pdf`) from disk. In
// ESM (ES Modules) environments, this path resolution fails at import time,
// crashing the entire server before any routes are registered.
//
// Solution: lazily import pdf-parse only when ACTUALLY needed (i.e., when a
// PDF is being parsed). The singleton pattern ensures we only pay the dynamic
// import cost once per server lifetime.
let pdfParse: any;
async function getPdfParse() {
  if (!pdfParse) {
    pdfParse = (await import('pdf-parse')).default;
  }
  return pdfParse;
}

import { readFile } from 'fs/promises';
import { extname } from 'path';

/**
 * parseResume — extracts plain text from a resume file
 *
 * Supported formats:
 *   - .pdf → pdf-parse reads the binary buffer and extracts text layers
 *   - .txt → read as UTF-8 string directly
 *
 * @param filePath  - absolute path to the file on disk (saved by Multer)
 * @param mimeType  - MIME type from the original upload (for fallback detection)
 * @returns         - raw text content of the resume
 */
export async function parseResume(filePath: string, mimeType: string): Promise<string> {
  const ext = extname(filePath).toLowerCase();
  
  if (ext === '.pdf' || mimeType === 'application/pdf') {
    // Read file into a Buffer (pdf-parse requires binary, not string)
    const buffer = await readFile(filePath);
    const pdfParser = await getPdfParse();
    const data = await pdfParser(buffer);
    return data.text; // data.text is the concatenated plain text from all PDF pages
  } else if (ext === '.txt' || mimeType === 'text/plain') {
    // Plain text — read directly as UTF-8 string
    const content = await readFile(filePath, 'utf-8');
    return content;
  } else {
    throw new Error(`Unsupported file type: ${ext}`);
  }
}

/**
 * chunkText — splits text into overlapping fixed-size windows
 *
 * Example with chunkSize=10, overlap=3:
 *   Input:  "ABCDEFGHIJKLM"
 *   Chunks: ["ABCDEFGHIJ", "HIJKLM"]  ← "HIJ" is repeated (overlap)
 *
 * Why overlap?
 *   A sentence that falls at a chunk boundary would be split in half.
 *   The overlap (200 chars) ensures each chunk shares context with the
 *   previous chunk, so no important context is lost at seams.
 *
 * @param text      - full resume text
 * @param chunkSize - max characters per chunk (default: 1000 ≈ ~200 words)
 * @param overlap   - how many chars the next chunk re-reads from the end of the previous
 * @returns         - array of text chunks
 */
export function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    // Next chunk starts at (end - overlap) — creating the sliding window
    start = end - overlap;
    
    // Guard against infinite loop when remaining text is shorter than overlap
    if (end === text.length) break;
  }
  
  return chunks;
}
