require('dotenv').config();
const { firefox } = require('playwright');
const winston = require('winston');
const path = require('path');

// Configuration
const config = {
  agentId: process.env.AGENT_ID || 'nightly-test',
  testKeywords: [
    '무선이어폰',
    '노트북',
    '스마트워치',
    '블루투스스피커',
    '휴대용충전기'
  ],
  testProductCodes: [
    '123456789',
    '987654321', 
    '555666777',
    '111222333',
    '999888777'
  ],
  headless: false, // GUI 모드 필수
  logLevel: 'info',
  maxPages: 3,
  delayBetweenRequests: 3000 // 3초 대기
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
      filename: `logs/nightly-test-${new Date().toISOString().split('T')[0]}.log` 
    })
  ]
});

// Firefox Nightly 검색 테스트
async function testSearch(page, keyword, productCode) {
  try {
    logger.info(`🔍 Testing search: ${keyword} (${productCode})`);
    
    const searchUrl = `https://www.coupang.com/np/search?q=${encodeURIComponent(keyword)}&channel=user&failRedirectApp=true&page=1&listSize=72`;
    
    logger.info(`📍 Navigating to: ${searchUrl}`);
    
    // 페이지 이동 (30초 타임아웃)
    await page.goto(searchUrl, { 
      timeout: 30000,
      waitUntil: 'domcontentloaded' 
    });
    
    await page.waitForTimeout(2000); // 페이지 안정화 대기
    
    // 차단 페이지 체크
    const isBlocked = await checkIfBlocked(page);
    if (isBlocked.blocked) {
      logger.error(`❌ BLOCKED: ${isBlocked.reason}`);
      return { success: false, blocked: true, reason: isBlocked.reason };
    }
    
    // 검색 결과 확인
    const searchResults = await analyzeSearchResults(page, keyword, productCode);
    
    return {
      success: true,
      blocked: false,
      keyword,
      productCode,
      ...searchResults
    };
    
  } catch (error) {
    logger.error(`❌ Search failed: ${error.message}`);
    return { 
      success: false, 
      blocked: false, 
      error: error.message,
      keyword,
      productCode 
    };
  }
}

// 차단 여부 확인
async function checkIfBlocked(page) {
  try {
    const url = page.url();
    const title = await page.title();
    
    // URL 기반 차단 감지
    if (url.includes('error') || url.includes('blocked') || url.includes('captcha')) {
      return { blocked: true, reason: `Blocked URL detected: ${url}` };
    }
    
    // 제목 기반 차단 감지
    if (title.includes('Error') || title.includes('차단') || title.includes('접근이 거부')) {
      return { blocked: true, reason: `Blocked title detected: ${title}` };
    }
    
    // 페이지 내용 기반 차단 감지
    const pageText = await page.evaluate(() => {
      return document.body ? document.body.innerText.substring(0, 500) : '';
    });
    
    if (pageText.includes('접근이 차단') || 
        pageText.includes('보안 문자') || 
        pageText.includes('captcha') ||
        pageText.includes('일시적으로 이용할 수 없습니다')) {
      return { blocked: true, reason: 'Blocked content detected in page' };
    }
    
    return { blocked: false };
    
  } catch (error) {
    logger.warn(`Blockage check failed: ${error.message}`);
    return { blocked: false };
  }
}

// 검색 결과 분석
async function analyzeSearchResults(page, keyword, productCode) {
  try {
    // 검색 결과 없음 체크
    const noResult = await page.evaluate(() => {
      const noResultElement = document.querySelector('[class^=no-result_magnifier]');
      const noResultText = document.body?.innerText?.includes('에 대한 검색결과가 없습니다');
      return !!(noResultElement || noResultText);
    });
    
    if (noResult) {
      logger.warn(`⚠️  No search results for: ${keyword}`);
      return { hasResults: false, productCount: 0 };
    }
    
    // 상품 목록 확인
    await page.waitForSelector('#product-list > li[data-id]', { timeout: 8000 });
    
    const products = await page.$$('#product-list > li[data-id]');
    const productCount = products.length;
    
    logger.info(`📊 Found ${productCount} products`);
    
    // 목표 상품 찾기 (간단한 예시)
    let foundRank = null;
    for (let i = 0; i < Math.min(products.length, 50); i++) {
      const product = products[i];
      const productUrl = await product.evaluate(el => {
        const link = el.querySelector('a[href*="/vp/products/"]');
        return link ? link.href : null;
      });
      
      if (productUrl && productUrl.includes(productCode)) {
        foundRank = i + 1;
        logger.info(`🎯 Found target product at rank ${foundRank}`);
        break;
      }
    }
    
    return {
      hasResults: true,
      productCount,
      foundRank,
      searched: true
    };
    
  } catch (error) {
    logger.warn(`Search analysis failed: ${error.message}`);
    return { hasResults: false, productCount: 0, error: error.message };
  }
}

