import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { asyncHandler } from '../../middleware/errorHandler';
import { createLogger } from '../../utils/logger';
import { lockManager } from '../../services/lockManager';
import { ApiError } from '../../types';

const router = Router();
const logger = createLogger('api:internal:batch');

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'productparser_db',
  user: process.env.DB_USER || 'techb',
  password: process.env.DB_PASSWORD || '',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

/**
 * GET /api/v3/internal/batch/keywords
 * 처리할 키워드 목록 가져오기 (자동 락 포함)
 */
router.get('/keywords', asyncHandler(async (req: Request, res: Response) => {
  const { limit = 10, agentId } = req.query;
  
  if (!agentId) {
    throw new ApiError('VALIDATION_ERROR', 'agentId is required', 400);
  }

  const limitNum = Math.min(parseInt(limit as string) || 10, 100);
  const minCheckInterval = parseInt(process.env.MIN_CHECK_INTERVAL || '600'); // 기본 10분
  const syncTimeLimit = parseInt(process.env.SYNC_TIME_LIMIT || '60'); // 기본 60분

  logger.info('Keyword search parameters', {
    limitNum,
    minCheckInterval,
    syncTimeLimit,
    agentId
  });

  try {
    // 현재 락에 걸린 키워드 목록 가져오기
    const lockedKeywords = lockManager.getLockedKeywords();
    
    logger.info('Locked keywords count', { count: lockedKeywords.length });
    
    // 처리 가능한 키워드 조회 (processing_time 조건 추가)
    let query = `
      SELECT 
        kl.keyword, 
        kl.product_code,
        krc.id as check_id,
        krc.updated_at,
        krc.processing_time,
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
        CURRENT_TIME as current_time,
        CASE
          WHEN CURRENT_TIME::TIME >= GREATEST(
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
          ) THEN
            EXTRACT(EPOCH FROM (CURRENT_TIME - GREATEST(
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
            )))
          ELSE -- 자정을 넘어간 경우
            86400 + EXTRACT(EPOCH FROM (CURRENT_TIME - GREATEST(
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
            )))
        END as seconds_since_last_check
      FROM v3_keyword_list kl
      LEFT JOIN v3_keyword_ranking_checks krc 
        ON kl.keyword = krc.keyword 
        AND kl.product_code = krc.product_code 
        AND krc.check_date = CURRENT_DATE
      WHERE kl.is_active = TRUE 
        AND kl.last_sync_at > NOW() - INTERVAL '${syncTimeLimit} minutes'
        AND (krc.is_completed IS NULL OR krc.is_completed = FALSE)  -- 완료되지 않은 것만
        AND (
          -- processing_time이 NULL이거나 60초 이상 경과한 경우만
          krc.processing_time IS NULL 
          OR EXTRACT(EPOCH FROM (CURRENT_TIME::TIME - krc.processing_time)) >= 60
          OR (CURRENT_TIME::TIME < krc.processing_time AND EXTRACT(EPOCH FROM (CURRENT_TIME::TIME - krc.processing_time)) + 86400 >= 60)
        )
        AND (
          krc.id IS NULL  -- 오늘 첫 체크
          OR (
            -- 마지막 체크로부터 최소 간격(기본 10분) 이상 경과
            CASE
              WHEN CURRENT_TIME::TIME >= GREATEST(
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
              ) THEN
                EXTRACT(EPOCH FROM (CURRENT_TIME::TIME - GREATEST(
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
                )))
              ELSE -- 자정을 넘어간 경우
                86400 + EXTRACT(EPOCH FROM (CURRENT_TIME::TIME - GREATEST(
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
                )))
            END >= $2
            AND (
              krc.check_1 IS NULL
              OR krc.check_2 IS NULL
              OR krc.check_3 IS NULL
              OR krc.check_4 IS NULL
              OR krc.check_5 IS NULL
              OR krc.check_6 IS NULL
              OR krc.check_7 IS NULL
              OR krc.check_8 IS NULL
              OR krc.check_9 IS NULL
              OR krc.check_10 IS NULL
            )
          )
        )
      ORDER BY 
        CASE 
          WHEN krc.id IS NULL THEN 0  -- 오늘 첫 체크는 최우선
          ELSE COALESCE(krc.total_checks, 0)
        END ASC,  -- 체크 횟수가 적은 것 우선
        CASE
          WHEN CURRENT_TIME::TIME >= GREATEST(
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
          ) THEN
            EXTRACT(EPOCH FROM (CURRENT_TIME - GREATEST(
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
            )))
          ELSE
            86400 + EXTRACT(EPOCH FROM (CURRENT_TIME - GREATEST(
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
            )))
        END DESC,  -- 마지막 체크로부터 시간이 많이 지난 것 우선
        RANDOM()  -- 동일 조건시 랜덤 분산
      LIMIT $1
    `;

    // 락 실패를 고려하여 더 많은 키워드 조회
    const fetchLimit = Math.min(limitNum * 20, 200); // 최대 200개까지 조회
    
    logger.info('Executing keyword query', {
      fetchLimit,
      minCheckInterval,
      query: query.substring(0, 200) + '...'
    });
    
    const result = await pool.query(query, [fetchLimit, minCheckInterval]);
    
    // 디버그용: 30분 이상 경과한 키워드 찾기
    const debugQuery = `
      SELECT 
        kl.keyword, 
        kl.product_code,
        krc.check_time_1,
        krc.processing_time,
        CURRENT_TIME as current_time,
        CASE
          WHEN krc.check_time_1 IS NOT NULL THEN
            EXTRACT(EPOCH FROM (CURRENT_TIME::TIME - krc.check_time_1::TIME))
          ELSE NULL
        END as seconds_since_check_1,
        CASE
          WHEN krc.processing_time IS NOT NULL THEN
            EXTRACT(EPOCH FROM (CURRENT_TIME::TIME - krc.processing_time))
          ELSE NULL
        END as seconds_since_processing,
        CASE 
          WHEN krc.check_time_1 IS NOT NULL THEN
            EXTRACT(EPOCH FROM (CURRENT_TIME::TIME - krc.check_time_1::TIME)) >= ${minCheckInterval}
          ELSE TRUE
        END as is_eligible
      FROM v3_keyword_list kl
      LEFT JOIN v3_keyword_ranking_checks krc 
        ON kl.keyword = krc.keyword 
        AND kl.product_code = krc.product_code 
        AND krc.check_date = CURRENT_DATE
      WHERE kl.is_active = TRUE 
        AND kl.last_sync_at > NOW() - INTERVAL '${syncTimeLimit} minutes'
      ORDER BY seconds_since_check_1 DESC NULLS LAST
      LIMIT 5
    `;
    
    const debugResult = await pool.query(debugQuery);

    logger.info('Debug query result (all keywords)', {
      debugRowCount: debugResult.rows.length,
      minCheckInterval,
      debugRows: debugResult.rows.map(row => ({
        keyword: row.keyword,
        productCode: row.product_code,
        checkTime1: row.check_time_1,
        processingTime: row.processing_time,
        currentTime: row.current_time,
        secondsSinceCheck1: row.seconds_since_check_1,
        secondsSinceProcessing: row.seconds_since_processing,
        isEligible: row.is_eligible
      }))
    });

    logger.info('Query result', {
      rowCount: result.rows.length,
      firstFewRows: result.rows.slice(0, 3).map(row => ({
        keyword: row.keyword,
        productCode: row.product_code,
        lastCheckTime: row.last_check_time,
        currentTime: row.current_time,
        secondsSinceLastCheck: row.seconds_since_last_check,
        hasCheckId: !!row.check_id
      }))
    });

    // 락 획득 시도 - 필요한 개수만큼만 시도
    const availableKeywords = result.rows.map(row => ({
      keyword: row.keyword,
      productCode: row.product_code
    }));
    
    const keywords: Array<{keyword: string, productCode: string}> = [];
    
    // 필요한 개수만큼만 락 획득 시도
    for (const item of availableKeywords) {
      if (keywords.length >= limitNum) break;
      
      if (lockManager.acquireLock(item.keyword, item.productCode, agentId as string)) {
        keywords.push(item);
      }
    }

    logger.info('Keywords assigned to agent', { 
      agentId, 
      requested: limitNum,
      available: result.rows.length,
      locked: lockedKeywords.length,
      assigned: keywords.length 
    });

    // 할당된 키워드들의 processing_time 업데이트
    if (keywords.length > 0) {
      const updateProcessingTimeQuery = `
        UPDATE v3_keyword_ranking_checks
        SET processing_time = CURRENT_TIME,
            updated_at = NOW()
        WHERE check_date = CURRENT_DATE
          AND (keyword, product_code) IN (
            ${keywords.map((_, idx) => `($${idx * 2 + 1}, $${idx * 2 + 2})`).join(', ')}
          )
      `;
      
      const updateParams: string[] = [];
      keywords.forEach(k => {
        updateParams.push(k.keyword, k.productCode);
      });
      
      try {
        await pool.query(updateProcessingTimeQuery, updateParams);
        logger.info('Updated processing_time for assigned keywords', { 
          count: keywords.length,
          agentId 
        });
      } catch (error) {
        logger.error('Failed to update processing_time', error);
        // 업데이트 실패해도 키워드는 이미 할당되었으므로 계속 진행
      }
    }

    res.json({
      success: true,
      keywords: keywords.map(k => ({
        keyword: k.keyword,
        product_code: k.productCode
      }))
    });

  } catch (error) {
    logger.error('Failed to get keywords', error);
    throw new ApiError('DATABASE_ERROR', 'Failed to get keywords', 500);
  }
}));

