import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { extractFullProfile } from '../services/ai/skillExtractor.js';
import { updateResumeConnections, updateResumeStatus } from '../services/neo4j/resumeService.js';
import { storeResumeEmbeddings } from '../services/vector/resumeVectorService.js';
import { scoreResume } from '../services/ai/resumeScorer.js';

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', { maxRetriesPerRequest: null });

export const resumeQueue = new Queue('resume-processing', { connection });

// Set up the worker to process jobs from the queue
const worker = new Worker('resume-processing', async (job: Job) => {
  const { id, text } = job.data;
  
  try {
    await updateResumeStatus(id, 'PROCESSING');
    await job.updateProgress(10);

    // 1. LangChain Extraction
    const profile = await extractFullProfile(text);
    await job.updateProgress(40);

    // 2. Build graph context in Neo4j
    await updateResumeConnections(id, profile);
    await job.updateProgress(60);

    // 3. Parallel Score & Embed
    const [, scoreResult] = await Promise.all([
      storeResumeEmbeddings(id, text),
      scoreResume(text),
    ]);
    await job.updateProgress(90);

    // 4. Finalize
    await updateResumeStatus(id, 'COMPLETED', scoreResult.qualityScore);
    await job.updateProgress(100);

    return { success: true };
  } catch (error) {
    console.error(`Error processing resume ${id}:`, error);
    await updateResumeStatus(id, 'FAILED');
    throw error;
  }
}, { connection });

worker.on('completed', job => {
  console.log(`Job ${job.id} has completed!`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} has failed with ${err.message}`);
});
