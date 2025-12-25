import express from 'express';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseResume } from '../services/resumeParser.js';
import { createResume } from '../services/neo4j/resumeService.js';
import { storeResumeEmbeddings } from '../services/vector/resumeVectorService.js';
import { getAllResumes, getResume } from '../services/neo4j/resumeService.js';
import { findTopMatches } from '../services/matchingService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = join(__dirname, '../../uploads');
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + '-' + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.mimetype === 'text/plain') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and TXT files are allowed'));
    }
  },
});

const router = express.Router();

// Upload resume
router.post('/', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const mimeType = req.file.mimetype;
    
    // Parse resume
    const text = await parseResume(filePath, mimeType);
    
    // Create resume in Neo4j
    const fileUrl = `/uploads/${req.file.filename}`;
    const resume = await createResume(fileName, fileUrl, text);
    
    // Store embeddings in vector DB
    await storeResumeEmbeddings(resume.id, text);
    
    res.status(201).json(resume);
  } catch (error) {
    console.error('Error uploading resume:', error);
    res.status(500).json({ error: 'Failed to upload resume' });
  }
});

// Get all resumes
router.get('/', async (req, res) => {
  try {
    const resumes = await getAllResumes();
    res.json(resumes);
  } catch (error) {
    console.error('Error fetching resumes:', error);
    res.status(500).json({ error: 'Failed to fetch resumes' });
  }
});

// Get a specific resume
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const resume = await getResume(id);
    
    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }
    
    res.json(resume);
  } catch (error) {
    console.error('Error fetching resume:', error);
    res.status(500).json({ error: 'Failed to fetch resume' });
  }
});


export default router;

