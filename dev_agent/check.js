// 모듈 import
const logger = require('./lib/logger');
const { getAgentIP, getScreenName, getAgentName } = require('./lib/system-info');
const { config, getConfig, incrementRunCount, closePgPool, getRunCount, getConfigFetchCount } = require('./lib/config');
const { getKeywordsFromAPI } = require('./lib/api-client');
const { processBatch, launchBrowser } = require('./lib/batch-processor');

// Main function
async function main() {
  incrementRunCount();
  
  // 에이전트 정보 수집
  config.agentIP = await getAgentIP();
  config.screenName = await getScreenName();
  config.agentName = await getAgentName();
  
  // DB에서 설정 가져오기
  await getConfig();
  
  // 설정 갱신 정보 로그
  if (getConfigFetchCount() === 0) {
    logger.info(`🔄 Config refreshed from DB (run ${getRunCount()})`);
  }
  
  let browser = null;
  const stats = { checked: 0, found: 0, failed: 0, notFound: 0 };
  
  try {
    // Get keywords from API
    const keywords = await getKeywordsFromAPI(config.maxKeywords);
    logger.info(`Got ${keywords.length} keywords`);
    logger.info(`Agent: ${config.agentName} | IP: ${config.agentIP} | Screen: ${config.screenName}`);
    
    if (keywords.length === 0) {
      logger.warn('No keywords to check');
      return;
    }
    
    // Launch browser
    browser = await launchBrowser();
    
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
main()
  .catch(error => {
    process.exit(1);
  })
  .finally(() => {
    // PostgreSQL 연결 정리
    setTimeout(() => {
      closePgPool();
    }, 100);
  });