-- =====================================================
-- v3_keyword_ranking_checks 통합 정리 스크립트
-- 
-- 기능:
-- 1. 0값을 NULL로 리셋 (check_1 ~ check_10)
-- 2. 중간 NULL 값 제거하고 앞으로 당기기
-- 3. last_synced_check 올바르게 업데이트
-- 
-- 날짜: 현재 날짜 (CURRENT_DATE)
--
-- 실행 방법:
-- psql -h mkt.techb.kr -U techb_pp -d productparser_db -f /home/tech/v3_hub_agent/scripts/cleanup-checks.sql
-- =====================================================

-- ====== STEP 1: 현재 상태 확인 ======
\echo '===== 처리 전 데이터 상태 ====='
SELECT 
    'Total Records' as status,
    COUNT(*) as count
FROM v3_keyword_ranking_checks
WHERE check_date = CURRENT_DATE

UNION ALL

SELECT 
    'Records with 0 values (1-5)' as status,
    COUNT(*) as count
FROM v3_keyword_ranking_checks
WHERE check_date = CURRENT_DATE
  AND (check_1 = 0 OR check_2 = 0 OR check_3 = 0 OR check_4 = 0 OR check_5 = 0)

UNION ALL

SELECT 
    'Records with 0 values (6-10)' as status,
    COUNT(*) as count
FROM v3_keyword_ranking_checks
WHERE check_date = CURRENT_DATE
  AND (check_6 = 0 OR check_7 = 0 OR check_8 = 0 OR check_9 = 0 OR check_10 = 0)

UNION ALL

SELECT 
    'Records with gaps' as status,
    COUNT(*) as count
FROM v3_keyword_ranking_checks
WHERE check_date = CURRENT_DATE
  AND (
    -- check_1~5 gap check
    (check_1 IS NULL AND (check_2 IS NOT NULL OR check_3 IS NOT NULL OR check_4 IS NOT NULL OR check_5 IS NOT NULL))
    OR (check_2 IS NULL AND (check_3 IS NOT NULL OR check_4 IS NOT NULL OR check_5 IS NOT NULL))
    OR (check_3 IS NULL AND (check_4 IS NOT NULL OR check_5 IS NOT NULL))
    OR (check_4 IS NULL AND check_5 IS NOT NULL)
    -- check_6~10 gap check
    OR (check_5 IS NULL AND (check_6 IS NOT NULL OR check_7 IS NOT NULL OR check_8 IS NOT NULL OR check_9 IS NOT NULL OR check_10 IS NOT NULL))
    OR (check_6 IS NULL AND (check_7 IS NOT NULL OR check_8 IS NOT NULL OR check_9 IS NOT NULL OR check_10 IS NOT NULL))
    OR (check_7 IS NULL AND (check_8 IS NOT NULL OR check_9 IS NOT NULL OR check_10 IS NOT NULL))
    OR (check_8 IS NULL AND (check_9 IS NOT NULL OR check_10 IS NOT NULL))
    OR (check_9 IS NULL AND check_10 IS NOT NULL)
  )

ORDER BY status;

-- ====== STEP 2: 0값을 NULL로 리셋 ======
\echo ''
\echo '===== STEP 1: 0값을 NULL로 리셋 ====='

BEGIN;

