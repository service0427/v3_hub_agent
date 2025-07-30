require('dotenv').config();
const { chromium, firefox } = require('playwright');
const winston = require('winston');
const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// IP 주소 가져오기 (간결하게)
async function getAgentIP() {
  try {
    const { stdout } = await execAsync('ip a | grep "inet " | grep -v "127.0.0.1" | head -1 | awk \'{print $2}\' | cut -d/ -f1');
    const localIP = stdout.trim();
    if (localIP) return localIP;
  } catch (error) {}
  
  try {
    const response = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
    return response.data.ip;
  } catch (error) {
    return 'unknown';
  }
}

// Configuration
const config = {
  hubApiUrl: process.env.HUB_API_URL || 'http://localhost:3331',
  agentId: process.env.AGENT_ID || `agent-${Date.now()}`,
  browser: process.env.BROWSER || 'chrome',
  maxKeywords: parseInt(process.argv[2] || '2'),
  maxPages: parseInt(process.env.BATCH_MAX_PAGES || '5'),
  batchSize: parseInt(process.env.BATCH_SIZE || '10'),
  delayBetweenBatches: parseInt(process.env.BATCH_DELAY || '5000'),
  headless: false,
  logLevel: process.env.LOG_LEVEL || 'info',
  apiTimeout: 20000,
  agentIP: null
};

// Simple Logger - 간결한 로그만 출력
const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => {
      // 중요한 정보만 간결하게 표시
      if (level === 'error') {
        return `❌ ${message}`;
      } else if (message.includes('✅')) {
        return message;
      } else if (message.includes('Found at rank')) {
        return message;
      } else if (message.includes('Not found')) {
        return `⚠️  ${message}`;
      } else if (message.includes('Checking:')) {
        return `🔍 ${message}`;
      } else if (message.includes('Got') && message.includes('keywords')) {
        return `📋 ${message}`;
      } else if (message.includes('No keywords')) {
        return `📭 ${message}`;
      }
      // 나머지 디버그 정보는 무시
      return null;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.printf(({ message }) => message || '')
    }),
    new winston.transports.File({ 
      filename: `logs/batch-check-api-${new Date().toISOString().split('T')[0]}.log`,
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        winston.format.printf(({ timestamp, level, message }) => {
          return `${timestamp} [${level}] ${message}`;
        })
      )
    })
  ]
});