/**
 * GET /api/v3/internal/batch/check-info
 * 키워드의 현재 체크 정보 조회
 */
router.get('/check-info', asyncHandler(async (req: Request, res: Response) => {
  const { keyword, productCode, agentId } = req.query;
  
  if (!keyword || !productCode) {
    throw new ApiError('VALIDATION_ERROR', 'keyword and productCode are required', 400);
  }

  try {
    const query = `
      SELECT 
        id,
        CASE 
          WHEN check_1 IS NULL THEN 1
          WHEN check_2 IS NULL THEN 2
          WHEN check_3 IS NULL THEN 3
          WHEN check_4 IS NULL THEN 4
          WHEN check_5 IS NULL THEN 5
          WHEN check_6 IS NULL THEN 6
          WHEN check_7 IS NULL THEN 7
          WHEN check_8 IS NULL THEN 8
          WHEN check_9 IS NULL THEN 9
          WHEN check_10 IS NULL THEN 10
          ELSE 0
        END as next_check_number,
        COALESCE(
          (check_1 IS NOT NULL)::int + 
          (check_2 IS NOT NULL)::int + 
          (check_3 IS NOT NULL)::int + 
          (check_4 IS NOT NULL)::int + 
          (check_5 IS NOT NULL)::int + 
          (check_6 IS NOT NULL)::int + 
          (check_7 IS NOT NULL)::int + 
          (check_8 IS NOT NULL)::int + 
          (check_9 IS NOT NULL)::int + 
          (check_10 IS NOT NULL)::int, 0
        ) as today_checks,
        check_1, check_2, check_3
      FROM v3_keyword_ranking_checks
      WHERE keyword = $1 
        AND product_code = $2 
        AND check_date = CURRENT_DATE
    `;
    
    const result = await pool.query(query, [keyword as string, productCode as string]);
    
    if (result.rows.length > 0) {
      const row = result.rows[0];
      res.json({
        success: true,
        checkInfo: {
          id: row.id,
          nextCheckNumber: row.next_check_number,
          todayChecks: row.today_checks,
          previousChecks: [row.check_1, row.check_2, row.check_3]
        }
      });
    } else {
      res.json({
        success: true,
        checkInfo: {
          id: null,
          nextCheckNumber: 1,
          todayChecks: 0,
          previousChecks: []
        }
      });
    }
    
  } catch (error) {
    logger.error('Failed to get check info', error);
    throw new ApiError('DATABASE_ERROR', 'Failed to get check info', 500);
  }
}));

