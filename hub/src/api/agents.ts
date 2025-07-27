import { Router } from 'express';
import { AgentManager } from '../agent/manager';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

/**
 * GET /api/v3/agents/status
 * 에이전트 상태 조회
 */
router.get('/status', asyncHandler(async (req: any, res: any) => {
  const stats = AgentManager.getStats();
  
  res.json({
    success: true,
    data: stats,
    timestamp: new Date().toISOString(),
  });
}));

export default router;