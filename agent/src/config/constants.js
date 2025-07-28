module.exports = {
  // Timeouts
  PAGE_LOAD_TIMEOUT: 30000,
  SEARCH_TIMEOUT: 10000,
  ELEMENT_TIMEOUT: 5000,
  
  // Coupang specific
  COUPANG_PAGE_SIZE: 72,
  COUPANG_MAX_PAGES: 10,
  
  // Network
  BLOCKING_ERRORS: [
    'net::ERR_BLOCKED_BY_CLIENT',
    'net::ERR_FAILED',
    'net::ERR_HTTP2_PROTOCOL_ERROR',
    'net::ERR_CONNECTION_REFUSED',
    'net::ERR_CONNECTION_RESET'
  ],
  
  // User agents
  USER_AGENTS: {
    chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
  }
};