UPDATE v3_keyword_ranking_checks
SET 
    -- 0인 값들만 NULL로 변경 (check_1~5)
    check_1 = CASE WHEN check_1 = 0 THEN NULL ELSE check_1 END,
    check_2 = CASE WHEN check_2 = 0 THEN NULL ELSE check_2 END,
    check_3 = CASE WHEN check_3 = 0 THEN NULL ELSE check_3 END,
    check_4 = CASE WHEN check_4 = 0 THEN NULL ELSE check_4 END,
    check_5 = CASE WHEN check_5 = 0 THEN NULL ELSE check_5 END,
    
    -- 0인 값들만 NULL로 변경 (check_6~10)
    check_6 = CASE WHEN check_6 = 0 THEN NULL ELSE check_6 END,
    check_7 = CASE WHEN check_7 = 0 THEN NULL ELSE check_7 END,
    check_8 = CASE WHEN check_8 = 0 THEN NULL ELSE check_8 END,
    check_9 = CASE WHEN check_9 = 0 THEN NULL ELSE check_9 END,
    check_10 = CASE WHEN check_10 = 0 THEN NULL ELSE check_10 END,
    
    -- 해당 시간도 NULL로 (check_time_1~5)
    check_time_1 = CASE WHEN check_1 = 0 THEN NULL ELSE check_time_1 END,
    check_time_2 = CASE WHEN check_2 = 0 THEN NULL ELSE check_time_2 END,
    check_time_3 = CASE WHEN check_3 = 0 THEN NULL ELSE check_time_3 END,
    check_time_4 = CASE WHEN check_4 = 0 THEN NULL ELSE check_time_4 END,
    check_time_5 = CASE WHEN check_5 = 0 THEN NULL ELSE check_time_5 END,
    
    -- 해당 시간도 NULL로 (check_time_6~10)
    check_time_6 = CASE WHEN check_6 = 0 THEN NULL ELSE check_time_6 END,
    check_time_7 = CASE WHEN check_7 = 0 THEN NULL ELSE check_time_7 END,
    check_time_8 = CASE WHEN check_8 = 0 THEN NULL ELSE check_time_8 END,
    check_time_9 = CASE WHEN check_9 = 0 THEN NULL ELSE check_time_9 END,
    check_time_10 = CASE WHEN check_10 = 0 THEN NULL ELSE check_time_10 END,
    
    -- total_checks 감소
    total_checks = total_checks - 
        (CASE WHEN check_1 = 0 THEN 1 ELSE 0 END +
         CASE WHEN check_2 = 0 THEN 1 ELSE 0 END +
         CASE WHEN check_3 = 0 THEN 1 ELSE 0 END +
         CASE WHEN check_4 = 0 THEN 1 ELSE 0 END +
         CASE WHEN check_5 = 0 THEN 1 ELSE 0 END +
         CASE WHEN check_6 = 0 THEN 1 ELSE 0 END +
         CASE WHEN check_7 = 0 THEN 1 ELSE 0 END +
         CASE WHEN check_8 = 0 THEN 1 ELSE 0 END +
         CASE WHEN check_9 = 0 THEN 1 ELSE 0 END +
         CASE WHEN check_10 = 0 THEN 1 ELSE 0 END),
    
    -- is_completed 해제
    is_completed = FALSE,
    completed_at_check = NULL,
    
    -- processing_time 초기화
    processing_time = NULL,
    
    updated_at = NOW()
WHERE check_date = CURRENT_DATE
  AND (check_1 = 0 OR check_2 = 0 OR check_3 = 0 OR check_4 = 0 OR check_5 = 0
    OR check_6 = 0 OR check_7 = 0 OR check_8 = 0 OR check_9 = 0 OR check_10 = 0);

SELECT '0값 리셋 완료' as status, COUNT(*) as reset_count
FROM v3_keyword_ranking_checks
WHERE check_date = CURRENT_DATE
  AND updated_at > NOW() - INTERVAL '1 minute';

COMMIT;

-- ====== STEP 3: 중간 NULL 값 제거하고 순서 재정렬 ======
\echo ''
\echo '===== STEP 2: 중간 NULL 값 제거 및 재정렬 ====='

BEGIN;

