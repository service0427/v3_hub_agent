-- V3 배치 시스템 데이터베이스 무결성 검사

-- 1. 테이블 크기 및 인덱스 상태
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
    pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) as indexes_size,
    n_live_tup as row_count
FROM pg_tables 
LEFT JOIN pg_stat_user_tables ON tablename = relname
WHERE tablename LIKE 'v3_%'
ORDER BY tablename;

-- 2. 인덱스 효율성 확인
SELECT 
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE tablename LIKE 'v3_%'
ORDER BY tablename, indexname;

-- 3. 데이터 무결성 검사 - 중복 체크
SELECT 
    'v3_keyword_list' as table_name,
    COUNT(*) as total_rows,
    COUNT(DISTINCT keyword || '|' || product_code) as unique_combinations,
    COUNT(*) - COUNT(DISTINCT keyword || '|' || product_code) as duplicates
FROM v3_keyword_list

UNION ALL

SELECT 
    'v3_keyword_ranking_checks' as table_name,
    COUNT(*) as total_rows,
    COUNT(DISTINCT keyword || '|' || product_code || '|' || check_date) as unique_combinations,
    COUNT(*) - COUNT(DISTINCT keyword || '|' || product_code || '|' || check_date) as duplicates
FROM v3_keyword_ranking_checks;

-- 4. 체크 완료율 분석
WITH check_stats AS (
    SELECT 
        check_date,
        COUNT(*) as total_keywords,
        SUM(CASE WHEN check_1 IS NOT NULL THEN 1 ELSE 0 END) as check_1_done,
        SUM(CASE WHEN check_2 IS NOT NULL THEN 1 ELSE 0 END) as check_2_done,
        SUM(CASE WHEN check_3 IS NOT NULL THEN 1 ELSE 0 END) as check_3_done,
        SUM(CASE WHEN check_4 IS NOT NULL THEN 1 ELSE 0 END) as check_4_done,
        SUM(CASE WHEN check_5 IS NOT NULL THEN 1 ELSE 0 END) as check_5_done,
        SUM(CASE WHEN check_6 IS NOT NULL THEN 1 ELSE 0 END) as check_6_done,
        SUM(CASE WHEN check_7 IS NOT NULL THEN 1 ELSE 0 END) as check_7_done,
        SUM(CASE WHEN check_8 IS NOT NULL THEN 1 ELSE 0 END) as check_8_done,
        SUM(CASE WHEN check_9 IS NOT NULL THEN 1 ELSE 0 END) as check_9_done,
        SUM(CASE WHEN check_10 IS NOT NULL THEN 1 ELSE 0 END) as check_10_done
    FROM v3_keyword_ranking_checks
    GROUP BY check_date
)
SELECT 
    check_date,
    total_keywords,
    ROUND(100.0 * check_1_done / total_keywords, 2) as check_1_pct,
    ROUND(100.0 * check_2_done / total_keywords, 2) as check_2_pct,
    ROUND(100.0 * check_3_done / total_keywords, 2) as check_3_pct,
    ROUND(100.0 * check_10_done / total_keywords, 2) as check_10_pct
FROM check_stats
ORDER BY check_date DESC;

-- 5. 실패 패턴 분석
SELECT 
    error_type,
    COUNT(*) as error_count,
    COUNT(DISTINCT keyword || '|' || product_code) as affected_keywords,
    MIN(created_at) as first_occurrence,
    MAX(created_at) as last_occurrence
FROM v3_keyword_check_failures
WHERE check_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY error_type
ORDER BY error_count DESC;

-- 6. 순위 분포 분석
WITH rank_distribution AS (
    SELECT 
        CASE 
            WHEN rank_value = 0 THEN '0 (Not Found)'
            WHEN rank_value BETWEEN 1 AND 10 THEN '1-10'
            WHEN rank_value BETWEEN 11 AND 20 THEN '11-20'
            WHEN rank_value BETWEEN 21 AND 50 THEN '21-50'
            WHEN rank_value BETWEEN 51 AND 100 THEN '51-100'
            ELSE '100+'
        END as rank_range,
        COUNT(*) as count
    FROM (
        SELECT unnest(ARRAY[check_1, check_2, check_3, check_4, check_5, 
                           check_6, check_7, check_8, check_9, check_10]) as rank_value
        FROM v3_keyword_ranking_checks
        WHERE check_date = CURRENT_DATE
    ) ranks
    WHERE rank_value IS NOT NULL
    GROUP BY rank_range
)
SELECT * FROM rank_distribution
ORDER BY 
    CASE rank_range 
        WHEN '0 (Not Found)' THEN 0
        WHEN '1-10' THEN 1
        WHEN '11-20' THEN 2
        WHEN '21-50' THEN 3
        WHEN '51-100' THEN 4
        ELSE 5
    END;

-- 7. 체크 시간 분포 (얼마나 고르게 분산되었는지)
SELECT 
    EXTRACT(HOUR FROM check_time_1) as hour,
    COUNT(*) as check_count
FROM v3_keyword_ranking_checks
WHERE check_date = CURRENT_DATE
    AND check_time_1 IS NOT NULL
GROUP BY hour
ORDER BY hour;