/**
 * POST /api/v3/internal/batch/result
 * 순위 결과 저장
 */
router.post('/result', asyncHandler(async (req: Request, res: Response) => {
  const { keyword, productCode, rank, agentId, agentIP, browser, productName, thumbnailUrl, rating, reviewCount } = req.body;

  if (!keyword || !productCode || rank === undefined || !agentId) {
    throw new ApiError('VALIDATION_ERROR', 'Missing required fields', 400);
  }

  // 락 해제
  const released = lockManager.releaseLock(keyword, productCode, agentId);
  if (!released) {
    logger.warn('Lock release failed', { keyword, productCode, agentId });
  }

  try {
    // 다음 빈 체크 번호 찾기
    const checkNumQuery = `
      SELECT 
        CASE 
          WHEN check_1 IS NULL THEN 1
          WHEN check_2 IS NULL THEN 2
          WHEN check_3 IS NULL THEN 3
          WHEN check_4 IS NULL THEN 4
          WHEN check_5 IS NULL THEN 5
          WHEN check_6 IS NULL THEN 6
          WHEN check_7 IS NULL THEN 7
          WHEN check_8 IS NULL THEN 8
          WHEN check_9 IS NULL THEN 9
          WHEN check_10 IS NULL THEN 10
          ELSE 0
        END as next_check_number
      FROM v3_keyword_ranking_checks
      WHERE keyword = $1 
        AND product_code = $2 
        AND check_date = CURRENT_DATE
    `;

    const checkNumResult = await pool.query(checkNumQuery, [keyword, productCode]);
    const checkNumber = checkNumResult.rows.length > 0 ? checkNumResult.rows[0].next_check_number : 1;

    if (checkNumber === 0 || checkNumber > 10) {
      throw new ApiError('LIMIT_EXCEEDED', 'All check slots are full for today', 400);
    }

    const checkColumn = `check_${checkNumber}`;
    const checkTimeColumn = `check_time_${checkNumber}`;
    const rankValue = rank || 0; // null을 0으로

    // 결과 저장 (평점과 리뷰수는 최신값으로 업데이트, processing_time은 NULL로 리셋)
    const updateQuery = `
      UPDATE v3_keyword_ranking_checks 
      SET ${checkColumn} = $1::INTEGER, 
          ${checkTimeColumn} = CURRENT_TIME,
          rating = COALESCE($4::DECIMAL(2,1), rating),
          review_count = COALESCE($5::INTEGER, review_count),
          total_checks = total_checks + 1,
          found_count = found_count + CASE WHEN $1::INTEGER > 0 THEN 1 ELSE 0 END,
          processing_time = NULL,
          updated_at = NOW()
      WHERE keyword = $2 
        AND product_code = $3 
        AND check_date = CURRENT_DATE
    `;

    const updateResult = await pool.query(updateQuery, [rankValue, keyword, productCode, rating || null, reviewCount || null]);

    // 없으면 INSERT
    if (updateResult.rowCount === 0) {
      const insertQuery = `
        INSERT INTO v3_keyword_ranking_checks 
        (keyword, product_code, check_date, ${checkColumn}, ${checkTimeColumn}, 
         rating, review_count, total_checks, found_count, processing_time)
        VALUES ($1, $2, CURRENT_DATE, $3::INTEGER, CURRENT_TIME, $4::DECIMAL(2,1), $5::INTEGER, 1, $6, NULL)
        ON CONFLICT (keyword, product_code, check_date) 
        DO UPDATE SET 
          ${checkColumn} = $3::INTEGER,
          ${checkTimeColumn} = CURRENT_TIME,
          rating = COALESCE($4::DECIMAL(2,1), v3_keyword_ranking_checks.rating),
          review_count = COALESCE($5::INTEGER, v3_keyword_ranking_checks.review_count),
          total_checks = v3_keyword_ranking_checks.total_checks + 1,
          found_count = v3_keyword_ranking_checks.found_count + CASE WHEN $3::INTEGER > 0 THEN 1 ELSE 0 END,
          processing_time = NULL,
          updated_at = NOW()
      `;

      await pool.query(insertQuery, [
        keyword, 
        productCode, 
        rankValue,
        rating || null,
        reviewCount || null,
        rankValue > 0 ? 1 : 0
      ]);
    }

    // 통계 업데이트
    await updateStatistics(keyword, productCode);

    // 연속 3번 0 체크 확인
    await checkConsecutiveZeros(keyword, productCode);
    
    // 에이전트 통계 업데이트
    await updateAgentStats(
      agentId,
      agentIP || null,
      browser || 'unknown',
      true, // success
      rankValue > 0, // rankFound
      false, // isBlocked
      null, // errorType
      null, // errorMessage
      keyword,
      productCode
    );

    // 상품 정보 업데이트 (상품을 찾았을 때만)
    if (rankValue > 0 && (productName || thumbnailUrl)) {
      const updateProductQuery = `
        UPDATE v3_keyword_list 
        SET 
          product_name = COALESCE($1, product_name),
          thumbnail_url = COALESCE($2, thumbnail_url),
          product_info_updated_at = NOW(),
          updated_at = NOW()
        WHERE keyword = $3 AND product_code = $4
      `;
      
      await pool.query(updateProductQuery, [
        productName || null,
        thumbnailUrl || null,
        keyword,
        productCode
      ]);
      
      logger.info('Product info updated', {
        keyword,
        productCode,
        productName: productName || 'not updated',
        thumbnailUrl: thumbnailUrl ? 'updated' : 'not updated'
      });
    }

    logger.info('Result saved', { 
      keyword, 
      productCode, 
      rank: rankValue,
      checkNumber,
      agentId 
    });

    logger.info('Ranking result saved', {
      keyword,
      productCode,
      rank,
      checkNumber,
      agentId,
      agentIP,
      browser,
      productName,
      rating,
      reviewCount
    });

    res.json({
      success: true,
      checkNumber,
      saved: true
    });

  } catch (error) {
    logger.error('Failed to save result', error);
    throw new ApiError('DATABASE_ERROR', 'Failed to save result', 500);
  }
}));

