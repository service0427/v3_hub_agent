import { Socket } from 'socket.io';
import { createLogger } from '../utils/logger';
import { AgentManager } from './manager';

const logger = createLogger('heartbeat');

export class HeartbeatManager {
  private static heartbeatInterval = 30000; // 30초
  private static heartbeatTimeout = 60000; // 60초
  private static lastHeartbeat: Map<string, Date> = new Map();
  private static checkInterval: NodeJS.Timeout;

  /**
   * Start heartbeat monitoring
   */
  static start(): void {
    // 주기적으로 하트비트 체크
    this.checkInterval = setInterval(() => {
      this.checkAgentHealth();
    }, this.heartbeatInterval);

    logger.info('Heartbeat monitoring started');
  }

  /**
   * Stop heartbeat monitoring
   */
  static stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }

  /**
   * Register agent heartbeat
   */
  static registerHeartbeat(agentId: string): void {
    this.lastHeartbeat.set(agentId, new Date());
  }

  /**
   * Update agent heartbeat
   */
  static updateHeartbeat(agentId: string): void {
    this.lastHeartbeat.set(agentId, new Date());
    
    // 에이전트 상태를 healthy로 업데이트
    const agent = AgentManager.getAgent(agentId);
    if (agent && agent.status === 'error') {
      agent.status = 'idle';
      logger.info('Agent recovered from error state', { agentId });
    }
  }

  /**
   * Check all agents health
   */
  private static checkAgentHealth(): void {
    const now = new Date();
    
    this.lastHeartbeat.forEach((lastPing, agentId) => {
      const timeSinceLastPing = now.getTime() - lastPing.getTime();
      
      if (timeSinceLastPing > this.heartbeatTimeout) {
        const agent = AgentManager.getAgent(agentId);
        if (agent && agent.status !== 'error') {
          agent.status = 'error';
          logger.warn('Agent heartbeat timeout', {
            agentId,
            lastPing,
            timeout: timeSinceLastPing
          });
        }
      }
    });
  }

  /**
   * Remove agent heartbeat
   */
  static removeHeartbeat(agentId: string): void {
    this.lastHeartbeat.delete(agentId);
  }

  /**
   * Get agent health status
   */
  static getAgentHealth(agentId: string): {
    healthy: boolean;
    lastHeartbeat?: Date;
    timeSinceLastHeartbeat?: number;
  } {
    const lastPing = this.lastHeartbeat.get(agentId);
    if (!lastPing) {
      return { healthy: false };
    }

    const timeSinceLastPing = new Date().getTime() - lastPing.getTime();
    const healthy = timeSinceLastPing <= this.heartbeatTimeout;

    return {
      healthy,
      lastHeartbeat: lastPing,
      timeSinceLastHeartbeat: timeSinceLastPing
    };
  }
}