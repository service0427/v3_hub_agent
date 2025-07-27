import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger';
import { ApiError } from '../types';

const logger = createLogger('error-handler');

/**
 * Global error handler middleware
 */
export function errorHandler(
  err: Error | ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  // Log error details
  logger.error(`Error handling request: ${req.method} ${req.path}`, {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    query: req.query,
    body: req.body,
  });

  // Handle known API errors
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
      timestamp: new Date().toISOString(),
    });
  }

  // Handle validation errors (from Joi)
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: err.message,
      },
      timestamp: new Date().toISOString(),
    });
  }

  // Handle database errors
  if (err.message && err.message.includes('ECONNREFUSED')) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Database connection failed',
      },
      timestamp: new Date().toISOString(),
    });
  }

  // Default error response
  const isDev = process.env.NODE_ENV === 'development';
  
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: isDev ? err.message : 'Internal server error',
      ...(isDev && { stack: err.stack }),
    },
    timestamp: new Date().toISOString(),
  });
}

/**
 * Handle 404 errors
 */
export function notFoundHandler(req: Request, res: Response) {
  logger.warn(`404 - Route not found: ${req.method} ${req.path}`);
  
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route not found: ${req.method} ${req.path}`,
    },
    timestamp: new Date().toISOString(),
  });
}

/**
 * Async route wrapper to catch errors
 */
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}