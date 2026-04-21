import express from 'express';
import { z } from 'zod';
import { createUser, verifyUser, getUserById } from '../services/neo4j/authService.js';
import { generateToken, requireAuth } from '../middleware/auth.js';

const router = express.Router();

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
  role: z.enum(['RECRUITER', 'CANDIDATE']),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues });
    }

    const { email, name, password, role } = parsed.data;

    try {
      const user = await createUser(email, name, password, role);
      const token = generateToken(user.id, user.role);
      
      // Don't send password hash back
      res.status(201).json({ 
        token, 
        user: { id: user.id, email: user.email, name: user.name, role: user.role } 
      });
    } catch (err: any) {
      // Neo4j constraint violation string check
      if (err.message && err.message.includes('already exists with label')) {
        return res.status(409).json({ error: 'User with this email already exists' });
      }
      throw err;
    }
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues });
    }

    const { email, password } = parsed.data;
    const user = await verifyUser(email, password);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user.id, user.role);
    res.json({ 
      token, 
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me (Get current user)
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await getUserById(req.user!.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
  } catch (error) {
    next(error);
  }
});

export default router;
