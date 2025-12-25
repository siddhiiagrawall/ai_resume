import express from 'express';
import { chatWithResume, getConversationHistory } from '../services/chat/ragChatService.js';

const router = express.Router();

// Chat with a resume
router.post('/:resumeId', async (req, res) => {
  try {
    const { resumeId } = req.params;
    const { message, sessionId } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    const result = await chatWithResume(resumeId, message, sessionId);
    res.json(result);
  } catch (error) {
    console.error('Error in chat:', error);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

// Get conversation history
router.get('/:resumeId/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const history = getConversationHistory(sessionId);
    res.json({ history });
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

export default router;

