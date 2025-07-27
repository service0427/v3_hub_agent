-- ParserHub V3 Database Schema
-- PostgreSQL initialization script
-- 
-- 운영 DB 접속: psql -h mkt.techb.kr -U techb_pp -d productparser_db
-- 실행: \i scripts/init-db.sql
--
-- 기존 productparser_db 에 v3_ 접두사 테이블들을 추가합니다.

-- API 키 관리 테이블
CREATE TABLE IF NOT EXISTS v3_api_keys (
    id SERIAL PRIMARY KEY,
    api_key VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 쿠팡 순위 히스토리
CREATE TABLE IF NOT EXISTS v3_coupang_ranking_history (
    id SERIAL PRIMARY KEY,
    api_key VARCHAR(255) NOT NULL,
    keyword VARCHAR(500) NOT NULL,
    product_code VARCHAR(255) NOT NULL,
    rank INTEGER,
    real_rank INTEGER,
    product_name VARCHAR(1000),
    price INTEGER,
    thumbnail_url TEXT,
    rating VARCHAR(10),
    review_count INTEGER,
    pages_searched INTEGER DEFAULT 1,
    browser_type VARCHAR(20) NOT NULL, -- chrome, firefox, edge
    vm_id VARCHAR(50),
    browser_version VARCHAR(100),
    execution_time_ms INTEGER,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 과금용 키워드+코드 조합 사용량 (일일 중복 제거)
CREATE TABLE IF NOT EXISTS v3_coupang_billing_usage (
    id SERIAL PRIMARY KEY,
    api_key VARCHAR(255) NOT NULL,
    keyword VARCHAR(500) NOT NULL,
    product_code VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    first_request_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_request_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    request_count INTEGER DEFAULT 1,
    billing_amount INTEGER DEFAULT 30, -- 30원 고정
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0
);

-- 브라우저별 기술 통계 (선택적)
CREATE TABLE IF NOT EXISTS v3_coupang_tech_stats (
    id SERIAL PRIMARY KEY,
    api_key VARCHAR(255) NOT NULL,
    browser_type VARCHAR(20) NOT NULL, -- chrome, firefox, edge
    total_requests INTEGER DEFAULT 0,
    blocked_requests INTEGER DEFAULT 0,
    avg_response_time_ms INTEGER DEFAULT 0,
    date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_ranking_history_api_key_browser ON v3_coupang_ranking_history(api_key, browser_type);
CREATE INDEX IF NOT EXISTS idx_ranking_history_keyword_code ON v3_coupang_ranking_history(keyword, product_code);
CREATE INDEX IF NOT EXISTS idx_ranking_history_created_at ON v3_coupang_ranking_history(created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_usage_unique_daily ON v3_coupang_billing_usage(api_key, keyword, product_code, date);
CREATE INDEX IF NOT EXISTS idx_billing_usage_api_key_date ON v3_coupang_billing_usage(api_key, date);
CREATE INDEX IF NOT EXISTS idx_billing_usage_keyword_code_date ON v3_coupang_billing_usage(keyword, product_code, date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tech_stats_unique_daily ON v3_coupang_tech_stats(api_key, browser_type, date);
CREATE INDEX IF NOT EXISTS idx_tech_stats_browser_date ON v3_coupang_tech_stats(browser_type, date);

-- 테스트 API 키 삽입
INSERT INTO v3_api_keys (api_key, name, description) 
VALUES ('test-api-key-123', 'Test API Key', 'Development and testing purposes')
ON CONFLICT (api_key) DO NOTHING;

-- 데이터 정리 함수 (90일 후 히스토리 삭제)
CREATE OR REPLACE FUNCTION cleanup_old_data() RETURNS void AS $$
BEGIN
    -- 90일 이전 히스토리 데이터 삭제
    DELETE FROM v3_coupang_ranking_history 
    WHERE created_at < NOW() - INTERVAL '90 days';
    
    -- 1년 이전 기술 통계 삭제
    DELETE FROM v3_coupang_tech_stats 
    WHERE date < NOW() - INTERVAL '1 year';
    
    RAISE NOTICE 'Old data cleanup completed';
END;
$$ LANGUAGE plpgsql;

-- 주석
COMMENT ON TABLE v3_api_keys IS 'API 키 관리 테이블';
COMMENT ON TABLE v3_coupang_ranking_history IS '쿠팡 순위 조회 이력 (90일 보관)';
COMMENT ON TABLE v3_coupang_billing_usage IS '과금용 키워드+코드 조합 사용량 (영구 보관)';
COMMENT ON TABLE v3_coupang_tech_stats IS '브라우저별 기술 통계 (1년 보관)';

COMMENT ON COLUMN v3_coupang_billing_usage.billing_amount IS '과금액 (keyword+code 조합당 30원 고정)';
COMMENT ON COLUMN v3_coupang_ranking_history.real_rank IS '광고 제외한 실제 순위';
COMMENT ON COLUMN v3_coupang_ranking_history.browser_type IS '사용된 브라우저 (chrome/firefox/edge)';

-- 완료 메시지
SELECT 'ParserHub V3 database schema initialized successfully!' AS status;