UPDATE v3_keyword_ranking_checks
SET 
    -- 값 재배열 (check_1~5)
    check_1 = COALESCE(
        (array_remove(ARRAY[check_1, check_2, check_3, check_4, check_5, check_6, check_7, check_8, check_9, check_10], NULL))[1],
        NULL
    ),
    check_2 = COALESCE(
        (array_remove(ARRAY[check_1, check_2, check_3, check_4, check_5, check_6, check_7, check_8, check_9, check_10], NULL))[2],
        NULL
    ),
    check_3 = COALESCE(
        (array_remove(ARRAY[check_1, check_2, check_3, check_4, check_5, check_6, check_7, check_8, check_9, check_10], NULL))[3],
        NULL
    ),
    check_4 = COALESCE(
        (array_remove(ARRAY[check_1, check_2, check_3, check_4, check_5, check_6, check_7, check_8, check_9, check_10], NULL))[4],
        NULL
    ),
    check_5 = COALESCE(
        (array_remove(ARRAY[check_1, check_2, check_3, check_4, check_5, check_6, check_7, check_8, check_9, check_10], NULL))[5],
        NULL
    ),
    
    -- 값 재배열 (check_6~10)
    check_6 = COALESCE(
        (array_remove(ARRAY[check_1, check_2, check_3, check_4, check_5, check_6, check_7, check_8, check_9, check_10], NULL))[6],
        NULL
    ),
    check_7 = COALESCE(
        (array_remove(ARRAY[check_1, check_2, check_3, check_4, check_5, check_6, check_7, check_8, check_9, check_10], NULL))[7],
        NULL
    ),
    check_8 = COALESCE(
        (array_remove(ARRAY[check_1, check_2, check_3, check_4, check_5, check_6, check_7, check_8, check_9, check_10], NULL))[8],
        NULL
    ),
    check_9 = COALESCE(
        (array_remove(ARRAY[check_1, check_2, check_3, check_4, check_5, check_6, check_7, check_8, check_9, check_10], NULL))[9],
        NULL
    ),
    check_10 = COALESCE(
        (array_remove(ARRAY[check_1, check_2, check_3, check_4, check_5, check_6, check_7, check_8, check_9, check_10], NULL))[10],
        NULL
    ),
    
    -- 시간 재배열 (check_time_1~5)
    check_time_1 = COALESCE(
        (array_remove(ARRAY[check_time_1, check_time_2, check_time_3, check_time_4, check_time_5, check_time_6, check_time_7, check_time_8, check_time_9, check_time_10], NULL))[1],
        NULL
    ),
    check_time_2 = COALESCE(
        (array_remove(ARRAY[check_time_1, check_time_2, check_time_3, check_time_4, check_time_5, check_time_6, check_time_7, check_time_8, check_time_9, check_time_10], NULL))[2],
        NULL
    ),
    check_time_3 = COALESCE(
        (array_remove(ARRAY[check_time_1, check_time_2, check_time_3, check_time_4, check_time_5, check_time_6, check_time_7, check_time_8, check_time_9, check_time_10], NULL))[3],
        NULL
    ),
    check_time_4 = COALESCE(
        (array_remove(ARRAY[check_time_1, check_time_2, check_time_3, check_time_4, check_time_5, check_time_6, check_time_7, check_time_8, check_time_9, check_time_10], NULL))[4],
        NULL
    ),
    check_time_5 = COALESCE(
        (array_remove(ARRAY[check_time_1, check_time_2, check_time_3, check_time_4, check_time_5, check_time_6, check_time_7, check_time_8, check_time_9, check_time_10], NULL))[5],
        NULL
    ),
    
    -- 시간 재배열 (check_time_6~10)
    check_time_6 = COALESCE(
        (array_remove(ARRAY[check_time_1, check_time_2, check_time_3, check_time_4, check_time_5, check_time_6, check_time_7, check_time_8, check_time_9, check_time_10], NULL))[6],
        NULL
    ),
    check_time_7 = COALESCE(
        (array_remove(ARRAY[check_time_1, check_time_2, check_time_3, check_time_4, check_time_5, check_time_6, check_time_7, check_time_8, check_time_9, check_time_10], NULL))[7],
        NULL
    ),
    check_time_8 = COALESCE(
        (array_remove(ARRAY[check_time_1, check_time_2, check_time_3, check_time_4, check_time_5, check_time_6, check_time_7, check_time_8, check_time_9, check_time_10], NULL))[8],
        NULL
    ),
    check_time_9 = COALESCE(
        (array_remove(ARRAY[check_time_1, check_time_2, check_time_3, check_time_4, check_time_5, check_time_6, check_time_7, check_time_8, check_time_9, check_time_10], NULL))[9],
        NULL
    ),
    check_time_10 = COALESCE(
        (array_remove(ARRAY[check_time_1, check_time_2, check_time_3, check_time_4, check_time_5, check_time_6, check_time_7, check_time_8, check_time_9, check_time_10], NULL))[10],
        NULL
    ),
    
    -- 타임스탬프 업데이트
    updated_at = NOW()
WHERE check_date = CURRENT_DATE
  AND (
    -- check_1~5 gap check
    (check_1 IS NULL AND (check_2 IS NOT NULL OR check_3 IS NOT NULL OR check_4 IS NOT NULL OR check_5 IS NOT NULL))
    OR (check_2 IS NULL AND (check_3 IS NOT NULL OR check_4 IS NOT NULL OR check_5 IS NOT NULL))
    OR (check_3 IS NULL AND (check_4 IS NOT NULL OR check_5 IS NOT NULL))
    OR (check_4 IS NULL AND check_5 IS NOT NULL)
    -- check_6~10 gap check
    OR (check_5 IS NULL AND (check_6 IS NOT NULL OR check_7 IS NOT NULL OR check_8 IS NOT NULL OR check_9 IS NOT NULL OR check_10 IS NOT NULL))
    OR (check_6 IS NULL AND (check_7 IS NOT NULL OR check_8 IS NOT NULL OR check_9 IS NOT NULL OR check_10 IS NOT NULL))
    OR (check_7 IS NULL AND (check_8 IS NOT NULL OR check_9 IS NOT NULL OR check_10 IS NOT NULL))
    OR (check_8 IS NULL AND (check_9 IS NOT NULL OR check_10 IS NOT NULL))
    OR (check_9 IS NULL AND check_10 IS NOT NULL)
  );

