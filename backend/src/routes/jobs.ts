import express from 'express';
import { createJob, getJob, getAllJobs } from '../services/neo4j/jobService.js';
import { findTopMatches } from '../services/matchingService.js';

const router = express.Router();

// Create a new job
router.post('/', async (req, res) => {
  try {
    const { title, description } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }
    
    const job = await createJob(title, description);
    res.status(201).json(job);
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// Get all jobs
router.get('/', async (req, res) => {
  try {
    const jobs = await getAllJobs();
    res.json(jobs);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// Get a specific job
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const job = await getJob(id);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json(job);
  } catch (error) {
    console.error('Error fetching job:', error);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

// Get top matches for a job
router.get('/:id/matches', async (req, res) => {
  try {
    const { id } = req.params;
    const topN = parseInt(req.query.top as string) || 10;
    
    const matches = await findTopMatches(id, topN);
    res.json(matches);
  } catch (error) {
    console.error('Error finding matches:', error);
    res.status(500).json({ error: 'Failed to find matches' });
  }
});

export default router;
