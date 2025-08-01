// 브라우저별 설정 관리
const { chromium, firefox, webkit } = require('playwright');

// 브라우저별 설정
const browserConfigs = {
  chrome: {
    name: 'Chrome',
    launcher: chromium,
    launchOptions: {
      headless: false,
      channel: 'chrome',  // 시스템 Chrome 사용
      args: ['--disable-blink-features=AutomationControlled'],
      timeout: 60000
    }
  },
  
  firefox: {
    name: 'Firefox',
    launcher: firefox,
    launchOptions: {
      headless: false,
      firefoxUserPrefs: {
        'dom.webdriver.enabled': false
      },
      timeout: 60000
    }
  },
  
  webkit: {
    name: 'WebKit',
    launcher: webkit,
    launchOptions: {
      headless: false,
      timeout: 60000
    }
  }
};

// 브라우저 타입 가져오기 (환경변수 또는 config에서)
function getBrowserType(config) {
  // 환경변수 우선
  const envBrowser = process.env.BROWSER;
  if (envBrowser && browserConfigs[envBrowser]) {
    return envBrowser;
  }
  
  // config.browser 체크
  if (config.browser && browserConfigs[config.browser]) {
    return config.browser;
  }
  
  // 기본값
  return 'chrome';
}

// 브라우저 실행
async function launchBrowser(browserType = 'chrome', customOptions = {}) {
  const browserConfig = browserConfigs[browserType];
  
  if (!browserConfig) {
    throw new Error(`지원하지 않는 브라우저: ${browserType}`);
  }
  
  const options = {
    ...browserConfig.launchOptions,
    ...customOptions
  };
  
  console.log(`🌐 ${browserConfig.name} 브라우저 실행 중...`);
  console.log(`📁 브라우저 채널: ${options.channel || 'chromium'}`);
  
  return await browserConfig.launcher.launch(options);
}

module.exports = {
  browserConfigs,
  getBrowserType,
  launchBrowser
};