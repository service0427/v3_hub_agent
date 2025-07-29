require('dotenv').config();
const { Pool } = require('pg');
const winston = require('winston');

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'mkt.techb.kr',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'productparser_db',
  user: process.env.DB_USER || 'techb_pp',
  password: process.env.DB_PASSWORD || 'Tech1324!',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level}] ${message}`;
    })
  ),
  transports: [new winston.transports.Console()]
});

const pool = new Pool(dbConfig);

// Test keywords data
const testKeywords = [
  { keyword: '무선청소기', product_code: '7897467657', product_name: '다이슨 V12 무선청소기', category: '가전' },
  { keyword: '노트북', product_code: '87428295010', product_name: '삼성 갤럭시북3', category: 'IT' },
  { keyword: '르누아르', product_code: '92681567022', product_name: '르누아르 화집', category: '도서' },
  { keyword: '무선이어폰', product_code: '8256780123', product_name: '애플 에어팟 프로', category: 'IT' },
  { keyword: '캠핑의자', product_code: '7654321098', product_name: '헬리녹스 체어원', category: '스포츠' },
];

async function checkTables() {
  try {
    // Check if tables exist
    const tableCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('v3_keyword_list', 'v3_keyword_ranking_checks', 'v3_keyword_check_logs', 'v3_keyword_check_failures')
      ORDER BY table_name
    `);
    
    logger.info('✅ Found tables:', tableCheck.rows.map(r => r.table_name).join(', '));
    
    if (tableCheck.rows.length < 4) {
      logger.error('❌ Some required tables are missing. Please run v3_keyword_ranking.sql first.');
      return false;
    }
    
    return true;
  } catch (error) {
    logger.error('Failed to check tables:', error.message);
    return false;
  }
}

async function clearTestData() {
  try {
    logger.info('🧹 Clearing existing test data...');
    
    // Clear in reverse dependency order
    await pool.query('DELETE FROM v3_keyword_check_failures WHERE keyword IN ($1, $2, $3, $4, $5)', 
      testKeywords.map(k => k.keyword));
    await pool.query('DELETE FROM v3_keyword_ranking_checks WHERE keyword IN ($1, $2, $3, $4, $5)', 
      testKeywords.map(k => k.keyword));
    await pool.query('DELETE FROM v3_keyword_check_logs WHERE check_date = CURRENT_DATE');
    await pool.query('DELETE FROM v3_keyword_list WHERE keyword IN ($1, $2, $3, $4, $5)', 
      testKeywords.map(k => k.keyword));
    
    logger.info('✅ Test data cleared');
  } catch (error) {
    logger.error('Failed to clear test data:', error.message);
  }
}

async function insertTestKeywords() {
  try {
    logger.info('📝 Inserting test keywords...');
    
    for (const keyword of testKeywords) {
      await pool.query(`
        INSERT INTO v3_keyword_list (keyword, product_code, product_name, category, priority, is_active)
        VALUES ($1, $2, $3, $4, $5, true)
        ON CONFLICT (keyword, product_code) DO UPDATE
        SET product_name = $3, category = $4, is_active = true, updated_at = CURRENT_TIMESTAMP
      `, [keyword.keyword, keyword.product_code, keyword.product_name, keyword.category, testKeywords.indexOf(keyword) + 1]);
    }
    
    logger.info(`✅ Inserted ${testKeywords.length} test keywords`);
    
    // Verify insertion
    const count = await pool.query('SELECT COUNT(*) as count FROM v3_keyword_list WHERE is_active = true');
    logger.info(`📊 Total active keywords in database: ${count.rows[0].count}`);
    
  } catch (error) {
    logger.error('Failed to insert keywords:', error.message);
    throw error;
  }
}

