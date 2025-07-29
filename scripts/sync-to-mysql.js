/**
 * sync-to-mysql.js - PostgreSQL → MySQL 순위/에러 동기화
 * 
 * 📋 주요 기능:
 * - PostgreSQL v3_keyword_ranking_checks에서 MySQL ad_slots로 순위 동기화
 * - 10분마다 크론탭으로 실행
 * - crawling_errors 테이블에 retry_count 관리 (최대 3회)
 * - 상품 발견 시 resolved_at 자동 업데이트
 * 
 * 🗄️ 데이터베이스:
 * - PostgreSQL (소스): mkt.techb.kr / techb_pp / Tech1324! / productparser_db
 * - MySQL (타겟): 138.2.125.63 / magic_dev / !magic00 / magic_db
 * 
 * 📊 주요 테이블:
 * - PostgreSQL: v3_keyword_ranking_checks (check_1~10, last_synced_check), v3_keyword_list, v3_mysql_sync_logs
 * - MySQL: ad_slots (rank_status, price_start_rank, price_rank, price_rank_diff), crawling_errors
 * 
 * 🔄 동기화 로직:
 * 1. 오늘 날짜의 새로운 체크 데이터 조회 (total_checks > last_synced_check)
 * 2. 순위 계산: bestRank = Math.min(유효순위), worstRank = Math.max(유효순위)
 * 3. 모든 체크가 0인 경우:
 *    - rank_status = 'FAILED'
 *    - crawling_errors 처리 (retry_count 관리)
 *    - 오늘 이미 해결된 경우 스킵
 *    - retry_count >= 3이면 더 이상 업데이트 안함
 * 4. 순위 발견 시:
 *    - rank_status = 'SUCCESS'
 *    - price_start_rank = worstRank (NULL일 때만)
 *    - price_rank = bestRank (항상)
 *    - crawling_errors resolved_at = NOW()
 * 
 * 📝 로그:
 * - 일반: logs/sync-to-mysql-{날짜}.log
 * - 크론: logs/sync-to-mysql-cron.log
 * - PostgreSQL: v3_mysql_sync_logs 테이블
 * 
 * 🔧 실행:
 * node scripts/sync-to-mysql.js [--dry-run] [--limit N]
 * 
 * ⚠️ 주의:
 * - price_start_rank = 최악 순위 (높은 숫자, 예: 100등)
 * - price_rank = 최고 순위 (낮은 숫자, 예: 10등)
 * - crawling_errors는 하루에 ad_slot_id당 최대 1개 레코드만 생성
 * - retry_count는 1부터 시작, 최대 3까지
 * 
 * 📚 상세 문서: /home/tech/v3_hub_agent/docs/SYNC_TO_MYSQL_GUIDE.md
 */

