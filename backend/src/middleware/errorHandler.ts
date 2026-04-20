/**
 * errorHandler.ts — Global Express Error Handling Middleware
 *
 * WHY a global error handler?
 *   Without it, every route has its own try/catch and every unhandled error
 *   produces inconsistent responses. This single middleware:
 *    - Catches any error passed via next(err) from any route
 *    - Returns a consistent JSON error shape: { error: string, code?: string }
 *    - Logs the full error server-side for debugging
 *    - Hides stack traces in production (security: don't leak internals)
 *
 * How Express error middleware works:
 *   Express identifies error middleware by the 4-argument signature: (err, req, res, next)
 *   It MUST be registered AFTER all routes (app.use(errorHandler) at the bottom of index.ts)
 *   Routes trigger it via: next(err) or throw inside an async wrapper
 *
 * Usage in routes:
 *   throw new Error('Not found')           → 500 response (generic)
 *   const err: any = new Error('...'); err.status = 404; next(err) → 404 response
 *   Or use the AppError helper below for typed HTTP errors.
 */

import type { Request, Response, NextFunction } from 'express';

/**
 * AppError — typed HTTP error for intentional error responses
 *
 * Usage:
 *   throw new AppError('Job not found', 404);
 *   throw new AppError('Invalid file type', 400, 'INVALID_FILE');
 */
export class AppError extends Error {
  constructor(
    message: string,
    public status: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * errorHandler — Express 4-argument error middleware
 *
 * Registered LAST in index.ts — catches anything that falls through.
 * In production: hides stack trace (security).
 * In development: includes full stack trace for debugging.
 */
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction  // Must be declared even if unused — Express uses arity (arg count) to detect error middleware
): void {
  // Determine status: use err.status (AppError), err.statusCode (some libraries), or default 500
  const status = err.status || err.statusCode || 500;

  // Log full error server-side — never suppress error details from the logs
  console.error(`[ERROR] ${req.method} ${req.path} → ${status}:`, err.message);
  if (status >= 500) {
    // Log full stack only for server errors — not for expected 4xx client errors
    console.error(err.stack);
  }

  res.status(status).json({
    error: err.message || 'Internal Server Error',
    ...(err.code && { code: err.code }),
    // Only include stack in development — NEVER expose to production clients
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}
