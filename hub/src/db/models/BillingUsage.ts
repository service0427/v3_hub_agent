import { pool } from '../connection';
import { BillingUsage } from '../../types';
import { createLogger } from '../../utils/logger';

const logger = createLogger('model:billing-usage');

export class BillingUsageModel {
  /**
   * Check or create daily billing usage
   * Returns true if this is a new combination (should be billed)
   */
  static async checkOrCreateDailyUsage(
    apiKey: string,
    keyword: string,
    productCode: string
  ): Promise<{ isNew: boolean; usage: BillingUsage }> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    try {
      // Try to find existing usage for today
      const existingResult = await pool.query(
        `SELECT * FROM v3_coupang_billing_usage 
         WHERE api_key = $1 AND keyword = $2 AND product_code = $3 AND date = $4`,
        [apiKey, keyword, productCode, today]
      );

      if (existingResult.rows.length > 0) {
        // Update request count
        const updateResult = await pool.query(
          `UPDATE v3_coupang_billing_usage 
           SET request_count = request_count + 1,
               last_request_at = CURRENT_TIMESTAMP
           WHERE id = $1
           RETURNING *`,
          [existingResult.rows[0].id]
        );

        return { isNew: false, usage: updateResult.rows[0] };
      }

      // Create new billing usage
      const insertResult = await pool.query(
        `INSERT INTO v3_coupang_billing_usage 
         (api_key, keyword, product_code, date, billing_amount)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [apiKey, keyword, productCode, today, 30] // 30원 고정
      );

      logger.info('New billing usage created', {
        apiKey,
        keyword,
        productCode,
        date: today,
      });

      return { isNew: true, usage: insertResult.rows[0] };
    } catch (error) {
      logger.error('Failed to check/create billing usage', error);
      throw error;
    }
  }

  /**
   * Update success/error count
   */
  static async updateRequestResult(
    apiKey: string,
    keyword: string,
    productCode: string,
    success: boolean
  ): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    try {
      const field = success ? 'success_count' : 'error_count';
      
      await pool.query(
        `UPDATE v3_coupang_billing_usage 
         SET ${field} = ${field} + 1
         WHERE api_key = $1 AND keyword = $2 AND product_code = $3 AND date = $4`,
        [apiKey, keyword, productCode, today]
      );
    } catch (error) {
      logger.error('Failed to update request result', error);
      // Don't throw - this is not critical
    }
  }

  /**
   * Get daily usage summary for an API key
   */
  static async getDailyUsage(apiKey: string, date: string): Promise<{
    totalQueries: number;
    totalBilling: number;
    totalRequests: number;
  }> {
    try {
      const result = await pool.query(
        `SELECT 
          COUNT(*) as total_queries,
          SUM(billing_amount) as total_billing,
          SUM(request_count) as total_requests
         FROM v3_coupang_billing_usage
         WHERE api_key = $1 AND date = $2`,
        [apiKey, date]
      );

      const row = result.rows[0];
      return {
        totalQueries: parseInt(row.total_queries) || 0,
        totalBilling: parseInt(row.total_billing) || 0,
        totalRequests: parseInt(row.total_requests) || 0,
      };
    } catch (error) {
      logger.error('Failed to get daily usage', error);
      throw error;
    }
  }

  /**
   * Get monthly usage summary
   */
  static async getMonthlyUsage(
    apiKey: string,
    year: number,
    month: number
  ): Promise<{
    totalQueries: number;
    totalBilling: number;
    totalRequests: number;
    dailyBreakdown: any[];
  }> {
    try {
      const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
      const endDate = `${year}-${month.toString().padStart(2, '0')}-31`;

      const summaryResult = await pool.query(
        `SELECT 
          COUNT(*) as total_queries,
          SUM(billing_amount) as total_billing,
          SUM(request_count) as total_requests
         FROM v3_coupang_billing_usage
         WHERE api_key = $1 AND date >= $2 AND date <= $3`,
        [apiKey, startDate, endDate]
      );

      const dailyResult = await pool.query(
        `SELECT 
          date,
          COUNT(*) as queries,
          SUM(billing_amount) as billing,
          SUM(request_count) as requests
         FROM v3_coupang_billing_usage
         WHERE api_key = $1 AND date >= $2 AND date <= $3
         GROUP BY date
         ORDER BY date`,
        [apiKey, startDate, endDate]
      );

      const summary = summaryResult.rows[0];
      return {
        totalQueries: parseInt(summary.total_queries) || 0,
        totalBilling: parseInt(summary.total_billing) || 0,
        totalRequests: parseInt(summary.total_requests) || 0,
        dailyBreakdown: dailyResult.rows,
      };
    } catch (error) {
      logger.error('Failed to get monthly usage', error);
      throw error;
    }
  }
}