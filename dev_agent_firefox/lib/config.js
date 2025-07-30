require('dotenv').config();
const { Pool } = require('pg');

// Configuration (기본값, DB에서 덮어씀)
const config = {
  hubApiUrl: process.env.HUB_API_URL || 'http://localhost:3331',
  agentId: process.env.AGENT_ID || `agent-${Date.now()}`,
  browser: 'firefox',  // Firefox 전용
  maxKeywords: parseInt(process.argv[2] || '2'),
  maxPages: parseInt(process.env.BATCH_MAX_PAGES || '5'),
  // batchSize, delayBetweenBatches 제거됨 (병렬 처리 미구현)
  headless: false,
  // logLevel, apiTimeout 제거됨 (사용 안함)
  agentIP: null,
  screenName: null,
  agentName: null,
  browserCloseDelay: 1000  // 기본값 1초
};

// PostgreSQL pool for config
const pgPool = new Pool({
  host: 'mkt.techb.kr',
  port: 5432,
  database: 'productparser_db',
  user: 'techb_pp',
  password: 'Tech1324!',
  max: 2,
  idleTimeoutMillis: 30000
});

// 설정 캐시
let configCache = null;
let configFetchCount = 0;
let runCount = 0;

// DB에서 설정 가져오기
async function fetchConfigFromDB() {
  try {
    const query = 'SELECT config_key, config_value FROM v3_agent_config';
    const { rows } = await pgPool.query(query);
    
    const dbConfig = {};
    rows.forEach(row => {
      dbConfig[row.config_key] = row.config_value;
    });
    
    // 설정 적용
    if (dbConfig.hub_api_url) config.hubApiUrl = dbConfig.hub_api_url;
    // browser 설정 제거 - 항상 firefox 사용
    if (dbConfig.max_pages) config.maxPages = parseInt(dbConfig.max_pages);
    // batch_size, batch_delay, log_level, api_timeout 제거됨 (사용 안함)
    // headless는 항상 false로 하드코딩됨
    if (dbConfig.browser_close_delay) config.browserCloseDelay = parseInt(dbConfig.browser_close_delay);
    
    configCache = dbConfig;
    configFetchCount = 0;
    
    console.log('✅ Config loaded from DB');
    return dbConfig;
  } catch (error) {
    console.error('❌ Failed to load config from DB:', error.message);
    return configCache || {};
  }
}

// 설정 가져오기 (캐시 활용)
async function getConfig() {
  const refreshInterval = configCache?.config_refresh_interval || 10;
  
  // 설정 갱신 주기마다 DB에서 다시 가져오기
  if (!configCache || configFetchCount >= refreshInterval) {
    return await fetchConfigFromDB();
  }
  
  configFetchCount++;
  return configCache;
}

// 실행 횟수 증가
function incrementRunCount() {
  runCount++;
  return runCount;
}

// PostgreSQL pool 종료
async function closePgPool() {
  await pgPool.end();
}

module.exports = {
  config,
  pgPool,
  fetchConfigFromDB,
  getConfig,
  incrementRunCount,
  closePgPool,
  getRunCount: () => runCount,
  getConfigFetchCount: () => configFetchCount
};