/**
 * POST /api/v3/internal/batch/failure
 * 실패 로깅
 */
router.post('/failure', asyncHandler(async (req: Request, res: Response) => {
  const { keyword, productCode, error: errorMessage, agentId, agentIP, browser } = req.body;

  if (!keyword || !productCode || !errorMessage || !agentId) {
    throw new ApiError('VALIDATION_ERROR', 'Missing required fields', 400);
  }

  // 락 해제
  lockManager.releaseLock(keyword, productCode, agentId);

  try {
    // processing_time을 NULL로 리셋
    const resetProcessingTimeQuery = `
      UPDATE v3_keyword_ranking_checks
      SET processing_time = NULL,
          updated_at = NOW()
      WHERE keyword = $1 
        AND product_code = $2 
        AND check_date = CURRENT_DATE
    `;
    
    await pool.query(resetProcessingTimeQuery, [keyword, productCode]);
    
    // 에러 타입 판별
    const isBlocked = errorMessage && /BLOCKED|blocked|차단|403|chrome-error:|ERR_HTTP2_PROTOCOL_ERROR/i.test(errorMessage);
    const errorType = isBlocked ? 'BLOCKED' : 
                     errorMessage.includes('Timeout') ? 'TIMEOUT' :
                     errorMessage.includes('Network') ? 'NETWORK' :
                     errorMessage.includes('HTTP2') ? 'HTTP2_ERROR' : 'SEARCH_ERROR';
    
    // 에이전트 통계 업데이트
    await updateAgentStats(
      agentId,
      agentIP || null,
      browser || 'unknown',
      false, // success
      false, // rankFound
      isBlocked,
      errorType,
      errorMessage,
      keyword,
      productCode
    );

    // 체크 번호 찾기 (실패 로깅용)
    const checkNumQuery = `
      SELECT COALESCE(MAX(
        CASE 
          WHEN check_1 IS NOT NULL THEN 1
          WHEN check_2 IS NOT NULL THEN 2
          WHEN check_3 IS NOT NULL THEN 3
          WHEN check_4 IS NOT NULL THEN 4
          WHEN check_5 IS NOT NULL THEN 5
          WHEN check_6 IS NOT NULL THEN 6
          WHEN check_7 IS NOT NULL THEN 7
          WHEN check_8 IS NOT NULL THEN 8
          WHEN check_9 IS NOT NULL THEN 9
          WHEN check_10 IS NOT NULL THEN 10
          ELSE 1
        END
      ), 1) as check_number
      FROM v3_keyword_ranking_checks
      WHERE keyword = $1 
        AND product_code = $2 
        AND check_date = CURRENT_DATE
    `;

    const checkNumResult = await pool.query(checkNumQuery, [keyword, productCode]);
    const checkNumber = checkNumResult.rows[0].check_number;

    // 실패 로그 저장
    const failureQuery = `
      INSERT INTO v3_keyword_check_failures 
      (check_date, check_number, keyword, product_code, error_type, error_message)
      VALUES (CURRENT_DATE, $1, $2, $3, $4, $5)
    `;

    await pool.query(failureQuery, [
      checkNumber,
      keyword,
      productCode,
      errorType,
      errorMessage
    ]);

    logger.warn('Failure logged', { 
      keyword, 
      productCode, 
      error: errorMessage,
      agentId,
      agentIP,
      browser
    });

    res.json({
      success: true,
      logged: true
    });

  } catch (error) {
    logger.error('Failed to log failure', error);
    // 실패 로깅 자체가 실패해도 200 리턴 (에이전트 블록 방지)
    res.json({
      success: false,
      logged: false
    });
  }
}));