async function showResults() {
  try {
    logger.info('\n📊 === Test Results ===');
    
    // Check logs
    const logs = await pool.query(`
      SELECT check_number, status, total_keywords, checked_keywords, found_keywords, failed_keywords,
             start_time, end_time, EXTRACT(EPOCH FROM (end_time - start_time)) as duration_seconds
      FROM v3_keyword_check_logs
      WHERE check_date = CURRENT_DATE
      ORDER BY check_number
    `);
    
    if (logs.rows.length > 0) {
      logger.info('\n📋 Check Logs:');
      logs.rows.forEach(log => {
        logger.info(`  Check #${log.check_number}: ${log.status} - ${log.checked_keywords}/${log.total_keywords} checked, ${log.found_keywords} found, ${log.failed_keywords} failed (${log.duration_seconds ? log.duration_seconds.toFixed(1) + 's' : 'running'})`);
      });
    }
    
    // Check rankings
    const rankings = await pool.query(`
      SELECT keyword, product_code, 
             check_1, check_2, check_3, check_4, check_5,
             total_checks, found_count, min_rank, max_rank, avg_rank
      FROM v3_keyword_ranking_checks
      WHERE check_date = CURRENT_DATE
      AND keyword IN ($1, $2, $3, $4, $5)
      ORDER BY keyword
    `, testKeywords.map(k => k.keyword));
    
    if (rankings.rows.length > 0) {
      logger.info('\n🎯 Ranking Results:');
      rankings.rows.forEach(row => {
        const checks = [row.check_1, row.check_2, row.check_3, row.check_4, row.check_5]
          .filter(c => c !== null)
          .map(c => c || '-')
          .join(', ');
        logger.info(`  ${row.keyword}: [${checks}] | Found: ${row.found_count}/${row.total_checks} | Range: ${row.min_rank}-${row.max_rank} | Avg: ${row.avg_rank ? row.avg_rank.toFixed(1) : '-'}`);
      });
    }
    
    // Check failures
    const failures = await pool.query(`
      SELECT keyword, product_code, error_type, COUNT(*) as count
      FROM v3_keyword_check_failures
      WHERE check_date = CURRENT_DATE
      GROUP BY keyword, product_code, error_type
      ORDER BY count DESC
    `);
    
    if (failures.rows.length > 0) {
      logger.info('\n❌ Failures:');
      failures.rows.forEach(row => {
        logger.info(`  ${row.keyword} (${row.product_code}): ${row.error_type} - ${row.count} times`);
      });
    }
    
  } catch (error) {
    logger.error('Failed to show results:', error.message);
  }
}

async function main() {
  logger.info('=== V3 Batch System Test ===\n');
  
  try {
    // Check tables
    if (!await checkTables()) {
      process.exit(1);
    }
    
    // Menu
    logger.info('Select an option:');
    logger.info('1. Setup test data (clear existing + insert new)');
    logger.info('2. Run batch check (check #1)');
    logger.info('3. Run batch check (check #2)');
    logger.info('4. Run batch check (check #3)');
    logger.info('5. Show current results');
    logger.info('6. Clear all test data');
    logger.info('0. Exit');
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question('\nYour choice (0-6): ', async (answer) => {
      rl.close();
      
      switch(answer) {
        case '1':
          await clearTestData();
          await insertTestKeywords();
          await showResults();
          break;
          
        case '2':
        case '3':
        case '4':
          const checkNum = parseInt(answer) - 1;
          logger.info(`\n🚀 Running batch check #${checkNum}...`);
          logger.info('Execute: node batch-check.js ' + checkNum);
          const { spawn } = require('child_process');
          const child = spawn('node', ['batch-check.js', checkNum, '5'], { stdio: 'inherit' });
          child.on('close', async (code) => {
            if (code === 0) {
              await showResults();
            }
            await pool.end();
            process.exit(code);
          });
          return;
          
        case '5':
          await showResults();
          break;
          
        case '6':
          await clearTestData();
          logger.info('✅ All test data cleared');
          break;
          
        case '0':
        default:
          logger.info('👋 Goodbye!');
          break;
      }
      
      await pool.end();
      process.exit(0);
    });
    
  } catch (error) {
    logger.error('Fatal error:', error);
    await pool.end();
    process.exit(1);
  }
}

// Handle interruption
process.on('SIGINT', async () => {
  logger.info('\n👋 Interrupted');
  await pool.end();
  process.exit(0);
});

main();