SELECT '재정렬 완료' as status, COUNT(*) as reordered_count
FROM v3_keyword_ranking_checks
WHERE check_date = CURRENT_DATE
  AND updated_at > NOW() - INTERVAL '1 minute';

COMMIT;

-- ====== STEP 4: last_synced_check 업데이트 ======
\echo ''
\echo '===== STEP 3: last_synced_check 업데이트 ====='

BEGIN;

UPDATE v3_keyword_ranking_checks
SET 
    last_synced_check = COALESCE(
        array_length(array_remove(ARRAY[check_1, check_2, check_3, check_4, check_5, check_6, check_7, check_8, check_9, check_10], NULL), 1), 
        0
    ),
    updated_at = NOW()
WHERE check_date = CURRENT_DATE;

SELECT 'last_synced_check 업데이트' as status, COUNT(*) as updated_count
FROM v3_keyword_ranking_checks
WHERE check_date = CURRENT_DATE
  AND updated_at > NOW() - INTERVAL '1 minute';

COMMIT;

-- ====== STEP 5: 최종 검증 ======
\echo ''
\echo '===== 처리 후 데이터 상태 ====='

-- 전체 상태 요약
SELECT 
    'Total Records' as status,
    COUNT(*) as count
FROM v3_keyword_ranking_checks
WHERE check_date = CURRENT_DATE

UNION ALL

SELECT 
    'Records with 0 values' as status,
    COUNT(*) as count
FROM v3_keyword_ranking_checks
WHERE check_date = CURRENT_DATE
  AND (check_1 = 0 OR check_2 = 0 OR check_3 = 0 OR check_4 = 0 OR check_5 = 0
    OR check_6 = 0 OR check_7 = 0 OR check_8 = 0 OR check_9 = 0 OR check_10 = 0)

UNION ALL

SELECT 
    'Records with gaps' as status,
    COUNT(*) as count
FROM v3_keyword_ranking_checks
WHERE check_date = CURRENT_DATE
  AND (
    -- check_1~5 gap check
    (check_1 IS NULL AND (check_2 IS NOT NULL OR check_3 IS NOT NULL OR check_4 IS NOT NULL OR check_5 IS NOT NULL))
    OR (check_2 IS NULL AND (check_3 IS NOT NULL OR check_4 IS NOT NULL OR check_5 IS NOT NULL))
    OR (check_3 IS NULL AND (check_4 IS NOT NULL OR check_5 IS NOT NULL))
    OR (check_4 IS NULL AND check_5 IS NOT NULL)
    -- check_6~10 gap check
    OR (check_5 IS NULL AND (check_6 IS NOT NULL OR check_7 IS NOT NULL OR check_8 IS NOT NULL OR check_9 IS NOT NULL OR check_10 IS NOT NULL))
    OR (check_6 IS NULL AND (check_7 IS NOT NULL OR check_8 IS NOT NULL OR check_9 IS NOT NULL OR check_10 IS NOT NULL))
    OR (check_7 IS NULL AND (check_8 IS NOT NULL OR check_9 IS NOT NULL OR check_10 IS NOT NULL))
    OR (check_8 IS NULL AND (check_9 IS NOT NULL OR check_10 IS NOT NULL))
    OR (check_9 IS NULL AND check_10 IS NOT NULL)
  )

UNION ALL

SELECT 
    'last_synced_check mismatch' as status,
    COUNT(*) as count
FROM v3_keyword_ranking_checks
WHERE check_date = CURRENT_DATE
  AND last_synced_check <> COALESCE(array_length(array_remove(ARRAY[check_1, check_2, check_3, check_4, check_5, check_6, check_7, check_8, check_9, check_10], NULL), 1), 0)

ORDER BY status;

-- 샘플 데이터 확인
\echo ''
\echo '===== 처리 후 샘플 데이터 ====='
SELECT 
    keyword,
    product_code,
    check_1, check_2, check_3, check_4, check_5,
    last_synced_check,
    total_checks,
    is_completed
FROM v3_keyword_ranking_checks
WHERE check_date = CURRENT_DATE
ORDER BY RANDOM()
LIMIT 5;

\echo ''
\echo '===== 통합 정리 스크립트 실행 완료 ====='