/**
 * GET /api/v3/internal/batch/status
 * 락 상태 조회 (디버깅용)
 */
router.get('/status', asyncHandler(async (req: Request, res: Response) => {
  const status = lockManager.getStatus();
  
  res.json({
    success: true,
    ...status
  });
}));

/**
 * 통계 업데이트 함수
 */
async function updateStatistics(keyword: string, productCode: string): Promise<void> {
  try {
    const selectQuery = `
      SELECT check_1, check_2, check_3, check_4, check_5,
             check_6, check_7, check_8, check_9, check_10
      FROM v3_keyword_ranking_checks
      WHERE keyword = $1 
        AND product_code = $2 
        AND check_date = CURRENT_DATE
    `;
    
    const result = await pool.query(selectQuery, [keyword, productCode]);
    if (result.rows.length === 0) return;
    
    const row = result.rows[0];
    const allChecks = [
      row.check_1, row.check_2, row.check_3, row.check_4, row.check_5,
      row.check_6, row.check_7, row.check_8, row.check_9, row.check_10
    ].filter(v => v !== null);
    
    if (allChecks.length === 0) return;
    
    // 0을 제외한 실제 순위만 통계 계산
    const rankedChecks = allChecks.filter(v => v > 0);
    
    let minRank = null;
    let maxRank = null;
    let avgRank = null;
    
    if (rankedChecks.length > 0) {
      minRank = Math.min(...rankedChecks);
      maxRank = Math.max(...rankedChecks);
      avgRank = rankedChecks.reduce((a, b) => a + b, 0) / rankedChecks.length;
    }
    
    const updateQuery = `
      UPDATE v3_keyword_ranking_checks
      SET min_rank = $1, max_rank = $2, avg_rank = $3
      WHERE keyword = $4 
        AND product_code = $5 
        AND check_date = CURRENT_DATE
    `;
    
    await pool.query(updateQuery, [minRank, maxRank, avgRank, keyword, productCode]);
  } catch (error) {
    logger.error(`Failed to update statistics for ${keyword}:`, error);
  }
}

