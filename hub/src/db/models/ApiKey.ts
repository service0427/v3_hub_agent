import { pool } from '../connection';
import { ApiKey } from '../../types';
import { createLogger } from '../../utils/logger';

const logger = createLogger('model:api-key');

export class ApiKeyModel {
  /**
   * Find API key by key value
   */
  static async findByKey(apiKey: string): Promise<ApiKey | null> {
    try {
      const result = await pool.query(
        `SELECT * FROM v3_api_keys WHERE api_key = $1 AND is_active = true`,
        [apiKey]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to find API key', error);
      throw error;
    }
  }

  /**
   * Validate API key exists and is active
   */
  static async validate(apiKey: string): Promise<boolean> {
    try {
      const key = await this.findByKey(apiKey);
      return key !== null;
    } catch (error) {
      logger.error('Failed to validate API key', error);
      return false;
    }
  }

  /**
   * Get all active API keys
   */
  static async getAllActive(): Promise<ApiKey[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM v3_api_keys WHERE is_active = true ORDER BY created_at DESC`
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to get active API keys', error);
      throw error;
    }
  }

  /**
   * Create new API key
   */
  static async create(apiKey: string, name: string, description?: string): Promise<ApiKey> {
    try {
      const result = await pool.query(
        `INSERT INTO v3_api_keys (api_key, name, description) 
         VALUES ($1, $2, $3) 
         RETURNING *`,
        [apiKey, name, description]
      );

      logger.info('New API key created', { apiKey, name });
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to create API key', error);
      throw error;
    }
  }

  /**
   * Deactivate API key
   */
  static async deactivate(apiKey: string): Promise<boolean> {
    try {
      const result = await pool.query(
        `UPDATE v3_api_keys 
         SET is_active = false, updated_at = CURRENT_TIMESTAMP 
         WHERE api_key = $1`,
        [apiKey]
      );

      if (result.rowCount === 0) {
        return false;
      }

      logger.info('API key deactivated', { apiKey });
      return true;
    } catch (error) {
      logger.error('Failed to deactivate API key', error);
      throw error;
    }
  }
}