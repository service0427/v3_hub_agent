require('dotenv').config();
const { chromium } = require('playwright');
const winston = require('winston');
const path = require('path');
const fs = require('fs').promises;
const { Pool } = require('pg');

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

// Configuration
const config = {
  maxKeywords: parseInt(process.argv[2] || '100'), // 처리할 키워드 수 (limit)
  maxPages: parseInt(process.env.BATCH_MAX_PAGES || '3'), // 페이지당 최대 검색 수
  batchSize: parseInt(process.env.BATCH_SIZE || '10'), // 동시 처리 수
  delayBetweenBatches: parseInt(process.env.BATCH_DELAY || '5000'), // 배치 간 대기 시간
  headless: false, // 항상 GUI 모드
  logLevel: process.env.LOG_LEVEL || 'info'
};

// Logger setup
const logger = winston.createLogger({
  level: config.logLevel,
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
      filename: `logs/batch-check-${new Date().toISOString().split('T')[0]}.log` 
    })
  ]
});

// Database pool
const pool = new Pool(dbConfig);

// Get keywords from database
async function getKeywords() {
  try {
    // check_1부터 check_10까지 중 NULL인 컬럼 찾기
    // 마지막 체크 시간이 오래된 순서로 정렬
    const query = `
      SELECT 
        kl.keyword, 
        kl.product_code, 
        kl.product_name,
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
        AND (
          krc.id IS NULL  -- 오늘 체크한 적이 없거나
          OR krc.check_1 IS NULL
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
      ORDER BY 
        CASE 
          WHEN krc.id IS NULL THEN '1900-01-01'::TIMESTAMP  -- 오늘 체크 안한 것 최우선
          ELSE krc.updated_at 
        END ASC,
        last_check_time ASC,
        kl.id ASC
      LIMIT $1
    `;
    
    const result = await pool.query(query, [config.maxKeywords]);
    return result.rows;
  } catch (error) {
    logger.error('Failed to get keywords:', error);
    throw error;
  }
}