/**
 * 연속 3번 0 체크 확인 함수
 */
async function checkConsecutiveZeros(keyword: string, productCode: string): Promise<void> {
  try {
    const query = `
      SELECT check_1, check_2, check_3, check_4, check_5,
             check_6, check_7, check_8, check_9, check_10,
             completed_at_check
      FROM v3_keyword_ranking_checks
      WHERE keyword = $1 
        AND product_code = $2 
        AND check_date = CURRENT_DATE
    `;
    
    const result = await pool.query(query, [keyword, productCode]);
    if (result.rows.length === 0) return;
    
    const row = result.rows[0];
    const checks = [
      row.check_1, row.check_2, row.check_3, row.check_4, row.check_5,
      row.check_6, row.check_7, row.check_8, row.check_9, row.check_10
    ];
    
    // 마지막 3개의 체크값 확인
    let consecutiveZeros = 0;
    let lastCheckNumber = 0;
    
    for (let i = 0; i < checks.length; i++) {
      if (checks[i] !== null) {
        lastCheckNumber = i + 1;
        if (checks[i] === 0) {
          consecutiveZeros++;
          if (consecutiveZeros >= 3) {
            // 이미 완료 처리되었고, 같은 체크 번호에서 완료되었다면 스킵
            if (row.completed_at_check && row.completed_at_check >= lastCheckNumber) {
              logger.info('Already completed at same or later check', {
                keyword,
                productCode,
                completedAtCheck: row.completed_at_check,
                currentCheckNumber: lastCheckNumber
              });
              return;
            }
            
            // 연속 3번 0이면 완료 처리
            const updateQuery = `
              UPDATE v3_keyword_ranking_checks
              SET is_completed = TRUE,
                  completed_at_check = $1
              WHERE keyword = $2 
                AND product_code = $3 
                AND check_date = CURRENT_DATE
                AND (completed_at_check IS NULL OR completed_at_check < $1)
            `;
            
            await pool.query(updateQuery, [lastCheckNumber, keyword, productCode]);
            
            logger.info('Keyword marked as completed due to 3 consecutive zeros', {
              keyword,
              productCode,
              lastCheckNumber,
              consecutiveZeros
            });
            return;
          }
        } else {
          // 0이 아닌 값이면 카운트 리셋
          consecutiveZeros = 0;
        }
      }
    }
  } catch (error) {
    logger.error(`Failed to check consecutive zeros for ${keyword}:`, error);
  }
}

