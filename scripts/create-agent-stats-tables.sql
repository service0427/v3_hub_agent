-- v3 에이전트 통계 테이블 생성
-- 에이전트별 실행 통계 및 성능 모니터링을 위한 테이블

-- 1. 에이전트 일일 통계 테이블
CREATE TABLE IF NOT EXISTS v3_agent_stats (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(50) NOT NULL,
    agent_ip VARCHAR(45),
    browser VARCHAR(20) NOT NULL,
    stat_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- 실행 통계
    total_requests INTEGER DEFAULT 0,
    successful_searches INTEGER DEFAULT 0,
    failed_searches INTEGER DEFAULT 0,
    blocked_count INTEGER DEFAULT 0,
    
    -- 성능 지표
    avg_response_time DECIMAL(10,2),
    min_response_time DECIMAL(10,2),
    max_response_time DECIMAL(10,2),
    
    -- 순위 발견 통계
    ranks_found INTEGER DEFAULT 0,
    products_not_found INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_agent_date UNIQUE(agent_id, stat_date)
);

-- 2. 에이전트 에러 로그 테이블
CREATE TABLE IF NOT EXISTS v3_agent_errors (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(50) NOT NULL,
    agent_ip VARCHAR(45),
    browser VARCHAR(20),
    error_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    error_type VARCHAR(50), -- 'BLOCKED', 'TIMEOUT', 'NETWORK', 'HTTP2_ERROR', etc
    error_message TEXT,
    keyword VARCHAR(500),
    product_code VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. 에이전트 상태 추적 테이블
CREATE TABLE IF NOT EXISTS v3_agent_health (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(50) NOT NULL UNIQUE,
    agent_ip VARCHAR(45),
    browser VARCHAR(20),
    status VARCHAR(20) DEFAULT 'ACTIVE', -- 'ACTIVE', 'BLOCKED', 'INACTIVE', 'WARNING'
    last_success_at TIMESTAMP,
    last_error_at TIMESTAMP,
    consecutive_errors INTEGER DEFAULT 0,
    consecutive_blocks INTEGER DEFAULT 0,
    total_lifetime_requests BIGINT DEFAULT 0,
    total_lifetime_blocks BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_agent_stats_date ON v3_agent_stats(stat_date);
CREATE INDEX IF NOT EXISTS idx_agent_stats_agent ON v3_agent_stats(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_errors_time ON v3_agent_errors(error_time);
CREATE INDEX IF NOT EXISTS idx_agent_errors_type ON v3_agent_errors(error_type);
CREATE INDEX IF NOT EXISTS idx_agent_errors_agent ON v3_agent_errors(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_health_status ON v3_agent_health(status);

-- 테이블 코멘트
COMMENT ON TABLE v3_agent_stats IS '에이전트별 일일 실행 통계';
COMMENT ON TABLE v3_agent_errors IS '에이전트 에러 로그';
COMMENT ON TABLE v3_agent_health IS '에이전트 실시간 상태 추적';

-- 컬럼 코멘트
COMMENT ON COLUMN v3_agent_stats.agent_id IS '에이전트 고유 ID';
COMMENT ON COLUMN v3_agent_stats.total_requests IS '총 요청 수';
COMMENT ON COLUMN v3_agent_stats.successful_searches IS '성공한 검색 수';
COMMENT ON COLUMN v3_agent_stats.failed_searches IS '실패한 검색 수';
COMMENT ON COLUMN v3_agent_stats.blocked_count IS '차단된 횟수';
COMMENT ON COLUMN v3_agent_stats.ranks_found IS '순위를 찾은 횟수';
COMMENT ON COLUMN v3_agent_stats.products_not_found IS '상품을 찾지 못한 횟수 (순위 0)';

COMMENT ON COLUMN v3_agent_errors.error_type IS '에러 타입 (BLOCKED/TIMEOUT/NETWORK/HTTP2_ERROR 등)';
COMMENT ON COLUMN v3_agent_errors.error_message IS '상세 에러 메시지';

COMMENT ON COLUMN v3_agent_health.status IS '에이전트 상태 (ACTIVE/BLOCKED/INACTIVE/WARNING)';
COMMENT ON COLUMN v3_agent_health.consecutive_errors IS '연속 에러 횟수';
COMMENT ON COLUMN v3_agent_health.consecutive_blocks IS '연속 차단 횟수';
COMMENT ON COLUMN v3_agent_health.total_lifetime_requests IS '전체 누적 요청 수';
COMMENT ON COLUMN v3_agent_health.total_lifetime_blocks IS '전체 누적 차단 수';

-- 트리거 함수: updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 트리거 생성
DROP TRIGGER IF EXISTS update_v3_agent_stats_updated_at ON v3_agent_stats;
CREATE TRIGGER update_v3_agent_stats_updated_at 
    BEFORE UPDATE ON v3_agent_stats 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_v3_agent_health_updated_at ON v3_agent_health;
CREATE TRIGGER update_v3_agent_health_updated_at 
    BEFORE UPDATE ON v3_agent_health 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();