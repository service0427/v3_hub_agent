const axios = require('axios');
const logger = require('./logger');
const { config } = require('./config');

// Axios 인스턴스 생성
const apiClient = axios.create({
  baseURL: `${config.hubApiUrl}/api/v3/internal/batch`,
  timeout: 20000,
  headers: {
    'User-Agent': 'V3-Agent/1.0',
    'Content-Type': 'application/json'
  }
});

// Get keywords from API
async function getKeywordsFromAPI(limit) {
  try {
    const response = await apiClient.get('/keywords', {
      params: {
        limit,
        agentId: config.agentId,
        agentName: config.agentName,
        screenName: config.screenName,
        agentIP: config.agentIP
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
    const response = await apiClient.post('/result', {
      keyword,
      productCode,
      rank: rank || 0,
      agentId: config.agentId,
      agentName: config.agentName,
      screenName: config.screenName,
      agentIP: config.agentIP,
      browser: 'chrome',  // 항상 chrome
      productName: productInfo?.productName || null,
      thumbnailUrl: productInfo?.thumbnailUrl || null,
      rating: productInfo?.rating || null,
      reviewCount: productInfo?.reviewCount || null
    });
    
    if (response.data?.checkNumber) {
      logger.debug(`💾 저장 완료: Check #${response.data.checkNumber} for ${keyword}`);
    }
    
    return response.data;
  } catch (error) {
    const errorDetail = error.response?.data?.message || error.message;
    logger.error(`❌ 저장 실패: ${keyword} - ${errorDetail}`);
    return false;
  }
}

// Log failure
async function logFailure(keyword, productCode, error) {
  try {
    await apiClient.post('/failure', {
      keyword,
      productCode,
      agentId: config.agentId,
      agentName: config.agentName,
      screenName: config.screenName,
      agentIP: config.agentIP,
      browser: 'chrome',  // 항상 chrome
      error: error
    });
  } catch (err) {
    logger.error(`Log failure error: ${err.message}`);
  }
}

// Get check info from API
async function getCheckInfoFromAPI(keyword, productCode) {
  try {
    const response = await apiClient.get('/check-info', {
      params: {
        keyword,
        productCode,
        agentId: config.agentId
      }
    });
    
    return response.data.checkInfo || {
      id: null,
      nextCheckNumber: 1,
      todayChecks: 0,
      previousChecks: []
    };
  } catch (error) {
    logger.error(`Failed to get check info: ${error.message}`);
    return {
      id: null,
      nextCheckNumber: 1,
      todayChecks: 0,
      previousChecks: []
    };
  }
}

module.exports = {
  apiClient,
  getKeywordsFromAPI,
  saveRankingResult,
  logFailure,
  getCheckInfoFromAPI
};