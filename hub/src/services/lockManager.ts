import { createLogger } from '../utils/logger';

const logger = createLogger('services:lockManager');

interface Lock {
  keyword: string;
  productCode: string;
  agentId: string;
  lockedAt: Date;
}

export class LockManager {
  private locks: Map<string, Lock> = new Map();
  private readonly lockTimeout = 20000; // 20초
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // 5초마다 타임아웃된 락 정리
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredLocks();
    }, 5000);
  }

  /**
   * 키워드에 대한 락 획득
   */
  acquireLock(keyword: string, productCode: string, agentId: string): boolean {
    const key = `${keyword}:${productCode}`;
    const existingLock = this.locks.get(key);

    // 이미 락이 있는 경우
    if (existingLock) {
      const elapsed = Date.now() - existingLock.lockedAt.getTime();
      
      // 타임아웃 확인
      if (elapsed > this.lockTimeout) {
        logger.warn('Lock expired, replacing', { 
          keyword, 
          productCode, 
          previousAgent: existingLock.agentId,
          elapsed 
        });
      } else {
        // 아직 유효한 락
        return false;
      }
    }

    // 새로운 락 설정
    this.locks.set(key, {
      keyword,
      productCode,
      agentId,
      lockedAt: new Date()
    });

    logger.info('Lock acquired', { keyword, productCode, agentId });
    return true;
  }

  /**
   * 락 해제
   */
  releaseLock(keyword: string, productCode: string, agentId: string): boolean {
    const key = `${keyword}:${productCode}`;
    const lock = this.locks.get(key);

    if (!lock) {
      return true; // 이미 없으면 성공으로 처리
    }

    // 락 소유자 확인
    if (lock.agentId !== agentId) {
      logger.warn('Lock release denied - wrong agent', { 
        keyword, 
        productCode, 
        requestAgent: agentId,
        lockOwner: lock.agentId 
      });
      return false;
    }

    this.locks.delete(key);
    logger.info('Lock released', { keyword, productCode, agentId });
    return true;
  }

  /**
   * 여러 키워드에 대한 락 획득 시도
   */
  acquireMultipleLocks(keywords: Array<{keyword: string, productCode: string}>, agentId: string): Array<{keyword: string, productCode: string}> {
    const acquired: Array<{keyword: string, productCode: string}> = [];

    for (const item of keywords) {
      if (this.acquireLock(item.keyword, item.productCode, agentId)) {
        acquired.push(item);
      }
    }

    return acquired;
  }

  /**
   * 에이전트의 모든 락 해제
   */
  releaseAgentLocks(agentId: string): number {
    let released = 0;

    for (const [key, lock] of this.locks.entries()) {
      if (lock.agentId === agentId) {
        this.locks.delete(key);
        released++;
      }
    }

    if (released > 0) {
      logger.info('Released all locks for agent', { agentId, count: released });
    }

    return released;
  }

  /**
   * 만료된 락 정리
   */
  private cleanupExpiredLocks(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, lock] of this.locks.entries()) {
      const elapsed = now - lock.lockedAt.getTime();
      
      if (elapsed > this.lockTimeout) {
        this.locks.delete(key);
        cleaned++;
        
        logger.warn('Lock expired and removed', { 
          keyword: lock.keyword,
          productCode: lock.productCode,
          agentId: lock.agentId,
          elapsed 
        });
      }
    }

    if (cleaned > 0) {
      logger.info('Cleaned up expired locks', { count: cleaned });
    }
  }

  /**
   * 현재 락 상태 조회
   */
  getStatus(): { total: number, locks: Lock[] } {
    return {
      total: this.locks.size,
      locks: Array.from(this.locks.values())
    };
  }

  /**
   * 정리
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.locks.clear();
  }
}

// Singleton instance
export const lockManager = new LockManager();