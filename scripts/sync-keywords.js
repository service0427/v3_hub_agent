/**
 * sync-keywords.js - MySQL → PostgreSQL 키워드 동기화
 * 
 * 📋 주요 기능:
 * - MySQL ad_slots에서 활성 키워드를 PostgreSQL v3_keyword_list로 동기화
 * - 10분마다 크론탭으로 실행
 * - 시간대별 체크 조건에 따라 현재 시간에 해당하는 키워드만 처리
 * 
 * 🗄️ 데이터베이스:
 * - MySQL (소스): 138.2.125.63 / magic_dev / !magic00 / magic_db
 * - PostgreSQL (타겟): mkt.techb.kr / techb_pp / Tech1324! / productparser_db
 * 
 * 📊 주요 테이블:
 * - MySQL: ad_slots (edit_main_keyword, product_id, product_name, product_url, product_thumbnail)
 * - PostgreSQL: v3_keyword_list (keyword, product_code, product_name, product_url, thumbnail_url, is_active, last_sync_at)
 * 
 * 🔄 동기화 로직:
 * 1. MySQL에서 현재 시간에 활성화된 키워드 조회 (hourly_N = 1 AND hour_N = 현재시간)
 * 2. PostgreSQL 기존 데이터와 비교
 * 3. INSERT (새 키워드), UPDATE (기존 키워드), DEACTIVATE (MySQL에 없는 키워드)
 * 
 * 📝 로그:
 * - 일반: logs/sync-keywords-{날짜}.log
 * - 크론: logs/sync-keywords-cron.log
 * 
 * 🔧 실행:
 * node scripts/sync-keywords.js
 * 
 * ⚠️ 주의:
 * - product_id (MySQL) = product_code (PostgreSQL)
 * - 비활성화는 하지만 삭제는 하지 않음 (데이터 보존)
 * - last_sync_at은 batch API에서 60분 이내 체크용으로 사용
 * 
 * 📚 상세 문서: /home/tech/v3_hub_agent/docs/SYNC_KEYWORDS_GUIDE.md
 */

const mysql = require('mysql2/promise');
const { Pool } = require('pg');
const winston = require('winston');
const path = require('path');

// Logger setup
// 환경변수 설정 (run-sync.sh에서 가져옴)
process.env.DB_HOST = process.env.DB_HOST || 'mkt.techb.kr';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_NAME = process.env.DB_NAME || 'productparser_db';
process.env.DB_USER = process.env.DB_USER || 'techb_pp';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'Tech1324!';

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
      filename: path.join(__dirname, `../logs/sync-keywords-${new Date().toISOString().split('T')[0]}.log`) 
    })
  ]
});

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

