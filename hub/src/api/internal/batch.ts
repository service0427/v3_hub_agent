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

  try {
    // 현재 락에 걸린 키워드 목록 가져오기
    const lockedKeywords = lockManager.getLockedKeywords();
    
    logger.info('Locked keywords count', { count: lockedKeywords.length });
    
    // 처리 가능한 키워드 조회
    let query = `
      SELECT 
        kl.keyword, 
        kl.product_code,
        krc.id as check_id,
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
        ) as last_check_time
      FROM v3_keyword_list kl
      LEFT JOIN v3_keyword_ranking_checks krc 
        ON kl.keyword = krc.keyword 
        AND kl.product_code = krc.product_code 
        AND krc.check_date = CURRENT_DATE
      WHERE kl.is_active = TRUE 
        AND kl.last_sync_at > NOW() - INTERVAL '${syncTimeLimit} minutes'
        AND (
          krc.id IS NULL  -- 오늘 첫 체크
          OR (
            -- 마지막 체크로부터 최소 간격(기본 10분) 이상 경과
            CASE
              WHEN CURRENT_TIME >= GREATEST(
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
          WHEN krc.id IS NULL THEN '1900-01-01'::TIMESTAMP
          ELSE krc.updated_at 
        END ASC,
        last_check_time ASC,
        kl.id ASC
      LIMIT $1
    `;

    // 락 실패를 고려하여 더 많은 키워드 조회
    const fetchLimit = Math.min(limitNum * 20, 200); // 최대 200개까지 조회
    const result = await pool.query(query, [fetchLimit, minCheckInterval]);

    // 락 획득 시도
    const keywords = lockManager.acquireMultipleLocks(
      result.rows.map(row => ({
        keyword: row.keyword,
        productCode: row.product_code
      })),
      agentId as string
    ).slice(0, limitNum); // 요청한 개수만큼만

    logger.info('Keywords assigned to agent', { 
      agentId, 
      requested: limitNum,
      available: result.rows.length,
      locked: lockedKeywords.length,
      assigned: keywords.length 
    });

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
 * POST /api/v3/internal/batch/result
 * 순위 결과 저장
 */
router.post('/result', asyncHandler(async (req: Request, res: Response) => {
  const { keyword, productCode, rank, agentId, productName, thumbnailUrl, rating, reviewCount } = req.body;

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

    // 결과 저장 (평점과 리뷰수는 최신값으로 업데이트)
    const updateQuery = `
      UPDATE v3_keyword_ranking_checks 
      SET ${checkColumn} = $1::INTEGER, 
          ${checkTimeColumn} = CURRENT_TIME,
          rating = COALESCE($4::DECIMAL(2,1), rating),
          review_count = COALESCE($5::INTEGER, review_count),
          total_checks = total_checks + 1,
          found_count = found_count + CASE WHEN $1::INTEGER > 0 THEN 1 ELSE 0 END,
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
         rating, review_count, total_checks, found_count)
        VALUES ($1, $2, CURRENT_DATE, $3::INTEGER, CURRENT_TIME, $4::DECIMAL(2,1), $5::INTEGER, 1, $6)
        ON CONFLICT (keyword, product_code, check_date) 
        DO UPDATE SET 
          ${checkColumn} = $3::INTEGER,
          ${checkTimeColumn} = CURRENT_TIME,
          rating = COALESCE($4::DECIMAL(2,1), v3_keyword_ranking_checks.rating),
          review_count = COALESCE($5::INTEGER, v3_keyword_ranking_checks.review_count),
          total_checks = v3_keyword_ranking_checks.total_checks + 1,
          found_count = v3_keyword_ranking_checks.found_count + CASE WHEN $3::INTEGER > 0 THEN 1 ELSE 0 END,
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
  const { keyword, productCode, error: errorMessage, agentId } = req.body;

  if (!keyword || !productCode || !errorMessage || !agentId) {
    throw new ApiError('VALIDATION_ERROR', 'Missing required fields', 400);
  }

  // 락 해제
  lockManager.releaseLock(keyword, productCode, agentId);

  try {
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
      'search_error',
      errorMessage
    ]);

    logger.warn('Failure logged', { 
      keyword, 
      productCode, 
      error: errorMessage,
      agentId 
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

export default router;