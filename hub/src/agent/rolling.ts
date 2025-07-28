import { Agent, BrowserType, ApiError } from '../types';
import { createLogger } from '../utils/logger';
import { AgentManager } from './manager';
import { HeartbeatManager } from './heartbeat';

const logger = createLogger('rolling');

export class RollingManager {
  private static agentRotation: Map<string, number> = new Map(); // 에이전트별 마지막 사용 시간
  private static lastBlockInfo: Map<string, {
    blockedAt: Date;
    reason: string;
    count: number;
  }> = new Map(); // 차단 정보 (통계용)

  /**
   * Record blocking event (for statistics only, no cooldown)
   */
  static recordBlockingEvent(agentId: string, reason: string): void {
    const existing = this.lastBlockInfo.get(agentId);
    
    this.lastBlockInfo.set(agentId, {
      blockedAt: new Date(),
      reason,
      count: existing ? existing.count + 1 : 1
    });

    logger.info('Agent blocking event recorded', {
      agentId,
      reason,
      totalBlocks: this.lastBlockInfo.get(agentId)?.count
    });
  }

  /**
   * Get next available agent with rolling strategy
   */
  static getNextAgent(preferredBrowser?: BrowserType, host?: string): Agent | null {
    // host가 지정된 경우 - 특정 에이전트 직접 지정
    if (host) {
      const specificAgent = AgentManager.getAgentByHost(host);
      if (!specificAgent) {
        throw new ApiError('AGENT_NOT_FOUND', `지정된 에이전트를 찾을 수 없습니다: ${host}`, 404);
      }
      
      // 에이전트가 busy 상태인 경우
      if (specificAgent.status === 'busy') {
        throw new ApiError('AGENT_BUSY', `에이전트가 이미 작업 중입니다: ${host}`, 409);
      }
      
      // 헬스체크 확인
      const health = HeartbeatManager.getAgentHealth(specificAgent.id);
      if (!health.healthy) {
        throw new ApiError('AGENT_UNHEALTHY', `에이전트가 응답하지 않습니다: ${host}`, 503);
      }
      
      logger.info('Agent selected by host specification', {
        agentId: specificAgent.id,
        host,
        browser: specificAgent.browser
      });
      
      // 롤링 기록은 하지 않음 (격리 방식)
      return specificAgent;
    }
    const agents = AgentManager.getAllAgents();
    const now = new Date().getTime();

    // 사용 가능한 에이전트 필터링
    const availableAgents = agents.filter(agent => {
      // 1. idle 상태여야 함
      if (agent.status !== 'idle') return false;
      
      // 2. 헬스체크 통과
      const health = HeartbeatManager.getAgentHealth(agent.id);
      if (!health.healthy) return false;
      
      // 3. 브라우저 타입 매칭
      if (preferredBrowser && agent.browser !== preferredBrowser) return false;
      
      return true;
    });

    if (availableAgents.length === 0) {
      logger.warn('No available agents for rolling', { preferredBrowser });
      return null;
    }

    // 가장 오래 사용하지 않은 에이전트 선택 (Rolling)
    let selectedAgent: Agent | null = null;
    let oldestUsage = now;

    for (const agent of availableAgents) {
      const lastUsed = this.agentRotation.get(agent.id) || 0;
      if (lastUsed < oldestUsage) {
        oldestUsage = lastUsed;
        selectedAgent = agent;
      }
    }

    if (selectedAgent) {
      this.agentRotation.set(selectedAgent.id, now);
      logger.info('Agent selected by rolling strategy', {
        agentId: selectedAgent.id,
        browser: selectedAgent.browser,
        timeSinceLastUse: now - oldestUsage
      });
    }

    return selectedAgent;
  }

  /**
   * Get rolling statistics
   */
  static getStats() {
    const agents = AgentManager.getAllAgents();
    const now = new Date().getTime();

    const stats = {
      totalAgents: agents.length,
      availableAgents: 0,
      agentDetails: [] as any[]
    };

    agents.forEach(agent => {
      const health = HeartbeatManager.getAgentHealth(agent.id);
      const lastUsed = this.agentRotation.get(agent.id);
      const blockInfo = this.lastBlockInfo.get(agent.id);
      
      const isAvailable = agent.status === 'idle' && health.healthy;

      if (isAvailable) {
        stats.availableAgents++;
      }

      stats.agentDetails.push({
        id: agent.id,
        browser: agent.browser,
        status: agent.status,
        healthy: health.healthy,
        lastUsed: lastUsed ? new Date(lastUsed) : null,
        timeSinceLastUse: lastUsed ? now - lastUsed : null,
        lastBlocked: blockInfo?.blockedAt || null,
        blockCount: blockInfo?.count || 0,
        lastBlockReason: blockInfo?.reason || null,
        host: agent.remoteAddress && agent.port ? `${agent.remoteAddress}:${agent.port}` : undefined
      });
    });

    // 마지막 사용 시간 기준으로 정렬 (오래된 것부터)
    stats.agentDetails.sort((a, b) => {
      const aTime = a.lastUsed?.getTime() || 0;
      const bTime = b.lastUsed?.getTime() || 0;
      return aTime - bTime;
    });

    return stats;
  }
}