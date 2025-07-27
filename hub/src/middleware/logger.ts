import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger';

const logger = createLogger('http');

// Extended Express Request type to include request timing
interface TimedRequest extends Request {
  startTime?: number;
}

/**
 * HTTP request logging middleware
 */
export function requestLogger(req: TimedRequest, res: Response, next: NextFunction) {
  // Record request start time
  req.startTime = Date.now();

  // Log request
  logger.info(`${req.method} ${req.path}`, {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.get('user-agent'),
  });

  // Capture response finish event
  const originalSend = res.send;
  res.send = function(data: any) {
    res.send = originalSend;
    
    // Calculate response time
    const responseTime = req.startTime ? Date.now() - req.startTime : 0;
    
    // Log response
    logger.info(`${req.method} ${req.path} - ${res.statusCode}`, {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      contentLength: res.get('content-length'),
    });

    return res.send(data);
  };

  next();
}

/**
 * API request logging middleware with additional details
 */
export function apiLogger(req: TimedRequest, res: Response, next: NextFunction) {
  req.startTime = Date.now();

  // Log detailed API request
  logger.info(`API Request: ${req.method} ${req.originalUrl}`, {
    method: req.method,
    url: req.originalUrl,
    headers: {
      'content-type': req.get('content-type'),
      'user-agent': req.get('user-agent'),
    },
    query: req.query,
    body: req.method !== 'GET' ? req.body : undefined,
    ip: req.ip || req.socket.remoteAddress,
  });

  // Override res.json to log API responses
  const originalJson = res.json;
  res.json = function(data: any) {
    res.json = originalJson;
    
    const responseTime = req.startTime ? Date.now() - req.startTime : 0;
    
    // Log API response (limit data size in logs)
    const logData = res.statusCode >= 400 ? data : { success: data.success };
    
    logger.info(`API Response: ${req.method} ${req.originalUrl} - ${res.statusCode}`, {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      response: logData,
    });

    return res.json(data);
  };

  next();
}