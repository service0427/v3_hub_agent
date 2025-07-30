require('dotenv').config();
const { firefox } = require('playwright');
const winston = require('winston');
const path = require('path');
const readline = require('readline');

// Configuration
const config = {
  agentId: process.env.AGENT_ID || 'nightly-test',
  testKeywords: [
    '무선이어폰'
  ],
  testProductCodes: [
    '123456789'
  ],
  headless: false, // Linux 서버환경에서는 headless 필수
  logLevel: 'info',
  maxPages: 3,
  delayBetweenRequests: 1000, // 1초 대기 (빠른 테스트)
  exitOnBlock: true // 차단 감지시 즉시 종료
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

// 사용자 입력 대기 함수
async function waitForUserInput(message = "Press Enter to close or wait 30 seconds...") {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    logger.info(`\n⏸️  ${message}`);
    
    // 30초 타이머
    const timer = setTimeout(() => {
      logger.info('⏱️  30 seconds elapsed, closing automatically...');
      rl.close();
      resolve();
    }, 30000);

    // Enter 키 입력 대기
    rl.on('line', () => {
      clearTimeout(timer);
      rl.close();
      resolve();
    });

    // Ctrl+C 처리
    process.on('SIGINT', () => {
      clearTimeout(timer);
      rl.close();
      resolve();
    });
  });
}

