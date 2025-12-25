import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdir } from 'fs/promises';
import jobRoutes from './routes/jobs.js';
import resumeRoutes from './routes/resumes.js';
import chatRoutes from './routes/chat.js';
import { testConnection, initializeSchema } from './config/neo4j.js';
import { initializeChroma } from './config/chroma.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Create uploads directory if it doesn't exist
const uploadsDir = join(__dirname, '../uploads');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

// Routes
app.use('/api/jobs', jobRoutes);
app.use('/api/resumes', resumeRoutes);
app.use('/api/chat', chatRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize databases and start server
async function initialize() {
  try {
    // Create uploads directory
    await mkdir(uploadsDir, { recursive: true });
    console.log('✅ Uploads directory ready');
  } catch (error) {
    console.error('⚠️ Uploads directory warning:', error);
  }
  
  // Initialize databases (non-blocking, don't wait)
  (async () => {
    try {
      await testConnection();
      await initializeSchema();
    } catch (err: any) {
      console.error('⚠️ Neo4j warning:', err?.message || err);
    }
    
    try {
      await initializeChroma();
    } catch (err: any) {
      console.error('⚠️ Chroma warning:', err?.message || err);
    }
    
    console.log('✅ Database initialization attempts completed');
  })();
  
  // Start server immediately (don't wait for DB init)
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📋 Health check: http://localhost:${PORT}/api/health`);
  });
}

initialize();

