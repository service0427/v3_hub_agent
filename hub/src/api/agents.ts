import { Router } from 'express';
import { AgentManager } from '../agent/manager';
import { RollingManager } from '../agent/rolling';
import { HeartbeatManager } from '../agent/heartbeat';
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

/**
 * GET /api/v3/agents/rolling-status
 * 롤링 상태 조회 (하트비트, 쿨다운, 사용 순서 등)
 */
router.get('/rolling-status', asyncHandler(async (req: any, res: any) => {
  const rollingStats = RollingManager.getStats();
  
  res.json({
    success: true,
    data: rollingStats,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /api/v3/agents/health
 * 각 에이전트의 헬스 상태 조회
 */
router.get('/health', asyncHandler(async (req: any, res: any) => {
  const agents = AgentManager.getAllAgents();
  const healthStatus = agents.map(agent => ({
    id: agent.id,
    vmId: agent.vmId,
    browser: agent.browser,
    status: agent.status,
    health: HeartbeatManager.getAgentHealth(agent.id),
    tasksCompleted: agent.tasksCompleted,
    lastActivity: agent.lastActivity,
    host: agent.remoteAddress && agent.port ? `${agent.remoteAddress}:${agent.port}` : undefined,
  }));
  
  res.json({
    success: true,
    data: healthStatus,
    timestamp: new Date().toISOString(),
  });
}));

export default router;