// API client setup
const apiClient = axios.create({
  baseURL: `${config.hubApiUrl}/api/v3/internal`,
  timeout: config.apiTimeout,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Get keywords from API
async function getKeywordsFromAPI(limit) {
  try {
    const response = await apiClient.get('/batch/keywords', {
      params: {
        limit,
        agentId: config.agentId
      }
    });
    
    return response.data.keywords || [];
  } catch (error) {
    logger.error(`API error: ${error.response?.data?.message || error.message}`);
    throw error;
  }
}

// Save ranking result
async function saveRankingResult(keyword, productCode, rank, productInfo = null) {
  try {
    await apiClient.post('/batch/result', {
      keyword,
      productCode,
      rank: rank || 0,
      agentId: config.agentId,
      agentIP: config.agentIP,
      browser: config.browser,
      productName: productInfo?.productName || null,
      thumbnailUrl: productInfo?.thumbnailUrl || null,
      rating: productInfo?.rating || null,
      reviewCount: productInfo?.reviewCount || null
    });
    
    return true;
  } catch (error) {
    logger.error(`Save result error: ${error.message}`);
    return false;
  }
}

// Log failure
async function logFailure(keyword, productCode, error) {
  try {
    await apiClient.post('/batch/failure', {
      keyword,
      productCode,
      agentId: config.agentId,
      agentIP: config.agentIP,
      browser: config.browser,
      error: error
    });
  } catch (err) {
    logger.error(`Log failure error: ${err.message}`);
  }
}

// Search keyword function (간결하게)
async function searchKeyword(page, keyword, productCode) {
  try {
    const searchUrl = `https://www.coupang.com/np/search?q=${encodeURIComponent(keyword)}&channel=user`;
    
    await page.goto(searchUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    // URL 체크 - 차단 감지
    const currentUrl = page.url();
    if (currentUrl.includes('error') || currentUrl.includes('blocked')) {
      throw new Error(`Blocked - URL: ${currentUrl}`);
    }
    
    // 상품 목록 대기
    await page.waitForSelector('#productList li[data-product-id], #product-list li[data-id]', { 
      timeout: 10000 
    });
    
    // 상품 순위 찾기
    const products = await page.$$('#productList li[data-product-id], #product-list li[data-id]');
    
    for (let i = 0; i < Math.min(products.length, 100); i++) {
      const productId = await products[i].getAttribute('data-product-id') || 
                       await products[i].getAttribute('data-id');
      
      if (productId === productCode) {
        // 상품 정보 추출
        const productInfo = await products[i].evaluate(el => {
          const nameEl = el.querySelector('.name, .title, [class*="name"], [class*="title"]');
          const priceEl = el.querySelector('.price-value, .price, [class*="price"]');
          const ratingEl = el.querySelector('.rating, [class*="rating"]');
          const reviewEl = el.querySelector('.review-count, [class*="review"]');
          const imgEl = el.querySelector('img');
          
          return {
            productName: nameEl?.textContent?.trim(),
            thumbnailUrl: imgEl?.src,
            rating: parseFloat(ratingEl?.textContent?.match(/[\d.]+/)?.[0]) || null,
            reviewCount: parseInt(reviewEl?.textContent?.match(/\d+/)?.[0]) || null,
            rank: i + 1
          };
        });
        
        return productInfo;
      }
    }
    
    // 다음 페이지들 체크
    for (let page = 2; page <= config.maxPages; page++) {
      const nextUrl = `${searchUrl}&page=${page}`;
      await page.goto(nextUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      const products = await page.$$('#productList li[data-product-id], #product-list li[data-id]');
      
      for (let i = 0; i < products.length; i++) {
        const productId = await products[i].getAttribute('data-product-id') || 
                         await products[i].getAttribute('data-id');
        
        if (productId === productCode) {
          const productInfo = await products[i].evaluate(el => {
            const nameEl = el.querySelector('.name, .title, [class*="name"], [class*="title"]');
            const imgEl = el.querySelector('img');
            
            return {
              productName: nameEl?.textContent?.trim(),
              thumbnailUrl: imgEl?.src,
              rank: (page - 1) * products.length + i + 1
            };
          });
          
          return productInfo;
        }
      }
    }
    
    return null;
    
  } catch (error) {
    throw error;
  }
}

// Process batch
async function processBatch(browser, keywords, stats) {
  const results = await Promise.all(
    keywords.map(async ({ keyword, productCode }) => {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        viewport: { width: 1280, height: 720 },
        locale: 'ko-KR',
        timezoneId: 'Asia/Seoul',
        navigationTimeout: 45000,
        actionTimeout: 30000
      });
      
      const page = await context.newPage();
      
      try {
        logger.info(`Checking: ${keyword} (${productCode})`);
        const result = await searchKeyword(page, keyword, productCode);
        
        const rank = result && typeof result === 'object' ? result.rank : result;
        const productInfo = result && typeof result === 'object' ? result : null;
        
        await saveRankingResult(keyword, productCode, rank, productInfo);
        
        stats.checked++;
        if (rank) {
          stats.found++;
          logger.info(`✅ Found at rank ${rank}: ${keyword}`);
        } else {
          logger.info(`Not found: ${keyword}`);
        }
        
        return { success: true, keyword, rank };
        
      } catch (error) {
        stats.failed++;
        logger.error(`${keyword}: ${error.message}`);
        await logFailure(keyword, productCode, error.message);
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
  config.agentIP = await getAgentIP();
  
  let browser = null;
  const stats = { checked: 0, found: 0, failed: 0 };
  
  try {
    // Get keywords from API
    const keywords = await getKeywordsFromAPI(config.maxKeywords);
    logger.info(`Got ${keywords.length} keywords`);
    
    if (keywords.length === 0) {
      logger.warn('No keywords to check');
      return;
    }
    
    // Launch browser
    if (config.browser === 'firefox') {
      browser = await firefox.launch({
        headless: config.headless,
        firefoxUserPrefs: {
          'dom.webdriver.enabled': false
        }
      });
    } else {
      browser = await chromium.launch({
        headless: config.headless,
        args: ['--disable-blink-features=AutomationControlled'],
        timeout: 60000
      });
    }
    
    // Process keywords
    await processBatch(browser, keywords, stats);
    
  } catch (error) {
    logger.error(`Batch failed: ${error.message}`);
    throw error;
  } finally {
    if (browser) await browser.close();
    
    // 최종 결과만 간단히 출력
    console.log('─────────────────────────');
    console.log(`📊 Checked: ${stats.checked} | Found: ${stats.found} | Failed: ${stats.failed}`);
  }
}

// Run
main().catch(error => {
  process.exit(1);
});