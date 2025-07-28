-- V3 키워드 순위 반복 체크 시스템 테이블
-- 작성일: 2025-07-28
-- 용도: 키워드별 순위를 하루 10-15회 반복 체크하여 저장

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
    
    UNIQUE KEY unique_keyword_code (keyword, product_code),
    INDEX idx_active (is_active),
    INDEX idx_priority (priority),
    INDEX idx_category (category)
);

-- 2. 키워드 순위 반복 체크 결과 테이블
CREATE TABLE IF NOT EXISTS v3_keyword_ranking_checks (
    id SERIAL PRIMARY KEY,
    keyword VARCHAR(500) NOT NULL,
    product_code VARCHAR(255) NOT NULL,
    check_date DATE NOT NULL,
    
    -- 반복 체크 순위 (최대 15회)
    -- NULL = 미발견 또는 미체크
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
    check_11 INTEGER,
    check_12 INTEGER,
    check_13 INTEGER,
    check_14 INTEGER,
    check_15 INTEGER,
    
    -- 체크 시각 기록 (선택사항)
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
    check_time_11 TIME,
    check_time_12 TIME,
    check_time_13 TIME,
    check_time_14 TIME,
    check_time_15 TIME,
    
    -- 통계 정보
    total_checks INTEGER DEFAULT 0,      -- 실제 체크한 횟수
    found_count INTEGER DEFAULT 0,       -- 발견된 횟수
    min_rank INTEGER,                    -- 최고 순위
    max_rank INTEGER,                    -- 최저 순위
    avg_rank DECIMAL(5,2),               -- 평균 순위
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE KEY unique_keyword_code_date (keyword, product_code, check_date),
    INDEX idx_check_date (check_date),
    INDEX idx_keyword (keyword),
    INDEX idx_product_code (product_code)
);

-- 3. 체크 실행 로그 테이블
CREATE TABLE IF NOT EXISTS v3_keyword_check_logs (
    id SERIAL PRIMARY KEY,
    check_date DATE NOT NULL,
    check_number INTEGER NOT NULL,       -- 체크 회차 (1-15)
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    total_keywords INTEGER DEFAULT 0,    -- 체크 대상 키워드 수
    checked_keywords INTEGER DEFAULT 0,  -- 실제 체크한 키워드 수
    found_keywords INTEGER DEFAULT 0,    -- 순위 발견된 키워드 수
    failed_keywords INTEGER DEFAULT 0,   -- 실패한 키워드 수
    status VARCHAR(20) DEFAULT 'running', -- running, completed, failed
    error_message TEXT,
    
    INDEX idx_check_date_number (check_date, check_number),
    INDEX idx_status (status)
);

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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_check_date_number (check_date, check_number),
    INDEX idx_keyword_code (keyword, product_code)
);

-- 5. 통계 뷰 (일별 요약)
CREATE OR REPLACE VIEW v3_keyword_daily_stats AS
SELECT 
    check_date,
    COUNT(DISTINCT CONCAT(keyword, '|', product_code)) as total_keywords,
    SUM(found_count) as total_found,
    AVG(found_count) as avg_found_per_keyword,
    AVG(avg_rank) as overall_avg_rank,
    MIN(min_rank) as best_rank,
    MAX(max_rank) as worst_rank
FROM v3_keyword_ranking_checks
GROUP BY check_date;