const mysql = require('mysql2/promise');
const { Pool } = require('pg');
const winston = require('winston');
const path = require('path');

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...rest }) => {
      const restStr = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
      return `${timestamp} [${level}] ${message}${restStr}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ 
      filename: path.join(__dirname, `../logs/sync-to-mysql-${new Date().toISOString().split('T')[0]}.log`) 
    })
  ]
});

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitIndex = args.indexOf('--limit');
const limit = limitIndex !== -1 && args[limitIndex + 1] ? parseInt(args[limitIndex + 1]) : null;

if (isDryRun) {
  logger.info('🔍 DRY RUN MODE - No actual updates will be performed');
}
if (limit) {
  logger.info(`📊 Limited to ${limit} records`);
}

// Database configurations
const mysqlConfig = {
  host: '138.2.125.63',
  user: 'magic_dev',
  password: '!magic00',
  database: 'magic_db',
  connectTimeout: 10000
};

const pgConfig = {
  host: process.env.DB_HOST || 'mkt.techb.kr',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'productparser_db',
  user: process.env.DB_USER || 'techb_pp',
  password: process.env.DB_PASSWORD || 'Tech1324!',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

// PostgreSQL pool
const pgPool = new Pool(pgConfig);

// Statistics object
const stats = {
  totalProcessed: 0,
  rankingsUpdated: 0,
  productInfoUpdated: 0,
  failedRankings: 0,
  crawlingErrorsCreated: 0,
  skipped: 0,
  failed: 0
};

/**
 * Create sync log entry in PostgreSQL
 */
async function createSyncLog() {
  const query = `
    INSERT INTO v3_mysql_sync_logs (dry_run)
    VALUES ($1)
    RETURNING id
  `;
  
  const result = await pgPool.query(query, [isDryRun]);
  return result.rows[0].id;
}

/**
 * Update sync log with final statistics
 */
async function updateSyncLog(syncLogId, status, errorMessage = null) {
  const query = `
    UPDATE v3_mysql_sync_logs
    SET 
      completed_at = NOW(),
      total_processed = $2,
      rankings_updated = $3,
      product_info_updated = $4,
      failed_rankings = $5,
      error_logs_created = $6,
      status = $7,
      error_message = $8
    WHERE id = $1
  `;
  
  await pgPool.query(query, [
    syncLogId,
    stats.totalProcessed,
    stats.rankingsUpdated,
    stats.productInfoUpdated,
    stats.failedRankings,
    stats.crawlingErrorsCreated,
    status,
    errorMessage
  ]);
}

/**
 * Calculate best and worst ranks from check data
 */
function calculateRanks(row) {
  const checks = [
    row.check_1, row.check_2, row.check_3, row.check_4, row.check_5,
    row.check_6, row.check_7, row.check_8, row.check_9, row.check_10
  ];
  
  // Find last check number
  let lastCheckNumber = 0;
  for (let i = checks.length - 1; i >= 0; i--) {
    if (checks[i] !== null) {
      lastCheckNumber = i + 1;
      break;
    }
  }
  
  // Skip if no new checks since last sync
  if (lastCheckNumber <= (row.last_synced_check || 0)) {
    return { skip: true };
  }
  
  // Find valid ranks (excluding 0)
  const validRanks = checks.filter(r => r !== null && r > 0);
  const bestRank = validRanks.length > 0 ? Math.min(...validRanks) : null;
  const worstRank = validRanks.length > 0 ? Math.max(...validRanks) : null;
  
  // Check if all non-null values are 0
  const nonNullChecks = checks.filter(r => r !== null);
  const allZeros = nonNullChecks.length > 0 && nonNullChecks.every(r => r === 0);
  
  return {
    skip: false,
    lastCheckNumber,
    bestRank,
    worstRank,
    allZeros,
    hasChecks: nonNullChecks.length > 0
  };
}

/**
 * Main sync function
 */
async function syncToMySQL() {
  let mysqlConn = null;
  let syncLogId = null;
  
  try {
    logger.info('=== Starting PostgreSQL to MySQL Sync ===');
    logger.info('📊 This will sync ranking data and product info from PostgreSQL to MySQL');
    
    // Create sync log
    syncLogId = await createSyncLog();
    logger.info(`Created sync log with ID: ${syncLogId}`);
    
    // Connect to MySQL
    mysqlConn = await mysql.createConnection(mysqlConfig);
    logger.info('✅ MySQL connected');
    
    // Get current date
    const today = new Date().toISOString().split('T')[0];
    
    // Build query with optional limit
    let pgQuery = `
      SELECT 
        krc.id,
        krc.keyword,
        krc.product_code,
        krc.check_date,
        krc.check_1, krc.check_2, krc.check_3, krc.check_4, krc.check_5,
        krc.check_6, krc.check_7, krc.check_8, krc.check_9, krc.check_10,
        krc.min_rank,
        krc.total_checks,
        krc.found_count,
        krc.last_synced_check,
        krc.is_completed,
        krc.completed_at_check,
        kl.product_name,
        kl.thumbnail_url
      FROM v3_keyword_ranking_checks krc
      LEFT JOIN v3_keyword_list kl
        ON krc.keyword = kl.keyword 
        AND krc.product_code = kl.product_code
      WHERE krc.check_date = $1
        AND krc.total_checks > COALESCE(krc.last_synced_check, 0)
      ORDER BY krc.updated_at DESC
    `;
    
    if (limit) {
      pgQuery += ` LIMIT ${limit}`;
    }
    
    const pgResult = await pgPool.query(pgQuery, [today]);
    logger.info(`Found ${pgResult.rows.length} records to sync`);
    
    // Process each record
    for (const row of pgResult.rows) {
      try {
        stats.totalProcessed++;
        
        // Calculate ranks
        const rankInfo = calculateRanks(row);
        
        if (rankInfo.skip) {
          stats.skipped++;
          continue;
        }
        
        const { lastCheckNumber, bestRank, worstRank, allZeros, hasChecks } = rankInfo;
        
        // Check how many fields will be updated
        let productInfoWillUpdate = false;
        
        if (!allZeros && !hasChecks) {
          // No checks completed - skip
          stats.skipped++;
          logger.debug(`No checks completed yet for ${row.keyword} / ${row.product_code}`);
          continue;
        }
        
        if (allZeros) {
          // Product not found - mark as FAILED
          const updateQuery = `
            UPDATE ad_slots 
            SET rank_check_date = ?,
                rank_status = 'FAILED',
                price_start_rank = CASE 
                  WHEN price_start_rank IS NULL THEN 0 
                  ELSE price_start_rank 
                END,
                price_rank = 0,
                price_rank_diff = CASE 
                  WHEN price_start_rank IS NULL THEN 0
                  ELSE price_start_rank - 0
                END,
                updated_at = NOW()
            WHERE REPLACE(TRIM(main_keyword), ' ', '') = ? 
              AND product_url LIKE CONCAT('%/vp/products/', ?, '%')
              AND status = 'ACTIVE'
              AND is_active = 1
          `;
          
          if (isDryRun) {
            logger.info('DRY RUN - Would update as FAILED:', {
              keyword: row.keyword,
              productCode: row.product_code,
              reason: 'Product not found (all zeros)'
            });
            stats.failedRankings++;
          } else {
            const [result] = await mysqlConn.execute(updateQuery, [
              today, row.keyword, row.product_code
            ]);
            
            if (result.affectedRows > 0) {
              stats.failedRankings++;
              logger.info(`Marked as FAILED: ${row.keyword} / ${row.product_code} - Product not found`);
              
              // Get ad_slot_id for crawling_errors
              const [adSlotRows] = await mysqlConn.execute(`
                SELECT ad_slot_id 
                FROM ad_slots 
                WHERE REPLACE(TRIM(main_keyword), ' ', '') = ? 
                  AND product_url LIKE CONCAT('%/vp/products/', ?, '%')
                  AND status = 'ACTIVE'
                  AND is_active = 1
                LIMIT 1
              `, [row.keyword, row.product_code]);
              
              if (adSlotRows.length > 0) {
                const adSlotId = adSlotRows[0].ad_slot_id;
                const errorMessage = `상품 미존재 - 키워드: ${row.keyword}, 제품코드: ${row.product_code} (300등 이내에서 찾을 수 없음)`;
                
                // Check existing errors for today
                const [existingErrors] = await mysqlConn.execute(`
                  SELECT error_id, retry_count, resolved_at 
                  FROM crawling_errors 
                  WHERE ad_slot_id = ? 
                    AND DATE(created_at) = CURRENT_DATE()
                  ORDER BY created_at DESC 
                  LIMIT 1
                `, [adSlotId]);
                
                if (existingErrors.length > 0) {
                  const existing = existingErrors[0];
                  
                  // Already resolved today - skip
                  if (existing.resolved_at) {
                    logger.info(`Already resolved today, skip: ad_slot_id ${adSlotId}`);
                  } else if (existing.retry_count >= 3) {
                    // Max retry reached - skip
                    logger.info(`Max retry reached (${existing.retry_count}), skip: ad_slot_id ${adSlotId}`);
                  } else {
                    // Update retry_count
                    await mysqlConn.execute(`
                      UPDATE crawling_errors 
                      SET retry_count = retry_count + 1,
                          last_attempt = NOW()
                      WHERE error_id = ?
                    `, [existing.error_id]);
                    
                    logger.info(`Updated retry_count to ${existing.retry_count + 1}: ad_slot_id ${adSlotId}`);
                  }
                } else {
                  // Insert new error
                  const errorQuery = `
                    INSERT INTO crawling_errors (ad_slot_id, error_message, retry_count, last_attempt)
                    VALUES (?, ?, 1, NOW())
                  `;
                  
                  await mysqlConn.execute(errorQuery, [adSlotId, errorMessage]);
                  stats.crawlingErrorsCreated++;
                  logger.info(`Added to crawling_errors: ad_slot_id ${adSlotId}`);
                }
              }
            }
          }
        } else {
          // Valid rank found - update rankings and product info
          
          // First check if product info needs update
          if (row.product_name || row.thumbnail_url) {
            const [checkRows] = await mysqlConn.execute(`
              SELECT product_name, product_thumbnail
              FROM ad_slots
              WHERE REPLACE(TRIM(main_keyword), ' ', '') = ?
                AND product_url LIKE CONCAT('%/vp/products/', ?, '%')
                AND status = 'ACTIVE'
                AND is_active = 1
                AND (product_name IS NULL OR product_thumbnail IS NULL)
              LIMIT 1
            `, [row.keyword, row.product_code]);
            
            if (checkRows.length > 0) {
              const needsProductName = checkRows[0].product_name === null && row.product_name;
              const needsThumbnail = checkRows[0].product_thumbnail === null && row.thumbnail_url;
              productInfoWillUpdate = needsProductName || needsThumbnail;
            }
          }
          
          const updateQuery = `
            UPDATE ad_slots 
            SET rank_check_date = ?,
                rank_status = 'SUCCESS',
                price_start_rank = CASE 
                  WHEN price_start_rank IS NULL THEN ? 
                  ELSE price_start_rank 
                END,
                price_rank = ?,
                price_rank_diff = CASE 
                  WHEN price_start_rank IS NULL THEN ? - ?
                  ELSE price_start_rank - ?
                END,
                product_name = CASE 
                  WHEN product_name IS NULL AND ? IS NOT NULL THEN ?
                  ELSE product_name
                END,
                product_thumbnail = CASE 
                  WHEN product_thumbnail IS NULL AND ? IS NOT NULL THEN ?
                  ELSE product_thumbnail
                END,
                updated_at = NOW()
            WHERE REPLACE(TRIM(main_keyword), ' ', '') = ? 
              AND product_url LIKE CONCAT('%/vp/products/', ?, '%')
              AND status = 'ACTIVE'
              AND is_active = 1
          `;
          
          if (isDryRun) {
            logger.info('DRY RUN - Would update:', {
              keyword: row.keyword,
              productCode: row.product_code,
              bestRank: bestRank,
              worstRank: worstRank,
              productInfo: productInfoWillUpdate ? 'YES' : 'NO'
            });
            stats.rankingsUpdated++;
            if (productInfoWillUpdate) stats.productInfoUpdated++;
          } else {
            const [result] = await mysqlConn.execute(updateQuery, [
              today, 
              worstRank, 
              bestRank, 
              worstRank, bestRank, bestRank,
              row.product_name, row.product_name,
              row.thumbnail_url, row.thumbnail_url,
              row.keyword, 
              row.product_code
            ]);
            
            if (result.affectedRows > 0) {
              stats.rankingsUpdated++;
              if (productInfoWillUpdate) {
                stats.productInfoUpdated++;
                logger.info(`Updated ranking + product info: ${row.keyword} / ${row.product_code}`);
              } else {
                logger.info(`Updated ranking: ${row.keyword} / ${row.product_code} - Best: ${bestRank}, Worst: ${worstRank}`);
              }
              
              // Update resolved_at for today's unresolved errors
              const [resolveResult] = await mysqlConn.execute(`
                UPDATE crawling_errors 
                SET resolved_at = NOW()
                WHERE ad_slot_id IN (
                  SELECT ad_slot_id 
                  FROM ad_slots 
                  WHERE REPLACE(TRIM(main_keyword), ' ', '') = ? 
                    AND product_url LIKE CONCAT('%/vp/products/', ?, '%')
                    AND status = 'ACTIVE'
                    AND is_active = 1
                )
                  AND DATE(created_at) = CURRENT_DATE()
                  AND resolved_at IS NULL
              `, [row.keyword, row.product_code]);
              
              if (resolveResult.affectedRows > 0) {
                logger.info(`Resolved ${resolveResult.affectedRows} error(s) for ${row.keyword} / ${row.product_code}`);
              }
            }
          }
        }
        
        // Update last_synced_check in PostgreSQL
        if (!isDryRun) {
          const updateSyncQuery = `
            UPDATE v3_keyword_ranking_checks
            SET last_synced_check = $1
            WHERE id = $2
          `;
          await pgPool.query(updateSyncQuery, [lastCheckNumber, row.id]);
        }
        
      } catch (error) {
        stats.failed++;
        logger.error(`Failed to process ${row.keyword} / ${row.product_code}:`, error);
      }
    }
    
    // Final statistics
    logger.info('=== Sync Summary ===');
    logger.info(`Total processed: ${stats.totalProcessed}`);
    logger.info(`📈 Rankings updated: ${stats.rankingsUpdated}`);
    logger.info(`📦 Product info updated: ${stats.productInfoUpdated}`);
    logger.info(`🚫 Failed rankings (all zeros): ${stats.failedRankings}`);
    logger.info(`📝 Crawling errors created: ${stats.crawlingErrorsCreated}`);
    logger.info(`⏭️  Skipped: ${stats.skipped}`);
    logger.info(`❌ Failed: ${stats.failed}`);
    
    if (isDryRun) {
      logger.info('🔍 DRY RUN COMPLETE - No actual changes were made');
    } else {
      logger.info('✅ Sync completed successfully');
    }
    
    // Update sync log
    await updateSyncLog(syncLogId, 'SUCCESS');
    
  } catch (error) {
    logger.error('Sync failed:', error);
    if (syncLogId) {
      await updateSyncLog(syncLogId, 'FAILED', error.message);
    }
    throw error;
  } finally {
    if (mysqlConn) await mysqlConn.end();
  }
}

// Run sync if called directly
if (require.main === module) {
  syncToMySQL()
    .then(() => {
      logger.info('✅ Sync process completed');
      process.exit(0);
    })
    .catch(error => {
      logger.error('❌ Sync process failed:', error);
      process.exit(1);
    });
}

module.exports = { syncToMySQL };