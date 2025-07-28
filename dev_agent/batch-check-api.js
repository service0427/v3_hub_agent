require('dotenv').config();
const { chromium } = require('playwright');
const winston = require('winston');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');

// Configuration
const config = {
  hubApiUrl: process.env.HUB_API_URL || 'http://localhost:3331',
  agentId: process.env.AGENT_ID || `agent-${Date.now()}`,
  maxKeywords: parseInt(process.argv[2] || '100'),
  maxPages: parseInt(process.env.BATCH_MAX_PAGES || '5'),
  batchSize: parseInt(process.env.BATCH_SIZE || '10'),
  delayBetweenBatches: parseInt(process.env.BATCH_DELAY || '5000'),
  headless: false, // 항상 GUI 모드
  logLevel: process.env.LOG_LEVEL || 'info',
  apiTimeout: 20000 // 20초
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
      filename: `logs/batch-check-api-${new Date().toISOString().split('T')[0]}.log` 
    })
  ]
});

// API client setup
const apiClient = axios.create({
  baseURL: `${config.hubApiUrl}/api/v3/internal/batch`,
  timeout: config.apiTimeout,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Get keywords from API
async function getKeywordsFromAPI(limit) {
  try {
    const response = await apiClient.get('/keywords', {
      params: { 
        limit,
        agentId: config.agentId
      }
    });
    
    return response.data.keywords || [];
  } catch (error) {
    if (error.response) {
      logger.error('API error getting keywords:', {
        status: error.response.status,
        data: error.response.data
      });
    } else if (error.code === 'ECONNABORTED') {
      logger.error('API timeout getting keywords');
    } else {
      logger.error('Failed to get keywords:', error.message);
    }
    throw error;
  }
}

// Save ranking result to API
async function saveRankingResult(keyword, product_code, rank) {
  try {
    await apiClient.post('/result', {
      keyword,
      productCode: product_code,
      rank,
      agentId: config.agentId
    });
    
    logger.info(`Result saved via API: ${keyword} - rank ${rank || 'not found'}`);
  } catch (error) {
    logger.error('Failed to save result:', error.message);
    throw error;
  }
}

// Log failure to API
async function logFailure(keyword, product_code, errorMessage) {
  try {
    await apiClient.post('/failure', {
      keyword,
      productCode: product_code,
      error: errorMessage,
      agentId: config.agentId
    });
    
    logger.info('Failure logged via API');
  } catch (error) {
    logger.error('Failed to log failure:', error.message);
    // Don't throw - failure logging should not stop the process
  }
}

// Search single keyword
async function searchKeyword(page, keyword, product_code) {
  try {
    const searchUrl = `https://www.coupang.com/np/search?q=${encodeURIComponent(keyword)}&channel=user&failRedirectApp=true&page=1&listSize=72`;
    
    await page.goto(searchUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 20000  // 전체 사이클 30초 제한을 위해 20초로 조정
    });
    
    await page.waitForTimeout(2000); // 페이지 안정화 대기
    
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
        await page.waitForSelector('#product-list > li[data-id]', { timeout: 8000 }); // 전체 30초 제한 내 동작
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
        await page.goto(nextUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }); // 다음 페이지는 더 빠르게
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
      }, product_code);
      
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
        await logFailure(keyword, product_code, error.message);
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
  logger.info('=== V3 Keyword Ranking Batch Check (API Mode) ===');
  logger.info(`Hub API URL: ${config.hubApiUrl}`);
  logger.info(`Agent ID: ${config.agentId}`);
  logger.info(`Max keywords: ${config.maxKeywords}`);
  logger.info(`Batch size: ${config.batchSize}`);
  
  let browser = null;
  const stats = { checked: 0, found: 0, failed: 0 };
  
  try {
    // Test API connection
    try {
      await apiClient.get('/status');
      logger.info('✅ API connection successful');
    } catch (error) {
      logger.error('❌ API connection failed:', error.message);
      throw new Error('Cannot connect to Hub API');
    }
    
    // Get keywords from API
    const keywords = await getKeywordsFromAPI(config.maxKeywords);
    logger.info(`Got ${keywords.length} keywords from API`);
    
    if (keywords.length === 0) {
      logger.warn('No keywords to check');
      return;
    }
    
    // Launch browser
    browser = await chromium.launch({
      headless: config.headless,
      args: [
        '--disable-blink-features=AutomationControlled'
      ]
    });
    
    // Process in batches
    for (let i = 0; i < keywords.length; i += config.batchSize) {
      const batch = keywords.slice(i, i + config.batchSize);
      const batchNum = Math.floor(i / config.batchSize) + 1;
      const totalBatches = Math.ceil(keywords.length / config.batchSize);
      
      logger.info(`Processing batch ${batchNum}/${totalBatches}`);
      
      await processBatch(browser, batch, stats);
      
      // Delay between batches
      if (i + config.batchSize < keywords.length) {
        logger.info(`Waiting ${config.delayBetweenBatches}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, config.delayBetweenBatches));
      }
    }
    
    logger.info('✅ Batch check completed successfully');
    logger.info(`Total checked: ${stats.checked}`);
    logger.info(`Total found: ${stats.found}`);
    logger.info(`Total failed: ${stats.failed}`);
    
  } catch (error) {
    logger.error('Batch check failed:', error);
  } finally {
    if (browser) await browser.close();
  }
}

// Ensure log directory exists
async function ensureLogDirectory() {
  try {
    await fs.mkdir('logs', { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
}

// Run
ensureLogDirectory().then(() => {
  main().catch(error => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });
});