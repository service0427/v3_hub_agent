-- 순위 통계 확인 쿼리 (0 = 순위권 밖)

-- 1. 오늘 체크 결과 상세 보기
SELECT 
    keyword,
    product_code,
    check_1, check_2, check_3, check_4, check_5,
    check_6, check_7, check_8, check_9, check_10,
    total_checks,
    found_count,
    min_rank,
    max_rank,
    ROUND(avg_rank::numeric, 2) as avg_rank,
    CASE 
        WHEN found_count = 0 THEN '전부 순위권 밖'
        WHEN found_count = total_checks THEN '전부 발견'
        ELSE found_count || '/' || total_checks || ' 발견'
    END as status
FROM v3_keyword_ranking_checks
WHERE check_date = CURRENT_DATE
ORDER BY keyword
LIMIT 20;

-- 2. 순위권 밖 통계
SELECT 
    COUNT(*) as total_keywords,
    SUM(total_checks) as total_checks,
    SUM(found_count) as total_found,
    SUM(total_checks - found_count) as out_of_range_count,
    ROUND(100.0 * SUM(found_count) / NULLIF(SUM(total_checks), 0), 2) as found_percentage
FROM v3_keyword_ranking_checks
WHERE check_date = CURRENT_DATE;

-- 3. 키워드별 발견율
SELECT 
    keyword,
    product_code,
    total_checks,
    found_count,
    ROUND(100.0 * found_count / NULLIF(total_checks, 0), 2) as found_rate,
    CASE 
        WHEN found_count = 0 THEN '❌ 항상 순위권 밖'
        WHEN found_count = total_checks THEN '✅ 항상 발견'
        ELSE '⚠️ 가끔 발견'
    END as reliability
FROM v3_keyword_ranking_checks
WHERE check_date = CURRENT_DATE
ORDER BY found_rate DESC, keyword;

-- 4. 체크별 결과 분포
WITH check_results AS (
    SELECT 
        'check_1' as check_num,
        SUM(CASE WHEN check_1 > 0 THEN 1 ELSE 0 END) as found,
        SUM(CASE WHEN check_1 = 0 THEN 1 ELSE 0 END) as not_found,
        SUM(CASE WHEN check_1 IS NULL THEN 1 ELSE 0 END) as not_checked
    FROM v3_keyword_ranking_checks
    WHERE check_date = CURRENT_DATE
    
    UNION ALL
    
    SELECT 
        'check_2' as check_num,
        SUM(CASE WHEN check_2 > 0 THEN 1 ELSE 0 END) as found,
        SUM(CASE WHEN check_2 = 0 THEN 1 ELSE 0 END) as not_found,
        SUM(CASE WHEN check_2 IS NULL THEN 1 ELSE 0 END) as not_checked
    FROM v3_keyword_ranking_checks
    WHERE check_date = CURRENT_DATE
    
    -- check_3 ~ check_10도 동일한 방식으로...
)
SELECT * FROM check_results;