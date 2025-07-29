-- v3 에이전트 설정 테이블 생성
-- 에이전트 동작 설정을 DB에서 관리하기 위한 테이블

-- 에이전트 설정 테이블
CREATE TABLE IF NOT EXISTS v3_agent_config (
    config_key VARCHAR(50) PRIMARY KEY,
    config_value VARCHAR(255) NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 현재 사용 중인 설정값들을 기본값으로 삽입
INSERT INTO v3_agent_config (config_key, config_value, description) VALUES
-- 대기 시간 설정 (run.sh 기준)
('success_delay', '5', '성공 후 대기 시간(초)'),
('fail_delay', '60', '실패 후 기본 대기 시간(초)'),
('fail_delay_max', '600', '실패 후 최대 대기 시간(초)'),
('block_delay', '60', '차단 후 기본 대기 시간(초) - 실패와 동일'),
('block_delay_max', '600', '차단 후 최대 대기 시간(초)'),
('no_keyword_delay', '60', '키워드 없을 때 기본 대기 시간(초)'),
('no_keyword_delay_max', '605', '키워드 없을 때 최대 대기 시간(초)'),

-- 배치 처리 설정 (.env 기준)
('keywords_per_batch', '1', '배치당 키워드 수'),
('max_pages', '5', '최대 검색 페이지 수'),
('batch_size', '10', '동시 처리 배치 크기'),
('batch_delay', '5000', '배치 간 대기 시간(ms)'),

-- 브라우저 설정
('browser_type', 'chrome', '기본 브라우저 (chrome/firefox/edge)'),
('headless', 'false', 'Headless 모드 (항상 false)'),
('window_width', '1200', '브라우저 창 너비'),
('window_height', '800', '브라우저 창 높이'),

-- API 설정
('hub_api_url', 'http://localhost:3331', 'Hub API URL'),
('api_timeout', '20000', 'API 타임아웃(ms)'),
('default_timeout', '30000', '기본 페이지 타임아웃(ms)'),

-- 기타 설정
('log_level', 'info', '로그 레벨 (info/debug/error)'),
('config_refresh_interval', '10', '설정 갱신 주기(실행 횟수)'),
('auto_ip_rotate_threshold', '5', '자동 IP 변경 임계값(연속 차단 횟수)'),
('browser_rotate_enabled', 'false', '브라우저 자동 전환 활성화'),

-- 차단 감지 패턴
('block_patterns', 'BLOCKED|blocked|차단|Timeout exceeded|403|chrome-error://|Network/page error|Page error detected|ERR_HTTP2_PROTOCOL_ERROR', '차단 감지 패턴')
ON CONFLICT (config_key) DO UPDATE 
SET config_value = EXCLUDED.config_value,
    description = EXCLUDED.description,
    updated_at = NOW();


-- 설정 변경 시 updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_v3_agent_config_timestamp ON v3_agent_config;
CREATE TRIGGER update_v3_agent_config_timestamp
    BEFORE UPDATE ON v3_agent_config
    FOR EACH ROW
    EXECUTE FUNCTION update_config_timestamp();


-- 유용한 뷰: 현재 설정 보기
CREATE OR REPLACE VIEW v3_current_config AS
SELECT 
    config_key,
    config_value,
    description,
    to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS') as last_updated
FROM v3_agent_config
ORDER BY 
    CASE 
        WHEN config_key LIKE '%delay%' THEN 1
        WHEN config_key LIKE '%batch%' THEN 2
        WHEN config_key LIKE '%browser%' THEN 3
        ELSE 4
    END,
    config_key;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_agent_config_updated ON v3_agent_config(updated_at);

-- 테이블 코멘트
COMMENT ON TABLE v3_agent_config IS '에이전트 전역 설정';

-- 컬럼 코멘트
COMMENT ON COLUMN v3_agent_config.config_key IS '설정 키';
COMMENT ON COLUMN v3_agent_config.config_value IS '설정 값';
COMMENT ON COLUMN v3_agent_config.description IS '설정 설명';