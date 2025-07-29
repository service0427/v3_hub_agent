const { chromium, firefox } = require('playwright');
const logger = require('./logger');
const { config } = require('./config');
const { searchKeyword } = require('./crawler');
const { saveRankingResult, logFailure, getCheckInfoFromAPI } = require('./api-client');

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
        
        // 차단 감지
        const errorMsg = error.message;
        const isBlocked = errorMsg.includes('ERR_HTTP2_PROTOCOL_ERROR') ||
                         errorMsg.includes('net::ERR_') ||
                         errorMsg.includes('Timeout') ||
                         errorMsg.includes('timeout') ||
                         errorMsg.includes('blocked') ||
                         errorMsg.includes('403');
        
        if (isBlocked) {
          logger.error(`🚫 [${idInfo}] [Check #${checkNum}] BLOCKED: ${keyword} - ${errorMsg} ⏱️ ${elapsedTime}초`);
          await logFailure(keyword, product_code, `BLOCKED - ${errorMsg}`);
        } else {
          logger.error(`❗ [${idInfo}] [Check #${checkNum}] Failed: ${keyword} - ${errorMsg} ⏱️ ${elapsedTime}초`);
          await logFailure(keyword, product_code, errorMsg);
        }
        
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

// Launch browser
async function launchBrowser() {
  if (config.browser === 'firefox') {
    return await firefox.launch({
      headless: config.headless
    });
  } else {
    return await chromium.launch({
      headless: config.headless,
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled'],
      timeout: 60000
    });
  }
}

module.exports = {
  processBatch,
  launchBrowser
};