// 메인 테스트 함수
async function runNightlyTest() {
  logger.info('🚀 === Firefox Nightly Test Started ===');
  logger.info(`Agent ID: ${config.agentId}`);
  logger.info(`Test Keywords: ${config.testKeywords.length}`);
  
  let browser = null;
  const results = [];
  
  try {
    // Firefox 실행 (Nightly 버전 포함)
    logger.info('🔥 Launching Firefox...');
    browser = await firefox.launch({
      headless: config.headless,
      // channel 옵션 제거 - Playwright가 시스템의 Firefox 사용
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage'
      ]
    });
    
    logger.info('✅ Firefox launched successfully');
    
    // 테스트 실행
    for (let i = 0; i < config.testKeywords.length; i++) {
      const keyword = config.testKeywords[i];
      const productCode = config.testProductCodes[i];
      
      logger.info(`\n--- Test ${i + 1}/${config.testKeywords.length} ---`);
      
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0'
      });
      
      const page = await context.newPage();
      
      try {
        const result = await testSearch(page, keyword, productCode);
        results.push(result);
        
        if (result.success) {
          logger.info(`✅ Success: ${keyword} - ${result.productCount} products`);
          if (result.foundRank) {
            logger.info(`🎯 Target found at rank: ${result.foundRank}`);
          }
        } else if (result.blocked) {
          logger.error(`🚫 Blocked: ${keyword} - ${result.reason}`);
        } else {
          logger.error(`❌ Failed: ${keyword} - ${result.error}`);
        }
        
      } catch (error) {
        logger.error(`💥 Test error: ${error.message}`);
        results.push({ 
          success: false, 
          keyword, 
          productCode, 
          error: error.message 
        });
      } finally {
        await context.close();
        
        // 요청 간 대기
        if (i < config.testKeywords.length - 1) {
          logger.info(`⏱️  Waiting ${config.delayBetweenRequests}ms...`);
          await new Promise(resolve => setTimeout(resolve, config.delayBetweenRequests));
        }
      }
    }
    
  } catch (error) {
    logger.error(`💥 Test failed: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
      logger.info('🔥 Firefox closed');
    }
  }
  
  // 결과 요약
  const summary = {
    total: results.length,
    success: results.filter(r => r.success).length,
    blocked: results.filter(r => r.blocked).length,
    failed: results.filter(r => !r.success && !r.blocked).length,
    foundProducts: results.filter(r => r.foundRank).length
  };
  
  logger.info('\n🎯 === Test Summary ===');
  logger.info(`Total Tests: ${summary.total}`);
  logger.info(`✅ Success: ${summary.success}`);
  logger.info(`🚫 Blocked: ${summary.blocked}`);
  logger.info(`❌ Failed: ${summary.failed}`);
  logger.info(`🎯 Products Found: ${summary.foundProducts}`);
  
  if (summary.blocked > 0) {
    logger.warn('\n⚠️  BLOCKING DETECTED - Need to implement countermeasures');
  } else {
    logger.info('\n🎉 NO BLOCKING - Firefox working well!');
  }
  
  logger.info('🏁 === Firefox Test Completed ===');
}

// 로그 디렉토리 생성
async function ensureLogDirectory() {
  try {
    const fs = require('fs').promises;
    await fs.mkdir('logs', { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
}

// 실행
ensureLogDirectory().then(() => {
  runNightlyTest().catch(error => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });
});