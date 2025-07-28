-- V3 키워드 순위 반복 체크 시스템 테이블 (PostgreSQL)
-- 작성일: 2025-07-28
-- 용도: 키워드별 순위를 하루 10회 반복 체크하여 저장

-- 1. 키워드 목록 관리 테이블
CREATE TABLE IF NOT EXISTS v3_keyword_list (
    id SERIAL PRIMARY KEY,
    keyword VARCHAR(500) NOT NULL,
    product_code VARCHAR(255) NOT NULL,
    product_name VARCHAR(1000),
    is_active BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 1,  -- 우선순위 (낮을수록 우선)
    category VARCHAR(100),       -- 카테고리 분류
    memo TEXT,                   -- 메모
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE (keyword, product_code)
);

CREATE INDEX IF NOT EXISTS idx_keyword_list_active ON v3_keyword_list(is_active);
CREATE INDEX IF NOT EXISTS idx_keyword_list_priority ON v3_keyword_list(priority);
CREATE INDEX IF NOT EXISTS idx_keyword_list_category ON v3_keyword_list(category);

-- 2. 키워드 순위 반복 체크 결과 테이블
CREATE TABLE IF NOT EXISTS v3_keyword_ranking_checks (
    id SERIAL PRIMARY KEY,
    keyword VARCHAR(500) NOT NULL,
    product_code VARCHAR(255) NOT NULL,
    check_date DATE NOT NULL,
    
    -- 반복 체크 순위 (최대 10회)
    -- 0 = 순위에서 미발견, NULL = 미체크
    check_1 INTEGER,
    check_2 INTEGER,
    check_3 INTEGER,
    check_4 INTEGER,
    check_5 INTEGER,
    check_6 INTEGER,
    check_7 INTEGER,
    check_8 INTEGER,
    check_9 INTEGER,
    check_10 INTEGER,
    
    -- 체크 시각 기록
    check_time_1 TIME,
    check_time_2 TIME,
    check_time_3 TIME,
    check_time_4 TIME,
    check_time_5 TIME,
    check_time_6 TIME,
    check_time_7 TIME,
    check_time_8 TIME,
    check_time_9 TIME,
    check_time_10 TIME,
    
    -- 통계 정보
    total_checks INTEGER DEFAULT 0,      -- 실제 체크한 횟수
    found_count INTEGER DEFAULT 0,       -- 발견된 횟수
    min_rank INTEGER,                    -- 최고 순위
    max_rank INTEGER,                    -- 최저 순위
    avg_rank DECIMAL(5,2),               -- 평균 순위
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE (keyword, product_code, check_date)
);

CREATE INDEX IF NOT EXISTS idx_ranking_checks_date ON v3_keyword_ranking_checks(check_date);
CREATE INDEX IF NOT EXISTS idx_ranking_checks_keyword ON v3_keyword_ranking_checks(keyword);
CREATE INDEX IF NOT EXISTS idx_ranking_checks_product_code ON v3_keyword_ranking_checks(product_code);

-- 3. 체크 실행 로그 테이블
CREATE TABLE IF NOT EXISTS v3_keyword_check_logs (
    id SERIAL PRIMARY KEY,
    check_date DATE NOT NULL,
    check_number INTEGER NOT NULL,       -- 체크 회차 (1-10)
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    total_keywords INTEGER DEFAULT 0,    -- 체크 대상 키워드 수
    checked_keywords INTEGER DEFAULT 0,  -- 실제 체크한 키워드 수
    found_keywords INTEGER DEFAULT 0,    -- 순위 발견된 키워드 수
    failed_keywords INTEGER DEFAULT 0,   -- 실패한 키워드 수
    status VARCHAR(20) DEFAULT 'running', -- running, completed, failed
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_check_logs_date_number ON v3_keyword_check_logs(check_date, check_number);
CREATE INDEX IF NOT EXISTS idx_check_logs_status ON v3_keyword_check_logs(status);

-- 4. 체크 실패 상세 로그
CREATE TABLE IF NOT EXISTS v3_keyword_check_failures (
    id SERIAL PRIMARY KEY,
    check_date DATE NOT NULL,
    check_number INTEGER NOT NULL,
    keyword VARCHAR(500) NOT NULL,
    product_code VARCHAR(255) NOT NULL,
    error_type VARCHAR(50),              -- timeout, blocked, network_error, etc
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_check_failures_date_number ON v3_keyword_check_failures(check_date, check_number);
CREATE INDEX IF NOT EXISTS idx_check_failures_keyword_code ON v3_keyword_check_failures(keyword, product_code);

-- 5. 통계 뷰 (일별 요약)
CREATE OR REPLACE VIEW v3_keyword_daily_stats AS
SELECT 
    check_date,
    COUNT(DISTINCT (keyword || '|' || product_code)) as total_keywords,
    SUM(found_count) as total_found,
    AVG(found_count) as avg_found_per_keyword,
    AVG(avg_rank) as overall_avg_rank,
    MIN(min_rank) as best_rank,
    MAX(max_rank) as worst_rank
FROM v3_keyword_ranking_checks
GROUP BY check_date;

-- 6. updated_at 자동 업데이트 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 7. 트리거 생성
CREATE TRIGGER update_keyword_list_timestamp 
    BEFORE UPDATE ON v3_keyword_list
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ranking_checks_timestamp 
    BEFORE UPDATE ON v3_keyword_ranking_checks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 8. 샘플 데이터 입력 (예시)
-- INSERT INTO v3_keyword_list (keyword, product_code, product_name, category) VALUES
-- ('무선청소기', '7897467657', '다이슨 V12 무선청소기', '가전'),
-- ('노트북', '8814775613', '삼성 갤럭시북3', 'IT'),
-- ('르누아르', '92681567022', '르누아르 화집', '도서');