import { pool } from '../connection';
import { RankingHistory, BrowserType } from '../../types';
import { createLogger } from '../../utils/logger';

const logger = createLogger('model:ranking-history');

export interface SaveRankingParams {
  apiKey: string;
  keyword: string;
  productCode: string;
  rank?: number;
  realRank?: number;
  productName?: string;
  price?: number;
  thumbnailUrl?: string;
  rating?: string;
  reviewCount?: number;
  pagesSearched: number;
  browserType: BrowserType;
  vmId?: string;
  browserVersion?: string;
  executionTimeMs?: number;
  success: boolean;
  errorMessage?: string;
}

export class RankingHistoryModel {
  /**
   * Save ranking history
   */
  static async save(params: SaveRankingParams): Promise<RankingHistory> {
    try {
      const result = await pool.query(
        `INSERT INTO v3_coupang_ranking_history (
          api_key, keyword, product_code, rank, real_rank,
          product_name, price, thumbnail_url, rating, review_count,
          pages_searched, browser_type, vm_id, browser_version,
          execution_time_ms, success, error_message
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *`,
        [
          params.apiKey,
          params.keyword,
          params.productCode,
          params.rank,
          params.realRank,
          params.productName,
          params.price,
          params.thumbnailUrl,
          params.rating,
          params.reviewCount,
          params.pagesSearched,
          params.browserType,
          params.vmId,
          params.browserVersion,
          params.executionTimeMs,
          params.success,
          params.errorMessage,
        ]
      );

      logger.info('Ranking history saved', {
        apiKey: params.apiKey,
        keyword: params.keyword,
        productCode: params.productCode,
        success: params.success,
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to save ranking history', error);
      throw error;
    }
  }

  /**
   * Get recent history for a keyword/product combination
   */
  static async getRecentHistory(
    keyword: string,
    productCode: string,
    limit: number = 10
  ): Promise<RankingHistory[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM v3_coupang_ranking_history
         WHERE keyword = $1 AND product_code = $2
         ORDER BY created_at DESC
         LIMIT $3`,
        [keyword, productCode, limit]
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to get recent history', error);
      throw error;
    }
  }

  /**
   * Get browser performance statistics
   */
  static async getBrowserStats(
    hours: number = 24
  ): Promise<Array<{
    browser_type: BrowserType;
    total_requests: number;
    success_count: number;
    error_count: number;
    avg_execution_time: number;
  }>> {
    try {
      const result = await pool.query(
        `SELECT 
          browser_type,
          COUNT(*) as total_requests,
          COUNT(*) FILTER (WHERE success = true) as success_count,
          COUNT(*) FILTER (WHERE success = false) as error_count,
          AVG(execution_time_ms) as avg_execution_time
         FROM v3_coupang_ranking_history
         WHERE created_at >= NOW() - INTERVAL '${hours} hours'
         GROUP BY browser_type
         ORDER BY total_requests DESC`,
        []
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to get browser stats', error);
      throw error;
    }
  }

  /**
   * Clean up old history (called by scheduled job)
   */
  static async cleanupOldHistory(days: number = 90): Promise<number> {
    try {
      const result = await pool.query(
        `DELETE FROM v3_coupang_ranking_history
         WHERE created_at < NOW() - INTERVAL '${days} days'`,
        []
      );

      if (result.rowCount && result.rowCount > 0) {
        logger.info(`Cleaned up ${result.rowCount} old history records`);
      }

      return result.rowCount || 0;
    } catch (error) {
      logger.error('Failed to cleanup old history', error);
      throw error;
    }
  }

  /**
   * Get ranking trends over time
   */
  static async getRankingTrends(
    keyword: string,
    productCode: string,
    days: number = 7
  ): Promise<Array<{
    date: string;
    avg_rank: number;
    avg_real_rank: number;
    request_count: number;
  }>> {
    try {
      const result = await pool.query(
        `SELECT 
          DATE(created_at) as date,
          AVG(rank) as avg_rank,
          AVG(real_rank) as avg_real_rank,
          COUNT(*) as request_count
         FROM v3_coupang_ranking_history
         WHERE keyword = $1 
           AND product_code = $2
           AND created_at >= NOW() - INTERVAL '${days} days'
           AND success = true
           AND rank IS NOT NULL
         GROUP BY DATE(created_at)
         ORDER BY date DESC`,
        [keyword, productCode]
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to get ranking trends', error);
      throw error;
    }
  }
}