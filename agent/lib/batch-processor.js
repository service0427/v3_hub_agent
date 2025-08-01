const logger = require('./logger');
const { config } = require('./config');
const { searchKeyword } = require('./crawler');
const { saveRankingResult, logFailure, getCheckInfoFromAPI } = require('./api-client');
const { launchBrowser, getBrowserType } = require('./browser-config');

// Process batch
async function processBatch(browser, keywords, stats) {
  const results = await Promise.all(
    keywords.map(async ({ keyword, product_code }) => {
      const context = await browser.newContext();
      
      const page = await context.newPage();
      
      // 체크 정보를 try 블록 밖에서 선언
      let checkNum = 1;
      let idInfo = 'NEW';
      let startTime = Date.now(); // try 블록 밖으로 이동
      
      try {
        // 시작 시간 기록
        startTime = Date.now();
        
        // 현재 체크 정보 가져오기 (API 사용)
        const checkInfo = await getCheckInfoFromAPI(keyword, product_code);
        checkNum = checkInfo.nextCheckNumber;
        const todayCount = checkInfo.todayChecks;
        const dbId = checkInfo.id;
        
        idInfo = dbId ? `ID:${dbId}` : 'NEW';
        logger.info(`📋 [${idInfo}] [Check #${checkNum}/10] ${keyword} (${product_code}) - 오늘 ${todayCount}번째 체크`);
        
        const result = await searchKeyword(page, keyword, product_code);
        
        const rank = result && typeof result === 'object' ? result.rank : result;
        const productInfo = result && typeof result === 'object' ? result : null;
        
        await saveRankingResult(keyword, product_code, rank, productInfo);
        
        stats.checked++;
        
        // 처리 시간 계산
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
        
        if (rank) {
          stats.found++;
          logger.info(`✅ [${idInfo}] [Check #${checkNum}] Found at rank ${rank}: ${keyword} (평점: ${productInfo?.rating || 'N/A'}, 리뷰: ${productInfo?.reviewCount || 0}) ⏱️ ${elapsedTime}초`);
        } else {
          stats.notFound++;
          logger.info(`❌ [${idInfo}] [Check #${checkNum}] Not found: ${keyword} ⏱️ ${elapsedTime}초`);
        }
        
        return { success: true, keyword, rank, elapsedTime };
        
      } catch (error) {
        stats.failed++;
        
        // 처리 시간 계산 (실패 케이스에도 적용)
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
        
        // 에러 유형 세분화
        const errorMsg = error.message;
        let errorType = 'UNKNOWN_ERROR';
        
        // 차단 감지 - 실제 네트워크 차단만 포함
        const isBlocked = errorMsg.includes('ERR_HTTP2_PROTOCOL_ERROR') ||
                         errorMsg.includes('ERR_CONNECTION_CLOSED') ||
                         errorMsg.includes('NS_ERROR_NET_INTERRUPT') ||
                         errorMsg.includes('HTTP/2 Error: INTERNAL_ERROR') ||  // WebKit 차단
                         errorMsg.includes('net::ERR_FAILED') ||
                         errorMsg.includes('403 Forbidden') ||
                         errorMsg.includes('blocked') ||
                         errorMsg.includes('Bot Detection') ||
                         errorMsg.includes('Security Challenge');
        
        // 타임아웃 감지
        const isTimeout = errorMsg.includes('Timeout') || 
                         errorMsg.includes('timeout') ||
                         errorMsg.includes('TimeoutError') ||
                         errorMsg.includes('exceeded') ||
                         errorMsg.includes('waitForSelector') ||
                         errorMsg.includes('waitForFunction') ||
                         error.name === 'PAGE_NAVIGATION_TIMEOUT';
        
        // 네비게이션 오류 감지
        const isNavigationError = errorMsg.includes('Navigation') ||
                                 errorMsg.includes('goto') ||
                                 errorMsg.includes('net::') ||
                                 errorMsg.includes('Cannot navigate');
        
        // 네트워크 오류 감지
        const isNetworkError = errorMsg.includes('Network') ||
                              errorMsg.includes('net::') ||
                              errorMsg.includes('HTTP') ||
                              errorMsg.includes('getaddrinfo');
        
        if (isBlocked) {
          errorType = 'BLOCKED';
          logger.error(`🚫 [${idInfo}] [Check #${checkNum}] BLOCKED: ${keyword} - ${errorMsg} ⏱️ ${elapsedTime}초`);
        } else if (isTimeout) {
          errorType = 'TIMEOUT';
          logger.error(`⏱️ [${idInfo}] [Check #${checkNum}] TIMEOUT: ${keyword} - ${errorMsg} ⏱️ ${elapsedTime}초`);
        } else if (isNavigationError) {
          errorType = 'NAVIGATION_ERROR';
          logger.error(`🌐 [${idInfo}] [Check #${checkNum}] Navigation Error: ${keyword} - ${errorMsg} ⏱️ ${elapsedTime}초`);
        } else if (isNetworkError) {
          errorType = 'NETWORK_ERROR';
          logger.error(`🔌 [${idInfo}] [Check #${checkNum}] Network Error: ${keyword} - ${errorMsg} ⏱️ ${elapsedTime}초`);
        } else {
          errorType = 'SEARCH_ERROR';
          logger.error(`❗ [${idInfo}] [Check #${checkNum}] Search Error: ${keyword} - ${errorMsg} ⏱️ ${elapsedTime}초`);
        }
        
        // 에러 타입을 명시적으로 포함하여 전송
        await logFailure(keyword, product_code, `${errorType} - ${errorMsg}`);
        
        return { success: false, keyword, error: errorMsg, elapsedTime };
        
      } finally {
        // DB 설정에 따른 브라우저 닫기 지연
        if (config.browserCloseDelay > 0) {
          await page.waitForTimeout(config.browserCloseDelay);
        }
        await context.close();
      }
    })
  );
  
  return results;
}

// Launch browser wrapper
async function launchBrowserWrapper() {
  const browserType = getBrowserType(config);
  return await launchBrowser(browserType, {
    headless: config.headless
  });
}

module.exports = {
  processBatch,
  launchBrowser: launchBrowserWrapper
};