/**
 * Update agent statistics
 */
async function updateAgentStats(
  agentId: string, 
  agentIP: string | null, 
  browser: string,
  success: boolean,
  rankFound: boolean,
  isBlocked: boolean = false,
  errorType: string | null = null,
  errorMessage: string | null = null,
  keyword: string | null = null,
  productCode: string | null = null
): Promise<void> {
  try {
    // 1. Update daily stats
    const statsQuery = `
      INSERT INTO v3_agent_stats (agent_id, agent_ip, browser, stat_date, 
        total_requests, successful_searches, failed_searches, blocked_count, 
        ranks_found, products_not_found)
      VALUES ($1, $2, $3, CURRENT_DATE, 1, $4, $5, $6, $7, $8)
      ON CONFLICT (agent_id, stat_date) 
      DO UPDATE SET
        total_requests = v3_agent_stats.total_requests + 1,
        successful_searches = v3_agent_stats.successful_searches + $4,
        failed_searches = v3_agent_stats.failed_searches + $5,
        blocked_count = v3_agent_stats.blocked_count + $6,
        ranks_found = v3_agent_stats.ranks_found + $7,
        products_not_found = v3_agent_stats.products_not_found + $8,
        updated_at = NOW()
    `;
    
    await pool.query(statsQuery, [
      agentId,
      agentIP,
      browser,
      success ? 1 : 0,
      !success ? 1 : 0,
      isBlocked ? 1 : 0,
      rankFound && success ? 1 : 0,
      !rankFound && success ? 1 : 0
    ]);

    // 2. Update agent health
    const healthQuery = `
      INSERT INTO v3_agent_health (agent_id, agent_ip, browser, 
        last_success_at, last_error_at, consecutive_errors, consecutive_blocks,
        total_lifetime_requests, total_lifetime_blocks)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8)
      ON CONFLICT (agent_id)
      DO UPDATE SET
        agent_ip = $2,
        browser = $3,
        last_success_at = CASE WHEN $4 IS NOT NULL THEN $4 ELSE v3_agent_health.last_success_at END,
        last_error_at = CASE WHEN $5 IS NOT NULL THEN $5 ELSE v3_agent_health.last_error_at END,
        consecutive_errors = CASE 
          WHEN $4 IS NOT NULL THEN 0 
          ELSE v3_agent_health.consecutive_errors + 1 
        END,
        consecutive_blocks = CASE 
          WHEN $9 = TRUE THEN v3_agent_health.consecutive_blocks + 1
          WHEN $4 IS NOT NULL THEN 0
          ELSE v3_agent_health.consecutive_blocks
        END,
        total_lifetime_requests = v3_agent_health.total_lifetime_requests + 1,
        total_lifetime_blocks = v3_agent_health.total_lifetime_blocks + $8,
        status = CASE 
          WHEN $9 = TRUE AND v3_agent_health.consecutive_blocks >= 2 THEN 'BLOCKED'
          WHEN v3_agent_health.consecutive_errors >= 5 THEN 'WARNING'
          WHEN $4 IS NOT NULL THEN 'ACTIVE'
          ELSE v3_agent_health.status
        END,
        updated_at = NOW()
    `;
    
    await pool.query(healthQuery, [
      agentId,
      agentIP,
      browser,
      success ? new Date() : null,
      !success ? new Date() : null,
      !success ? 1 : 0,
      isBlocked ? 1 : 0,
      isBlocked ? 1 : 0,
      isBlocked
    ]);

    // 3. Log errors
    if (!success && errorType) {
      const errorQuery = `
        INSERT INTO v3_agent_errors (agent_id, agent_ip, browser, error_type, 
          error_message, keyword, product_code)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;
      
      await pool.query(errorQuery, [
        agentId,
        agentIP,
        browser,
        errorType,
        errorMessage,
        keyword,
        productCode
      ]);
    }

  } catch (error) {
    logger.error('Failed to update agent stats:', error);
  }
}

export default router;