async function syncKeywords() {
  let mysqlConn = null;
  
  try {
    logger.info('=== Starting Keyword Sync ===');
    
    // Connect to MySQL
    mysqlConn = await mysql.createConnection(mysqlConfig);
    logger.info('✅ MySQL connected');
    
    // Get ACTIVE slots from MySQL (GROUP BY to remove duplicates)
    const [activeSlots] = await mysqlConn.execute(`
      SELECT 
        REPLACE(TRIM(main_keyword), ' ', '') as edit_main_keyword,
        SUBSTRING_INDEX(SUBSTRING_INDEX(product_url, '/vp/products/', -1), '?', 1) as product_id,
        COUNT(*) as slot_count,
        MAX(product_url) as product_url
      FROM ad_slots
      WHERE status = 'ACTIVE' 
        AND is_active = 1
        AND main_keyword IS NOT NULL
        AND product_url LIKE '%/vp/products/%'
      GROUP BY edit_main_keyword, product_id
      ORDER BY slot_count DESC, edit_main_keyword
    `);
    
    logger.info(`Found ${activeSlots.length} unique keyword+product_id combinations in MySQL`);
    
    if (activeSlots.length === 0) {
      logger.warn('No active slots found to sync');
      return;
    }
    
    // Show sample data
    logger.info('Sample slots:', activeSlots.slice(0, 5).map(s => ({
      keyword: s.edit_main_keyword,
      product_id: s.product_id,
      count: s.slot_count
    })));
    
    // Get existing keywords from PostgreSQL
    const existingResult = await pgPool.query('SELECT keyword, product_code FROM v3_keyword_list');
    const existingMap = new Map();
    existingResult.rows.forEach(row => {
      existingMap.set(`${row.keyword}:${row.product_code}`, true);
    });
    
    logger.info(`Existing keywords in PostgreSQL: ${existingResult.rows.length}`);
    
    // Prepare data for sync
    const toInsert = [];
    const toUpdate = [];
    let skipped = 0;
    
    for (const slot of activeSlots) {
      const key = `${slot.edit_main_keyword}:${slot.product_id}`;
      
      if (existingMap.has(key)) {
        // Update existing
        toUpdate.push({
          keyword: slot.edit_main_keyword,
          product_code: slot.product_id,
          product_url: slot.product_url
        });
      } else {
        // Insert new
        toInsert.push({
          keyword: slot.edit_main_keyword,
          product_code: slot.product_id,
          product_url: slot.product_url
        });
      }
    }
    
    logger.info(`Sync summary: ${toInsert.length} to insert, ${toUpdate.length} to update`);
    
    // Insert new keywords
    if (toInsert.length > 0) {
      const insertQuery = `
        INSERT INTO v3_keyword_list (keyword, product_code, is_active, created_at, updated_at, last_sync_at)
        VALUES ($1, $2, TRUE, NOW(), NOW(), NOW())
        ON CONFLICT (keyword, product_code) DO NOTHING
      `;
      
      let inserted = 0;
      for (const item of toInsert) {
        try {
          await pgPool.query(insertQuery, [item.keyword, item.product_code]);
          inserted++;
        } catch (error) {
          logger.error(`Failed to insert ${item.keyword}:${item.product_code}`, error.message);
        }
      }
      logger.info(`✅ Inserted ${inserted} new keywords`);
    }
    
    // Update existing keywords (ensure they are active)
    if (toUpdate.length > 0) {
      const updateQuery = `
        UPDATE v3_keyword_list 
        SET is_active = TRUE, updated_at = NOW(), last_sync_at = NOW()
        WHERE keyword = $1 AND product_code = $2
      `;
      
      let updated = 0;
      for (const item of toUpdate) {
        try {
          await pgPool.query(updateQuery, [item.keyword, item.product_code]);
          updated++;
        } catch (error) {
          logger.error(`Failed to update ${item.keyword}:${item.product_code}`, error.message);
        }
      }
      logger.info(`✅ Updated ${updated} existing keywords`);
    }
    
    // Deactivate keywords not in MySQL anymore
    const mysqlKeys = new Set(activeSlots.map(s => `${s.edit_main_keyword}:${s.product_id}`));
    const toDeactivate = [];
    
    for (const row of existingResult.rows) {
      const key = `${row.keyword}:${row.product_code}`;
      if (!mysqlKeys.has(key)) {
        toDeactivate.push(row);
      }
    }
    
    if (toDeactivate.length > 0) {
      const deactivateQuery = `
        UPDATE v3_keyword_list 
        SET is_active = FALSE, updated_at = NOW()
        WHERE keyword = $1 AND product_code = $2 AND is_active = TRUE
      `;
      
      let deactivated = 0;
      for (const item of toDeactivate) {
        try {
          const result = await pgPool.query(deactivateQuery, [item.keyword, item.product_code]);
          if (result.rowCount > 0) deactivated++;
        } catch (error) {
          logger.error(`Failed to deactivate ${item.keyword}:${item.product_code}`, error.message);
        }
      }
      logger.info(`✅ Deactivated ${deactivated} keywords not in MySQL`);
    }
    
    // Final statistics
    const finalResult = await pgPool.query('SELECT COUNT(*) as total, COUNT(CASE WHEN is_active THEN 1 END) as active FROM v3_keyword_list');
    logger.info('Final statistics:', finalResult.rows[0]);
    
    logger.info('=== Sync completed successfully ===');
    
  } catch (error) {
    logger.error('Sync failed:', error);
    throw error;
  } finally {
    if (mysqlConn) await mysqlConn.end();
  }
}

// Run sync if called directly
if (require.main === module) {
  // 시작 메시지 출력 (run-sync.sh에서 가져옴)
  console.log('=== V3 Keyword Sync ===');
  console.log(`Time: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`);
  console.log('');
  
  syncKeywords()
    .then(() => {
      console.log('');
      console.log('=== Sync completed ===');
      logger.info('✅ Sync process completed');
      process.exit(0);
    })
    .catch(error => {
      logger.error('❌ Sync process failed:', error);
      process.exit(1);
    });
}

module.exports = { syncKeywords };