// 다음 빈 체크 번호 찾기
async function getNextCheckNumber(keyword, productCode) {
  try {
    const query = `
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
    
    const result = await pool.query(query, [keyword, productCode]);
    
    // 오늘 체크한 적이 없으면 1번부터 시작
    if (result.rows.length === 0) {
      return 1;
    }
    
    return result.rows[0].next_check_number || 1;
  } catch (error) {
    logger.error('Failed to get next check number:', error);
    return 1;
  }
}

// Start check log
async function startCheckLog(totalKeywords) {
  try {
    const query = `
      INSERT INTO v3_keyword_check_logs 
      (check_date, check_number, start_time, total_keywords, status)
      VALUES (CURRENT_DATE, 0, NOW(), $1, 'running')
      RETURNING id
    `;
    
    const result = await pool.query(query, [totalKeywords]);
    return result.rows[0].id;
  } catch (error) {
    logger.error('Failed to start check log:', error);
    throw error;
  }
}

// Update check log
async function updateCheckLog(logId, data) {
  try {
    const query = `
      UPDATE v3_keyword_check_logs 
      SET checked_keywords = $2, found_keywords = $3, failed_keywords = $4, 
          status = $5, end_time = NOW(), error_message = $6
      WHERE id = $1
    `;
    
    await pool.query(query, [
      logId,
      data.checked || 0,
      data.found || 0,
      data.failed || 0,
      data.status || 'running',
      data.error || null
    ]);
  } catch (error) {
    logger.error('Failed to update check log:', error);
  }
}

// Save ranking result
async function saveRankingResult(keyword, productCode, rank) {
  try {
    // 다음 빈 체크 번호 가져오기
    const checkNumber = await getNextCheckNumber(keyword, productCode);
    
    if (checkNumber === 0 || checkNumber > 10) {
      logger.warn(`All check columns filled for ${keyword} - ${productCode}`);
      return;
    }
    
    const checkColumn = `check_${checkNumber}`;
    const checkTimeColumn = `check_time_${checkNumber}`;
    
    // rank가 null이면 0으로 저장 (순위권 밖)
    const rankValue = rank || 0;
    
    logger.info(`Saving to ${checkColumn}: ${keyword} - rank ${rankValue === 0 ? 'not found' : rankValue}`);
    
    // First, try to update existing record
    const updateQuery = `
      UPDATE v3_keyword_ranking_checks 
      SET ${checkColumn} = $1::INTEGER, 
          ${checkTimeColumn} = CURRENT_TIME,
          total_checks = total_checks + 1,
          found_count = found_count + CASE WHEN $1::INTEGER > 0 THEN 1 ELSE 0 END,
          updated_at = NOW()
      WHERE keyword = $2 
        AND product_code = $3 
        AND check_date = CURRENT_DATE
    `;
    
    const updateResult = await pool.query(updateQuery, [rankValue, keyword, productCode]);
    
    // If no rows updated, insert new record
    if (updateResult.rowCount === 0) {
      const insertQuery = `
        INSERT INTO v3_keyword_ranking_checks 
        (keyword, product_code, check_date, ${checkColumn}, ${checkTimeColumn}, 
         total_checks, found_count)
        VALUES ($1, $2, CURRENT_DATE, $3::INTEGER, CURRENT_TIME, 1, $4)
        ON CONFLICT (keyword, product_code, check_date) 
        DO UPDATE SET 
          ${checkColumn} = $3::INTEGER,
          ${checkTimeColumn} = CURRENT_TIME,
          total_checks = v3_keyword_ranking_checks.total_checks + 1,
          found_count = v3_keyword_ranking_checks.found_count + CASE WHEN $3::INTEGER > 0 THEN 1 ELSE 0 END,
          updated_at = NOW()
      `;
      
      await pool.query(insertQuery, [
        keyword, 
        productCode, 
        rankValue, 
        rankValue > 0 ? 1 : 0
      ]);
    }
    
    // Update statistics
    await updateStatistics(keyword, productCode);
    
  } catch (error) {
    logger.error(`Failed to save ranking for ${keyword}:`, error);
  }
}

// Update min/max/avg statistics
async function updateStatistics(keyword, productCode) {
  try {
    // First get all check values
    const selectQuery = `
      SELECT check_1, check_2, check_3, check_4, check_5,
             check_6, check_7, check_8, check_9, check_10,
             found_count
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

// Log failure
async function logFailure(keyword, productCode, errorType, errorMessage) {
  try {
    const checkNumber = await getNextCheckNumber(keyword, productCode);
    
    const query = `
      INSERT INTO v3_keyword_check_failures 
      (check_date, check_number, keyword, product_code, error_type, error_message)
      VALUES (CURRENT_DATE, $1, $2, $3, $4, $5)
    `;
    
    await pool.query(query, [
      checkNumber,
      keyword,
      productCode,
      errorType,
      errorMessage
    ]);
  } catch (error) {
    logger.error('Failed to log failure:', error);
  }
}

// Search single keyword
async function searchKeyword(page, keyword, productCode) {
  try {
    const searchUrl = `https://www.coupang.com/np/search?q=${encodeURIComponent(keyword)}&channel=user&failRedirectApp=true&page=1&listSize=72`;
    
    await page.goto(searchUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    await page.waitForTimeout(1000);
    
    // Check for error page
    const quickCheck = await page.evaluate(() => {
      const noResultElement = document.querySelector('[class^=no-result_magnifier]');
      const noResultText = document.body?.innerText?.includes('에 대한 검색결과가 없습니다');
      const productList = document.querySelector('#product-list');
      const hasProductList = !!productList;
      const productCount = productList ? productList.querySelectorAll('li[data-id]').length : 0;
      
      const bodyText = document.body?.innerText || '';
      const isErrorPage = bodyText.includes('Secure Connection Failed') || 
                         bodyText.includes('NS_ERROR_NET_INTERRUPT') ||
                         bodyText.includes('The connection to') ||
                         bodyText.includes('was interrupted');
      
      return {
        hasNoResult: !!noResultElement || !!noResultText,
        hasProductList: hasProductList,
        productCount: productCount,
        isErrorPage: isErrorPage,
        bodyPreview: bodyText.substring(0, 200)
      };
    });
    
    if (quickCheck.isErrorPage) {
      logger.error(`❌ Browser error page detected for: ${keyword}`);
      throw new Error('Browser error page detected');
    }
    
    if (quickCheck.hasNoResult) {
      logger.warn(`No results for: ${keyword}`);
      return null;
    }
    
    // Wait for product list if needed
    if (!quickCheck.hasProductList || quickCheck.productCount === 0) {
      try {
        await page.waitForSelector('#product-list > li[data-id]', { timeout: 5000 });
      } catch (error) {
        logger.warn(`Product list not found for: ${keyword}`);
        return null;
      }
    }
    
    // Extract products and find target
    let foundRank = null;
    let currentPage = 1;
    
    while (currentPage <= config.maxPages && !foundRank) {
      if (currentPage > 1) {
        const nextUrl = `https://www.coupang.com/np/search?q=${encodeURIComponent(keyword)}&channel=user&failRedirectApp=true&page=${currentPage}&listSize=72`;
        await page.goto(nextUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1000);
      }
      
      const result = await page.evaluate((targetCode) => {
        const products = document.querySelectorAll('#product-list > li[data-id]');
        const filteredProducts = Array.from(products).filter(i => {
          const linkElement = i.querySelector('a');
          const adMarkElement = i.querySelector('[class*=AdMark]');
          const href = linkElement ? linkElement.getAttribute('href') : '';
          return !adMarkElement && !href.includes('sourceType=srp_product_ads');
        });
        
        for (let i = 0; i < filteredProducts.length; i++) {
          const product = filteredProducts[i];
          const linkElement = product.querySelector('a');
          
          if (linkElement) {
            const href = linkElement.getAttribute('href');
            
            // Extract IDs
            const productIdMatch = href.match(/\/vp\/products\/(\d+)/);
            const itemIdMatch = href.match(/itemId=(\d+)/);
            const vendorItemIdMatch = href.match(/vendorItemId=(\d+)/);
            
            const productId = productIdMatch ? productIdMatch[1] : null;
            const itemId = itemIdMatch ? itemIdMatch[1] : null;
            const vendorItemId = vendorItemIdMatch ? vendorItemIdMatch[1] : null;
            
            const codeStr = String(targetCode);
            if (String(product.dataset.id) === codeStr ||
                String(productId) === codeStr ||
                String(itemId) === codeStr ||
                String(vendorItemId) === codeStr) {
              return i + 1; // realRank (광고 제외)
            }
          }
        }
        
        return null;
      }, productCode);
      
      if (result) {
        foundRank = (currentPage - 1) * 72 + result;
        break;
      }
      
      currentPage++;
    }
    
    return foundRank;
    
  } catch (error) {
    logger.error(`Search failed for ${keyword}:`, error.message);
    throw error;
  }
}

// Process batch of keywords
async function processBatch(browser, keywords, stats) {
  const results = await Promise.all(
    keywords.map(async ({ keyword, product_code }) => {
      const context = await browser.newContext({
        viewport: { width: 1200, height: 800 },
        locale: 'ko-KR',
        timezoneId: 'Asia/Seoul'
      });
      
      const page = await context.newPage();
      
      try {
        logger.info(`Checking: ${keyword} (${product_code})`);
        const rank = await searchKeyword(page, keyword, product_code);
        
        await saveRankingResult(keyword, product_code, rank);
        
        stats.checked++;
        if (rank) {
          stats.found++;
          logger.info(`✅ Found at rank ${rank}: ${keyword}`);
        } else {
          logger.info(`❌ Not found: ${keyword}`);
        }
        
        return { success: true, keyword, rank };
        
      } catch (error) {
        stats.failed++;
        logger.error(`Failed: ${keyword} - ${error.message}`);
        await logFailure(keyword, product_code, 'search_error', error.message);
        return { success: false, keyword, error: error.message };
        
      } finally {
        await context.close();
      }
    })
  );
  
  return results;
}

// Main function
async function main() {
  logger.info('=== V3 Keyword Ranking Batch Check ===');
  logger.info(`Max keywords: ${config.maxKeywords}`);
  logger.info(`Batch size: ${config.batchSize}`);
  
  let browser = null;
  let logId = null;
  const stats = { checked: 0, found: 0, failed: 0 };
  
  try {
    // Get keywords
    const keywords = await getKeywords();
    logger.info(`Found ${keywords.length} keywords to check`);
    
    if (keywords.length === 0) {
      logger.warn('No keywords to check');
      return;
    }
    
    // Start check log
    logId = await startCheckLog(keywords.length);
    
    // Launch browser
    browser = await chromium.launch({
      headless: config.headless,
      args: ['--disable-blink-features=AutomationControlled']
    });
    
    // Process in batches
    for (let i = 0; i < keywords.length; i += config.batchSize) {
      const batch = keywords.slice(i, i + config.batchSize);
      const batchNum = Math.floor(i / config.batchSize) + 1;
      const totalBatches = Math.ceil(keywords.length / config.batchSize);
      
      logger.info(`Processing batch ${batchNum}/${totalBatches}`);
      
      await processBatch(browser, batch, stats);
      
      // Update check log
      await updateCheckLog(logId, {
        checked: stats.checked,
        found: stats.found,
        failed: stats.failed,
        status: 'running'
      });
      
      // Delay between batches
      if (i + config.batchSize < keywords.length) {
        logger.info(`Waiting ${config.delayBetweenBatches}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, config.delayBetweenBatches));
      }
    }
    
    // Final update
    await updateCheckLog(logId, {
      checked: stats.checked,
      found: stats.found,
      failed: stats.failed,
      status: 'completed'
    });
    
    logger.info('✅ Batch check completed successfully');
    logger.info(`Total checked: ${stats.checked}`);
    logger.info(`Total found: ${stats.found}`);
    logger.info(`Total failed: ${stats.failed}`);
    
  } catch (error) {
    logger.error('Batch check failed:', error);
    
    if (logId) {
      await updateCheckLog(logId, {
        checked: stats.checked,
        found: stats.found,
        failed: stats.failed,
        status: 'failed',
        error: error.message
      });
    }
    
  } finally {
    if (browser) await browser.close();
    await pool.end();
  }
}

// Run
main().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});