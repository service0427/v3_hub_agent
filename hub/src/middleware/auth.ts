import { Request, Response, NextFunction } from 'express';
import { ApiKeyModel } from '../db/models';
import { ApiError } from '../types';
import { createLogger } from '../utils/logger';

const logger = createLogger('auth');

export interface AuthRequest extends Request {
  apiKey?: string;
}

/**
 * API key authentication middleware
 */
export async function authenticateApiKey(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    // Get API key from query parameter
    const apiKey = req.query.key as string;

    if (!apiKey) {
      throw new ApiError('MISSING_API_KEY', 'API 키가 필요합니다', 401);
    }

    // Validate API key
    const isValid = await ApiKeyModel.validate(apiKey);

    if (!isValid) {
      logger.warn('Invalid API key attempt', { apiKey, ip: req.ip });
      throw new ApiError('INVALID_API_KEY', '유효하지 않은 API 키입니다', 401);
    }

    // Store API key in request for later use
    req.apiKey = apiKey;

    next();
  } catch (error) {
    next(error);
  }
}