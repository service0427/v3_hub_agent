require('dotenv').config();
const { Pool } = require('pg');
const winston = require('winston');
const fs = require('fs').promises;
const path = require('path');

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'mkt.techb.kr',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'productparser_db',
  user: process.env.DB_USER || 'techb_pp',
  password: process.env.DB_PASSWORD || 'Tech1324!',
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

async function createTables() {
  const client = await pool.connect();
  
  try {
    logger.info('🔨 Creating V3 keyword ranking tables...\n');
    
    // 1. v3_keyword_list
    await client.query(`
      CREATE TABLE IF NOT EXISTS v3_keyword_list (
        id SERIAL PRIMARY KEY,
        keyword VARCHAR(500) NOT NULL,
        product_code VARCHAR(255) NOT NULL,
        product_name VARCHAR(1000),
        is_active BOOLEAN DEFAULT TRUE,
        priority INTEGER DEFAULT 1,
        category VARCHAR(100),
        memo TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        UNIQUE (keyword, product_code)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_v3_keyword_active ON v3_keyword_list(is_active)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_v3_keyword_priority ON v3_keyword_list(priority)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_v3_keyword_category ON v3_keyword_list(category)');
    logger.info('✅ Created v3_keyword_list table');
    
    // 2. v3_keyword_ranking_checks
    await client.query(`
      CREATE TABLE IF NOT EXISTS v3_keyword_ranking_checks (
        id SERIAL PRIMARY KEY,
        keyword VARCHAR(500) NOT NULL,
        product_code VARCHAR(255) NOT NULL,
        check_date DATE NOT NULL,
        
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
        
        total_checks INTEGER DEFAULT 0,
        found_count INTEGER DEFAULT 0,
        min_rank INTEGER,
        max_rank INTEGER,
        avg_rank DECIMAL(5,2),
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        UNIQUE (keyword, product_code, check_date)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_v3_ranking_check_date ON v3_keyword_ranking_checks(check_date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_v3_ranking_keyword ON v3_keyword_ranking_checks(keyword)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_v3_ranking_product_code ON v3_keyword_ranking_checks(product_code)');
    logger.info('✅ Created v3_keyword_ranking_checks table');
    
    // 3. v3_keyword_check_logs
    await client.query(`
      CREATE TABLE IF NOT EXISTS v3_keyword_check_logs (
        id SERIAL PRIMARY KEY,
        check_date DATE NOT NULL,
        check_number INTEGER NOT NULL,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP,
        total_keywords INTEGER DEFAULT 0,
        checked_keywords INTEGER DEFAULT 0,
        found_keywords INTEGER DEFAULT 0,
        failed_keywords INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'running',
        error_message TEXT
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_v3_check_log_date_number ON v3_keyword_check_logs(check_date, check_number)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_v3_check_log_status ON v3_keyword_check_logs(status)');
    logger.info('✅ Created v3_keyword_check_logs table');
    
    // 4. v3_keyword_check_failures
    await client.query(`
      CREATE TABLE IF NOT EXISTS v3_keyword_check_failures (
        id SERIAL PRIMARY KEY,
        check_date DATE NOT NULL,
        check_number INTEGER NOT NULL,
        keyword VARCHAR(500) NOT NULL,
        product_code VARCHAR(255) NOT NULL,
        error_type VARCHAR(50),
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_v3_failure_date_number ON v3_keyword_check_failures(check_date, check_number)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_v3_failure_keyword_code ON v3_keyword_check_failures(keyword, product_code)');
    logger.info('✅ Created v3_keyword_check_failures table');
    
    // 5. Statistics view
    await client.query(`
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
      GROUP BY check_date
    `);
    logger.info('✅ Created v3_keyword_daily_stats view');
    
    logger.info('\n✅ All tables created successfully!');
    
    // Check table status
    const tableCheck = await client.query(`
      SELECT table_name, 
             pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
             n_live_tup as row_count
      FROM pg_tables 
      LEFT JOIN pg_stat_user_tables ON tablename = relname
      WHERE schemaname = 'public' 
      AND tablename LIKE 'v3_keyword%'
      ORDER BY tablename
    `);
    
    logger.info('\n📊 Table Status:');
    tableCheck.rows.forEach(row => {
      logger.info(`  ${row.table_name}: ${row.size || '0 bytes'} (${row.row_count || 0} rows)`);
    });
    
  } catch (error) {
    logger.error('Failed to create tables:', error.message);
    logger.error('Error detail:', error.detail || 'No details');
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  logger.info('=== V3 Keyword Ranking Database Setup ===\n');
  
  try {
    await createTables();
    logger.info('\n✅ Database setup completed successfully!');
    logger.info('\n📝 Next steps:');
    logger.info('  1. Run test-batch-system.js to add test keywords');
    logger.info('  2. Run batch-check.js to check keyword rankings');
    
  } catch (error) {
    logger.error('Setup failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();