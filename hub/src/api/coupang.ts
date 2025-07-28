import { Router } from 'express';
import { AuthRequest, authenticateApiKey } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { apiLogger } from '../middleware/logger';
import { validateCoupangSearchRequest } from '../utils/validator';
import { ApiError, CoupangSearchResponse } from '../types';
import { BillingService } from '../services/billing';
import { RankingHistoryModel } from '../db/models';
import { AgentManager } from '../agent/manager';
import { RollingManager } from '../agent/rolling';
import { getAvailableBrowsers, isBrowserAvailable } from '../config/browser';
import { createLogger } from '../utils/logger';
import { io } from '../index';

const router = Router();
const logger = createLogger('api:coupang');

// Apply middleware
router.use(apiLogger);
router.use(authenticateApiKey);

/**
 * GET /api/v3/coupang
 * 쿠팡 제품 순위 조회 API
 */
router.get('/', asyncHandler(async (req: AuthRequest, res: any) => {
  const startTime = Date.now();

  // Validate request
  const { error, value } = validateCoupangSearchRequest(req.query);
  if (error) {
    throw new ApiError('VALIDATION_ERROR', error, 400);
  }

  const { keyword, code, pages, browser, host } = value!;
  const apiKey = req.apiKey!;

  logger.info('Coupang search request', { apiKey, keyword, code, pages, browser, host });

  // Check browser availability
  if (browser !== 'auto') {
    const availableBrowsers = getAvailableBrowsers();
    if (!availableBrowsers.includes(browser as any)) {
      throw new ApiError(
        'BROWSER_NOT_AVAILABLE',
        `브라우저 ${browser}는 현재 환경에서 사용할 수 없습니다. 사용 가능: ${availableBrowsers.join(', ')}`,
        400
      );
    }
  }

  // Process billing
  const isNewQuery = await BillingService.processQuery(apiKey, keyword, code);
  if (isNewQuery) {
    logger.info('New billable query processed', { apiKey, keyword, code });
  }

  try {
    // Create search task
    const task = AgentManager.createTask({
      apiKey,
      keyword,
      productCode: code,
      pages: pages || 1,
      browser: browser || 'auto',
    });

    // Select agent using rolling strategy or specific host
    const agent = RollingManager.getNextAgent(
      browser === 'auto' ? undefined : browser as any,
      host  // host 파라미터 전달
    );

    if (!agent) {
      throw new ApiError(
        'NO_AVAILABLE_AGENTS',
        '사용 가능한 에이전트가 없습니다. 잠시 후 다시 시도해주세요.',
        503
      );
    }

    // Assign task to agent
    AgentManager.assignTask(task, agent);

    // Send task to agent via Socket.IO
    io.to(agent.id).emit('task', {
      taskId: task.id,
      type: 'coupang-search',
      params: {
        keyword: task.keyword,
        targetCode: task.productCode,
        pages: task.pages,
      },
    });

    // Wait for result (with timeout)
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new ApiError('TIMEOUT', '검색 시간이 초과되었습니다', 504));
      }, 30000); // 30 seconds timeout

      // Listen for task completion
      const handleTaskComplete = (data: any) => {
        if (data.taskId === task.id) {
          clearTimeout(timeout);
          io.off('task-complete', handleTaskComplete);
          resolve(data);
        }
      };

      io.on('task-complete', handleTaskComplete);
    });

    const taskResult = result as any;
    const executionTime = Date.now() - startTime;

    // Save to history
    await RankingHistoryModel.save({
      apiKey,
      keyword,
      productCode: code,
      rank: taskResult.rank,
      realRank: taskResult.realRank,
      productName: taskResult.product?.name,
      price: taskResult.product?.price,
      thumbnailUrl: taskResult.product?.thumbnail,
      rating: taskResult.product?.rating,
      reviewCount: taskResult.product?.reviewCount,
      pagesSearched: pages || 1,
      browserType: agent.browser,
      vmId: agent.vmId,
      browserVersion: agent.browserVersion,
      executionTimeMs: executionTime,
      success: true,
    });

    // Update billing success count
    await BillingService.updateRequestResult(apiKey, keyword, code, true);

    // Complete task
    AgentManager.completeTask(task.id, taskResult, true);

    // Build response
    const response: CoupangSearchResponse = {
      success: true,
      data: {
        platform: 'coupang',
        keyword,
        code,
        rank: taskResult.rank,
        realRank: taskResult.realRank,
        product: taskResult.product,
        browser: agent.browser,
        agentInfo: {
          vmId: agent.vmId,
          browserVersion: agent.browserVersion,
        },
      },
      timestamp: new Date().toISOString(),
      executionTime: executionTime / 1000, // seconds
    };

    res.json(response);

  } catch (error: any) {
    // Update billing error count
    await BillingService.updateRequestResult(apiKey, keyword, code, false);

    // Save error to history
    await RankingHistoryModel.save({
      apiKey,
      keyword,
      productCode: code,
      pagesSearched: pages || 1,
      browserType: browser as any || 'chrome',
      executionTimeMs: Date.now() - startTime,
      success: false,
      errorMessage: error.message,
    });

    throw error;
  }
}));

/**
 * GET /api/v3/coupang/stats
 * 브라우저별 통계 조회
 */
router.get('/stats', asyncHandler(async (req: AuthRequest, res: any) => {
  const hours = parseInt(req.query.hours as string) || 24;
  const stats = await RankingHistoryModel.getBrowserStats(hours);
  
  res.json({
    success: true,
    data: stats,
    period: `${hours} hours`,
    timestamp: new Date().toISOString(),
  });
}));

export default router;