-- 6. 순위 변동성 계산 함수
DELIMITER $$
CREATE FUNCTION calculate_rank_variance(
    p_check_1 INT, p_check_2 INT, p_check_3 INT, p_check_4 INT, p_check_5 INT,
    p_check_6 INT, p_check_7 INT, p_check_8 INT, p_check_9 INT, p_check_10 INT,
    p_check_11 INT, p_check_12 INT, p_check_13 INT, p_check_14 INT, p_check_15 INT
) RETURNS DECIMAL(10,2)
DETERMINISTIC
BEGIN
    DECLARE rank_sum INT DEFAULT 0;
    DECLARE rank_count INT DEFAULT 0;
    DECLARE rank_avg DECIMAL(10,2);
    DECLARE variance_sum DECIMAL(20,4) DEFAULT 0;
    
    -- 평균 계산
    IF p_check_1 IS NOT NULL THEN SET rank_sum = rank_sum + p_check_1, rank_count = rank_count + 1; END IF;
    IF p_check_2 IS NOT NULL THEN SET rank_sum = rank_sum + p_check_2, rank_count = rank_count + 1; END IF;
    IF p_check_3 IS NOT NULL THEN SET rank_sum = rank_sum + p_check_3, rank_count = rank_count + 1; END IF;
    IF p_check_4 IS NOT NULL THEN SET rank_sum = rank_sum + p_check_4, rank_count = rank_count + 1; END IF;
    IF p_check_5 IS NOT NULL THEN SET rank_sum = rank_sum + p_check_5, rank_count = rank_count + 1; END IF;
    IF p_check_6 IS NOT NULL THEN SET rank_sum = rank_sum + p_check_6, rank_count = rank_count + 1; END IF;
    IF p_check_7 IS NOT NULL THEN SET rank_sum = rank_sum + p_check_7, rank_count = rank_count + 1; END IF;
    IF p_check_8 IS NOT NULL THEN SET rank_sum = rank_sum + p_check_8, rank_count = rank_count + 1; END IF;
    IF p_check_9 IS NOT NULL THEN SET rank_sum = rank_sum + p_check_9, rank_count = rank_count + 1; END IF;
    IF p_check_10 IS NOT NULL THEN SET rank_sum = rank_sum + p_check_10, rank_count = rank_count + 1; END IF;
    IF p_check_11 IS NOT NULL THEN SET rank_sum = rank_sum + p_check_11, rank_count = rank_count + 1; END IF;
    IF p_check_12 IS NOT NULL THEN SET rank_sum = rank_sum + p_check_12, rank_count = rank_count + 1; END IF;
    IF p_check_13 IS NOT NULL THEN SET rank_sum = rank_sum + p_check_13, rank_count = rank_count + 1; END IF;
    IF p_check_14 IS NOT NULL THEN SET rank_sum = rank_sum + p_check_14, rank_count = rank_count + 1; END IF;
    IF p_check_15 IS NOT NULL THEN SET rank_sum = rank_sum + p_check_15, rank_count = rank_count + 1; END IF;
    
    IF rank_count = 0 THEN RETURN NULL; END IF;
    
    SET rank_avg = rank_sum / rank_count;
    
    -- 분산 계산
    IF p_check_1 IS NOT NULL THEN SET variance_sum = variance_sum + POWER(p_check_1 - rank_avg, 2); END IF;
    IF p_check_2 IS NOT NULL THEN SET variance_sum = variance_sum + POWER(p_check_2 - rank_avg, 2); END IF;
    IF p_check_3 IS NOT NULL THEN SET variance_sum = variance_sum + POWER(p_check_3 - rank_avg, 2); END IF;
    IF p_check_4 IS NOT NULL THEN SET variance_sum = variance_sum + POWER(p_check_4 - rank_avg, 2); END IF;
    IF p_check_5 IS NOT NULL THEN SET variance_sum = variance_sum + POWER(p_check_5 - rank_avg, 2); END IF;
    IF p_check_6 IS NOT NULL THEN SET variance_sum = variance_sum + POWER(p_check_6 - rank_avg, 2); END IF;
    IF p_check_7 IS NOT NULL THEN SET variance_sum = variance_sum + POWER(p_check_7 - rank_avg, 2); END IF;
    IF p_check_8 IS NOT NULL THEN SET variance_sum = variance_sum + POWER(p_check_8 - rank_avg, 2); END IF;
    IF p_check_9 IS NOT NULL THEN SET variance_sum = variance_sum + POWER(p_check_9 - rank_avg, 2); END IF;
    IF p_check_10 IS NOT NULL THEN SET variance_sum = variance_sum + POWER(p_check_10 - rank_avg, 2); END IF;
    IF p_check_11 IS NOT NULL THEN SET variance_sum = variance_sum + POWER(p_check_11 - rank_avg, 2); END IF;
    IF p_check_12 IS NOT NULL THEN SET variance_sum = variance_sum + POWER(p_check_12 - rank_avg, 2); END IF;
    IF p_check_13 IS NOT NULL THEN SET variance_sum = variance_sum + POWER(p_check_13 - rank_avg, 2); END IF;
    IF p_check_14 IS NOT NULL THEN SET variance_sum = variance_sum + POWER(p_check_14 - rank_avg, 2); END IF;
    IF p_check_15 IS NOT NULL THEN SET variance_sum = variance_sum + POWER(p_check_15 - rank_avg, 2); END IF;
    
    RETURN SQRT(variance_sum / rank_count);
END$$
DELIMITER ;

-- 7. 트리거: updated_at 자동 업데이트
DELIMITER $$
CREATE TRIGGER update_keyword_list_timestamp 
BEFORE UPDATE ON v3_keyword_list
FOR EACH ROW
BEGIN
    SET NEW.updated_at = CURRENT_TIMESTAMP;
END$$

CREATE TRIGGER update_ranking_checks_timestamp 
BEFORE UPDATE ON v3_keyword_ranking_checks
FOR EACH ROW
BEGIN
    SET NEW.updated_at = CURRENT_TIMESTAMP;
END$$
DELIMITER ;

-- 8. 샘플 데이터 입력 (예시)
-- INSERT INTO v3_keyword_list (keyword, product_code, product_name, category) VALUES
-- ('무선청소기', '7897467657', '다이슨 V12 무선청소기', '가전'),
-- ('노트북', '8814775613', '삼성 갤럭시북3', 'IT'),
-- ('르누아르', '92681567022', '르누아르 화집', '도서');

-- 9. 유용한 쿼리 예시

-- 특정 키워드의 일일 순위 변화 조회
-- SELECT * FROM v3_keyword_ranking_checks 
-- WHERE keyword = '무선청소기' AND check_date = CURDATE();

-- 순위 변동성이 큰 키워드 찾기
-- SELECT 
--     keyword, 
--     product_code,
--     check_date,
--     (max_rank - min_rank) as rank_range,
--     calculate_rank_variance(check_1, check_2, check_3, check_4, check_5, 
--                           check_6, check_7, check_8, check_9, check_10,
--                           check_11, check_12, check_13, check_14, check_15) as variance
-- FROM v3_keyword_ranking_checks
-- WHERE check_date = CURDATE()
-- ORDER BY variance DESC
-- LIMIT 50;