// Firefox Nightly 검색 테스트
async function testSearch(page, keyword, productCode) {
  try {
    logger.info(`🔍 Testing search: ${keyword} (${productCode})`);
    
    // 네트워크 에러 감지 리스너 (주요 문서 요청만 감지)
    let mainRequestFailed = false;
    page.on('requestfailed', request => {
      // NS_BINDING_ABORTED는 리소스 취소로 무시
      const failure = request.failure();
      if (failure && 
          !failure.errorText.includes('NS_BINDING_ABORTED') && 
          request.resourceType() === 'document') {
        if (!mainRequestFailed) { // 중복 방지
          mainRequestFailed = true;
          logger.error(`🚨 NETWORK ERROR DETECTED: ${failure.errorText}`);
          logger.error(`🛑 BLOCKING DETECTED - Waiting for user input...`);
          waitForUserInput("Network error detected. Press Enter to close or wait 30 seconds...").then(() => {
            process.exit(1);
          });
        }
      }
    });
    
    // 응답 에러 감지 리스너 (주요 문서만)
    let mainResponseFailed = false;
    page.on('response', response => {
      if (response.status() >= 400 && 
          response.request().resourceType() === 'document') {
        if (!mainResponseFailed) { // 중복 방지
          mainResponseFailed = true;
          logger.error(`🚨 HTTP ERROR DETECTED: ${response.status()} ${response.statusText()}`);
          logger.error(`🛑 BLOCKING DETECTED - Waiting for user input...`);
          waitForUserInput("HTTP error detected. Press Enter to close or wait 30 seconds...").then(() => {
            process.exit(1);
          });
        }
      }
    });
    
    const searchUrl = `https://www.coupang.com/np/search?q=${encodeURIComponent(keyword)}&channel=user&failRedirectApp=true&page=1&listSize=72`;
    
    logger.info(`📍 Navigating to: ${searchUrl}`);
    
    // 검색 페이지로 이동
    logger.info('🔍 Now navigating to search page...');
    await page.goto(searchUrl, { 
      timeout: 30000,
      waitUntil: 'domcontentloaded' 
    });
    
    // 즉시 차단 체크 (대기 시간 최소화)
    await page.waitForTimeout(500); // 500ms만 대기
    
    // 1차 빠른 차단 체크
    const quickBlock = await quickBlockCheck(page);
    if (quickBlock.blocked) {
      logger.error(`🚨 QUICK BLOCK DETECTED: ${quickBlock.reason}`);
      logger.error(`🛑 BLOCKING DETECTED - Waiting for user input...`);
      await waitForUserInput("Quick block detected. Press Enter to close or wait 30 seconds...");
      process.exit(1);
    }
    
    // 2차 상세 차단 체크
    const isBlocked = await checkIfBlocked(page);
    if (isBlocked.blocked) {
      logger.error(`❌ BLOCKED: ${isBlocked.reason}`);
      logger.error(`🛑 BLOCKING DETECTED - Waiting for user input...`);
      await waitForUserInput("Blocking detected. Press Enter to close or wait 30 seconds...");
      process.exit(1);
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
    
    // 모든 타임아웃, 연결 오류, 셀렉터 대기 실패를 차단 신호로 간주
    const blockingKeywords = [
      'timeout', 'Timeout', 'TIMEOUT',
      'net::', 'Navigation', 'navigation',
      'waitForSelector', 'waiting for selector',
      'connection', 'Connection', 'CONNECTION',
      'refused', 'Refused', 'REFUSED',
      'failed', 'Failed', 'FAILED'
    ];
    
    const isBlockingError = blockingKeywords.some(keyword => 
      error.message.includes(keyword)
    );
    
    if (isBlockingError) {
      logger.error(`🚨 BLOCKING ERROR DETECTED: ${error.message}`);
      logger.error(`🛑 BLOCKING DETECTED - Waiting for user input...`);
      await waitForUserInput("Blocking error detected. Press Enter to close or wait 30 seconds...");
      process.exit(1);
    }
    
    return { 
      success: false, 
      blocked: false, 
      error: error.message,
      keyword,
      productCode 
    };
  }
}

// 빠른 차단 감지 (즉시 종료용)
async function quickBlockCheck(page) {
  try {
    const url = page.url();
    
    // 즉시 확인 가능한 차단 신호들
    const blockSignals = [
      'error', 'blocked', 'captcha', 'forbidden', 'denied',
      'security', '차단', '접근', '거부', '보안'
    ];
    
    // URL에서 차단 신호 확인
    for (const signal of blockSignals) {
      if (url.toLowerCase().includes(signal)) {
        return { blocked: true, reason: `Blocked URL signal: ${signal} in ${url}` };
      }
    }
    
    // 페이지 제목 빠른 체크
    try {
      const title = await page.title();
      for (const signal of blockSignals) {
        if (title.toLowerCase().includes(signal)) {
          return { blocked: true, reason: `Blocked title signal: ${signal} in ${title}` };
        }
      }
    } catch (e) {
      // 제목 가져오기 실패도 차단 신호일 수 있음
      return { blocked: true, reason: 'Cannot get page title - possible block' };
    }
    
    // 페이지 상태 코드 확인
    try {
      const response = await page.evaluate(() => {
        return {
          readyState: document.readyState,
          hasBody: !!document.body,
          bodyText: document.body ? document.body.innerText.substring(0, 200) : ''
        };
      });
      
      if (!response.hasBody) {
        return { blocked: true, reason: 'No page body - possible block' };
      }
      
      const text = response.bodyText.toLowerCase();
      for (const signal of blockSignals) {
        if (text.includes(signal)) {
          return { blocked: true, reason: `Blocked content signal: ${signal}` };
        }
      }
    } catch (e) {
      return { blocked: true, reason: 'Cannot evaluate page - possible block' };
    }
    
    return { blocked: false };
    
  } catch (error) {
    return { blocked: true, reason: `Quick check failed: ${error.message}` };
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
    
    // 상품 목록 확인 - 타임아웃시 차단으로 간주 (30초 대기)
    try {
      await page.waitForSelector('#product-list > li[data-id]', { timeout: 30000 });
    } catch (waitError) {
      if (waitError.message.includes('Timeout') || waitError.message.includes('timeout')) {
        logger.error(`🚨 SELECTOR TIMEOUT - POSSIBLE BLOCK: ${waitError.message}`);
        logger.error(`🛑 BLOCKING DETECTED - Waiting for user input...`);
        await waitForUserInput("Selector timeout detected. Press Enter to close or wait 30 seconds...");
        process.exit(1);
      }
      throw waitError; // 다른 에러는 재던지기
    }
    
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
  logger.info('🚀 === Firefox Test Started ===');
  logger.info(`Agent ID: ${config.agentId}`);
  logger.info(`Test Keywords: ${config.testKeywords.length}`);
  
  let browser = null;
  const results = [];
  
  try {
    // Firefox 실행 옵션 선택
    const firefoxOption = process.env.FIREFOX_OPTION || 'playwright'; // playwright, profile, cdp
    
    if (firefoxOption === 'profile') {
      // 실제 Firefox 프로필 사용
      logger.info('🔥 Launching Firefox with real user profile...');
      const profilePath = '/home/tech/.mozilla/firefox/29xo4urx.default-default-1';
      browser = await firefox.launchPersistentContext(profilePath, {
        headless: config.headless,
        firefoxUserPrefs: {
          'dom.webdriver.enabled': false
        }
      });
    } else if (firefoxOption === 'cdp') {
      // CDP (Chrome DevTools Protocol) 모드로 연결
      logger.info('🔥 Launching Firefox with CDP...');
      browser = await firefox.launch({
        headless: config.headless,
        args: ['--remote-debugging-port=9222'],
        firefoxUserPrefs: {
          'dom.webdriver.enabled': false
        }
      });
    } else {
      // 기본 Playwright Firefox
      logger.info('🔥 Launching Firefox (Playwright bundle)...');
      browser = await firefox.launch({
        headless: config.headless,
        firefoxUserPrefs: {
          'dom.webdriver.enabled': false,
          'marionette.enabled': false
        }
      });
    }
    
    logger.info('✅ Firefox launched successfully');
    
    // 테스트 실행
    for (let i = 0; i < config.testKeywords.length; i++) {
      const keyword = config.testKeywords[i];
      const productCode = config.testProductCodes[i];
      
      logger.info(`\n--- Test ${i + 1}/${config.testKeywords.length} ---`);
      
      let context, page;
      
      if (process.env.FIREFOX_OPTION === 'profile') {
        // launchPersistentContext는 이미 context를 반환
        context = browser;
        page = await context.newPage();
      } else {
        // 일반적인 경우
        context = await browser.newContext({
          locale: 'ko-KR',
          timezoneId: 'Asia/Seoul'
        });
        page = await context.newPage();
      }
      
      // navigator.webdriver를 false로 덮어쓰기
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
          configurable: true
        });
      });
      
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
    
    // 브라우저 실행 실패도 차단 가능성
    if (error.message.includes('launch') || 
        error.message.includes('connect') ||
        error.message.includes('browser')) {
      logger.error(`🚨 BROWSER LAUNCH FAILED - POSSIBLE SYSTEM BLOCK`);
      logger.error(`🛑 ERROR DETECTED - Waiting for user input...`);
      await waitForUserInput("Browser launch failed. Press Enter to close or wait 30 seconds...");
      process.exit(1);
    }
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