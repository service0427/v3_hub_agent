-- 키워드 체크 상태 확인 쿼리

-- 1. 오늘 체크 현황 보기
SELECT 
    kl.keyword,
    kl.product_code,
    krc.check_1, krc.check_2, krc.check_3, krc.check_4, krc.check_5,
    krc.check_6, krc.check_7, krc.check_8, krc.check_9, krc.check_10,
    krc.updated_at,
    GREATEST(
        COALESCE(krc.check_time_1::TIME, '00:00:00'::TIME),
        COALESCE(krc.check_time_2::TIME, '00:00:00'::TIME),
        COALESCE(krc.check_time_3::TIME, '00:00:00'::TIME),
        COALESCE(krc.check_time_4::TIME, '00:00:00'::TIME),
        COALESCE(krc.check_time_5::TIME, '00:00:00'::TIME),
        COALESCE(krc.check_time_6::TIME, '00:00:00'::TIME),
        COALESCE(krc.check_time_7::TIME, '00:00:00'::TIME),
        COALESCE(krc.check_time_8::TIME, '00:00:00'::TIME),
        COALESCE(krc.check_time_9::TIME, '00:00:00'::TIME),
        COALESCE(krc.check_time_10::TIME, '00:00:00'::TIME)
    ) as last_check_time,
    krc.total_checks,
    krc.found_count
FROM v3_keyword_list kl
LEFT JOIN v3_keyword_ranking_checks krc 
    ON kl.keyword = krc.keyword 
    AND kl.product_code = krc.product_code 
    AND krc.check_date = CURRENT_DATE
WHERE kl.is_active = TRUE
ORDER BY 
    CASE 
        WHEN krc.id IS NULL THEN '1900-01-01'::TIMESTAMP
        ELSE krc.updated_at 
    END ASC
LIMIT 20;

-- 2. 빈 슬롯이 있는 키워드 수
SELECT COUNT(DISTINCT kl.keyword) as keywords_with_empty_slots
FROM v3_keyword_list kl
LEFT JOIN v3_keyword_ranking_checks krc 
    ON kl.keyword = krc.keyword 
    AND kl.product_code = krc.product_code 
    AND krc.check_date = CURRENT_DATE
WHERE kl.is_active = TRUE 
    AND (
        krc.id IS NULL OR
        krc.check_1 IS NULL OR krc.check_2 IS NULL OR
        krc.check_3 IS NULL OR krc.check_4 IS NULL OR
        krc.check_5 IS NULL OR krc.check_6 IS NULL OR
        krc.check_7 IS NULL OR krc.check_8 IS NULL OR
        krc.check_9 IS NULL OR krc.check_10 IS NULL
    );

-- 3. 다음에 체크될 키워드 미리보기 (마지막 체크가 오래된 순)
SELECT 
    kl.keyword,
    kl.product_code,
    CASE 
        WHEN krc.id IS NULL THEN '체크 안함'
        ELSE krc.updated_at::TEXT
    END as last_update,
    CASE 
        WHEN krc.id IS NULL THEN 0
        ELSE krc.total_checks
    END as checks_today
FROM v3_keyword_list kl
LEFT JOIN v3_keyword_ranking_checks krc 
    ON kl.keyword = krc.keyword 
    AND kl.product_code = krc.product_code 
    AND krc.check_date = CURRENT_DATE
WHERE kl.is_active = TRUE 
    AND (
        krc.id IS NULL OR
        krc.check_1 IS NULL OR krc.check_2 IS NULL OR
        krc.check_3 IS NULL OR krc.check_4 IS NULL OR
        krc.check_5 IS NULL OR krc.check_6 IS NULL OR
        krc.check_7 IS NULL OR krc.check_8 IS NULL OR
        krc.check_9 IS NULL OR krc.check_10 IS NULL
    )
ORDER BY 
    CASE 
        WHEN krc.id IS NULL THEN '1900-01-01'::TIMESTAMP
        ELSE krc.updated_at 
    END ASC,
    GREATEST(
        COALESCE(krc.check_time_1::TIME, '00:00:00'::TIME),
        COALESCE(krc.check_time_2::TIME, '00:00:00'::TIME),
        COALESCE(krc.check_time_3::TIME, '00:00:00'::TIME),
        COALESCE(krc.check_time_4::TIME, '00:00:00'::TIME),
        COALESCE(krc.check_time_5::TIME, '00:00:00'::TIME),
        COALESCE(krc.check_time_6::TIME, '00:00:00'::TIME),
        COALESCE(krc.check_time_7::TIME, '00:00:00'::TIME),
        COALESCE(krc.check_time_8::TIME, '00:00:00'::TIME),
        COALESCE(krc.check_time_9::TIME, '00:00:00'::TIME),
        COALESCE(krc.check_time_10::TIME, '00:00:00'::TIME)
    ) ASC,
    kl.id ASC
LIMIT 10;