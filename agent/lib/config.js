// dotenv는 선택사항 - .env 파일이 있으면 사용
try {
  require('dotenv').config();
} catch (e) {
  // .env 파일이 없어도 정상 작동
}
const { Pool } = require('pg');
const { getUniqueAgentId } = require('./system-info');

// 초기 에이전트 ID (나중에 시스템 정보로 업데이트)
let initialAgentId = `agent-${Date.now()}`;

// Configuration (기본값, DB에서 덮어씀)
const config = {
  hubApiUrl: process.env.HUB_API_URL || 'http://u24.techb.kr:3331',
  agentId: initialAgentId,
  browser: process.env.BROWSER || 'chrome',  // 기본값 chrome, 환경변수로 변경 가능
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
    
    // 브라우저 설정: 환경변수가 최우선
    if (process.env.BROWSER) {
      config.browser = process.env.BROWSER;
    } else if (dbConfig.browser) {
      config.browser = dbConfig.browser;
    }
    // else: config.browser는 초기값 유지 (chrome)
    
    if (dbConfig.max_pages) config.maxPages = parseInt(dbConfig.max_pages);
    // batch_size, batch_delay, log_level, api_timeout 제거됨 (사용 안함)
    // headless는 항상 false로 하드코딩됨
    if (dbConfig.browser_close_delay) config.browserCloseDelay = parseInt(dbConfig.browser_close_delay);
    
    configCache = dbConfig;
    configFetchCount = 0;
    
    console.log('✅ Config loaded from DB');
    console.log(`📡 Hub API URL: ${config.hubApiUrl}`);
    console.log(`🌐 Browser: ${config.browser} (env: ${process.env.BROWSER}, DB: ${dbConfig.browser || 'not set'})`);
    console.log(`🔄 Config refresh count reset to 0`);
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