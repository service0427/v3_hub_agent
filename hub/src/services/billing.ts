import { BillingUsageModel } from '../db/models';
import { createLogger } from '../utils/logger';

const logger = createLogger('service:billing');

export class BillingService {
  /**
   * Process billing for a query
   * Returns true if this is a new query (should be billed)
   */
  static async processQuery(
    apiKey: string,
    keyword: string,
    productCode: string
  ): Promise<boolean> {
    try {
      const { isNew } = await BillingUsageModel.checkOrCreateDailyUsage(
        apiKey,
        keyword,
        productCode
      );

      if (isNew) {
        logger.info('New billable query', {
          apiKey,
          keyword,
          productCode,
          billingAmount: 30,
        });
      }

      return isNew;
    } catch (error) {
      logger.error('Failed to process billing', error);
      // Don't fail the request due to billing error
      return false;
    }
  }

  /**
   * Update request result for billing statistics
   */
  static async updateRequestResult(
    apiKey: string,
    keyword: string,
    productCode: string,
    success: boolean
  ): Promise<void> {
    try {
      await BillingUsageModel.updateRequestResult(
        apiKey,
        keyword,
        productCode,
        success
      );
    } catch (error) {
      logger.error('Failed to update request result', error);
      // Non-critical error, don't throw
    }
  }

  /**
   * Get daily billing summary
   */
  static async getDailySummary(apiKey: string, date?: string) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    return await BillingUsageModel.getDailyUsage(apiKey, targetDate);
  }

  /**
   * Get monthly billing summary
   */
  static async getMonthlySummary(apiKey: string, year: number, month: number) {
    return await BillingUsageModel.getMonthlyUsage(apiKey, year, month);
  }
}