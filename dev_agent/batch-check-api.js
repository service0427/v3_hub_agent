require('dotenv').config();
const { chromium } = require('playwright');
const winston = require('winston');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Get IP Address using ip a command
async function getAgentIP() {
  try {
    // ip a 명령어로 IP 가져오기
    const { stdout } = await execAsync('ip a | grep "inet " | grep -v "127.0.0.1" | head -1 | awk \'{print $2}\' | cut -d/ -f1');
    const localIP = stdout.trim();
    
    if (localIP) {
      return localIP;
    }
  } catch (error) {
    logger.warn('Failed to get IP from ip a command:', error.message);
  }
  
  try {
    // 실패시 외부 API 사용
    const response = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
    return response.data.ip;
  } catch (error) {
    logger.error('Failed to get IP address:', error.message);
    return 'unknown';
  }
}

// Configuration
const config = {
  hubApiUrl: process.env.HUB_API_URL || 'http://localhost:3331',
  agentId: process.env.AGENT_ID || `agent-${Date.now()}`,
  browser: process.env.BROWSER || 'chrome', // chrome, firefox, edge
  maxKeywords: parseInt(process.argv[2] || '2'),
  maxPages: parseInt(process.env.BATCH_MAX_PAGES || '5'),
  batchSize: parseInt(process.env.BATCH_SIZE || '10'),
  delayBetweenBatches: parseInt(process.env.BATCH_DELAY || '5000'),
  headless: false, // 항상 GUI 모드
  logLevel: process.env.LOG_LEVEL || 'info',
  apiTimeout: 20000, // 20초
  agentIP: null // 시작시 설정
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
async function saveRankingResult(keyword, product_code, rank, productInfo = null) {
  try {
    const payload = {
      keyword,
      productCode: product_code,
      rank,
      agentId: config.agentId,
      agentIP: config.agentIP,
      browser: config.browser
    };
    
    // 상품 정보가 있으면 추가
    if (productInfo) {
      payload.productName = productInfo.productName;
      payload.thumbnailUrl = productInfo.thumbnailUrl;
      payload.rating = productInfo.rating;
      payload.reviewCount = productInfo.reviewCount;
    }
    
    await apiClient.post('/result', payload);
    
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
      agentId: config.agentId,
      agentIP: config.agentIP,
      browser: config.browser
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
      timeout: 40000  // 첫 페이지는 40초 타임아웃 (브라우저 초기화 고려)
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
      const pageTitle = document.title || '';
      const isErrorPage = bodyText.includes('Secure Connection Failed') || 
                         bodyText.includes('NS_ERROR_NET_INTERRUPT') ||
                         bodyText.includes('The connection to') ||
                         bodyText.includes('was interrupted') ||
                         bodyText.includes('ERR_') ||
                         bodyText.includes('HTTP2_PROTOCOL_ERROR') ||
                         pageTitle.includes('Error') ||
                         pageTitle.includes('오류');
      
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
        // 네트워크 오류인지 확인
        const pageUrl = page.url();
        const pageTitle = await page.title().catch(() => '');
        
        if (pageUrl.includes('error') || pageTitle.includes('Error') || pageTitle.includes('오류')) {
          logger.error(`Network/page error for ${keyword} - URL: ${pageUrl}`);
          throw new Error(`Page error detected: ${pageTitle}`);
        }
        
        logger.warn(`Product list not found for: ${keyword} (실제로 상품이 없을 수 있음)`);
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
              
              // 상품 정보 추출
              const imgElement = product.querySelector('img');
              const productName = imgElement ? imgElement.getAttribute('alt') : 'Unknown';
              const thumbnailUrl = imgElement ? imgElement.getAttribute('src') : null;
              
              // 평점 추출
              let rating = null;
              let reviewCount = null;
              
              try {
                const ratingContainer = product.querySelector('[class*="ProductRating_productRating__"]');
                if (ratingContainer) {
                  const ratingSpan = ratingContainer.querySelector('[class*="ProductRating_rating__"]');
                  if (ratingSpan) {
                    const ratingText = ratingSpan.textContent.trim();
                    const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
                    if (ratingMatch) {
                      rating = parseFloat(ratingMatch[1]).toFixed(1);
                    }
                  }
                  
                  const reviewCountElement = ratingContainer.querySelector('[class*="ProductRating_ratingCount__"]');
                  if (reviewCountElement) {
                    const reviewText = reviewCountElement.textContent || reviewCountElement.innerText;
                    const reviewMatch = reviewText.match(/\(?\s*(\d+)\s*\)?/);
                    if (reviewMatch) {
                      reviewCount = parseInt(reviewMatch[1]);
                    }
                  }
                }
              } catch (e) {}
              
              return {
                rank: i + 1, // realRank (광고 제외)
                productName: productName,
                thumbnailUrl: thumbnailUrl,
                rating: rating,
                reviewCount: reviewCount
              };
            }
          }
        }
        
        return null;
      }, product_code);
      
      if (result) {
        foundRank = (currentPage - 1) * 72 + result.rank;
        // 상품 정보도 함께 반환하기 위해 result 객체 저장
        return {
          rank: foundRank,
          productName: result.productName,
          thumbnailUrl: result.thumbnailUrl,
          rating: result.rating,
          reviewCount: result.reviewCount
        };
      }
      
      currentPage++;
    }
    
    return foundRank; // 이미 위에서 상품 정보와 함께 리턴했으므로 여기는 null을 리턴하는 경우임
    
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
        timezoneId: 'Asia/Seoul',
        // 브라우저 컨텍스트 타임아웃도 증가
        navigationTimeout: 45000,
        actionTimeout: 30000
      });
      
      const page = await context.newPage();
      
      try {
        logger.info(`Checking: ${keyword} (${product_code})`);
        const result = await searchKeyword(page, keyword, product_code);
        
        // result가 객체인 경우 (상품 정보 포함) vs null/number인 경우 구분
        const rank = result && typeof result === 'object' ? result.rank : result;
        const productInfo = result && typeof result === 'object' ? result : null;
        
        await saveRankingResult(keyword, product_code, rank, productInfo);
        
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
  // IP 주소 가져오기
  config.agentIP = await getAgentIP();
  
  logger.info('=== V3 Keyword Ranking Batch Check (API Mode) ===');
  logger.info(`Hub API URL: ${config.hubApiUrl}`);
  logger.info(`Agent ID: ${config.agentId}`);
  logger.info(`Agent IP: ${config.agentIP}`);
  logger.info(`Browser: ${config.browser}`);
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
    
    // Launch browser (초기 실행 시간 고려)
    browser = await chromium.launch({
      headless: config.headless,
      args: [
        '--disable-blink-features=AutomationControlled'
      ],
      timeout: 60000 // 브라우저 초기 실행 60초 타임아웃
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