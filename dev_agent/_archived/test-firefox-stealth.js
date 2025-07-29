// Firefox Stealth 모드 - Playwright 기반 고급 우회
const { firefox } = require('playwright');

async function testFirefoxStealth() {
  console.log('🦊 Testing Firefox with Stealth mode...');
  
  const browser = await firefox.launch({
    headless: false,
    // Firefox를 일반 브라우저처럼 보이게 하는 설정
    firefoxUserPrefs: {
      // 기본 설정
      'dom.webdriver.enabled': false,
      'media.navigator.enabled': false,
      'media.peerconnection.enabled': false,
      
      // 핑거프린팅 방지
      'privacy.resistFingerprinting': false, // true면 오히려 감지됨
      'privacy.trackingprotection.fingerprinting.enabled': false,
      'privacy.trackingprotection.cryptomining.enabled': false,
      'privacy.trackingprotection.enabled': false,
      
      // 권한 관련
      'permissions.default.camera': 2,
      'permissions.default.desktop-notification': 2,
      'permissions.default.geo': 2,
      'permissions.default.microphone': 2,
      
      // 자동화 흔적 제거
      'browser.safebrowsing.enabled': false,
      'browser.safebrowsing.malware.enabled': false,
      'dom.automation.enabled': false,
      'extensions.screenshots.disabled': true,
      
      // 네트워크 설정
      'network.http.sendRefererHeader': 2,
      'network.http.sendSecureXSiteReferrer': true,
      'network.IDN_show_punycode': false,
      
      // WebGL 및 Canvas
      'webgl.disabled': false,
      'webgl.vendor': 'Intel Inc.',
      'webgl.renderer': 'Intel Iris OpenGL Engine',
      
      // Battery API
      'dom.battery.enabled': false,
      
      // 기타
      'toolkit.startup.max_resumed_crashes': -1,
      'browser.sessionstore.max_resumed_crashes': -1,
      'services.sync.prefs.sync.network.cookie.cookieBehavior': false,
      'dom.push.enabled': false,
      'intl.accept_languages': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
    }
  });
  
  const context = await browser.newContext({
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    // 화면 크기를 일반적인 크기로
    viewport: { width: 1920, height: 1080 },
    screen: { width: 1920, height: 1080 },
    // 권한 설정
    permissions: [],
    // 일반 브라우저처럼 보이는 User-Agent (기본값 사용)
  });
  
  const page = await context.newPage();
  
  // 고급 JavaScript 주입
  await page.addInitScript(() => {
    // WebDriver 숨기기
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined
    });
    
    // Chrome 객체 추가 (Firefox인데 Chrome 객체가 있으면 의심받을 수 있으니 주의)
    // window.chrome = { runtime: {} };
    
    // 플러그인 위장
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5]
    });
    
    // 언어 설정
    Object.defineProperty(navigator, 'language', {
      get: () => 'ko-KR'
    });
    
    Object.defineProperty(navigator, 'languages', {
      get: () => ['ko-KR', 'ko', 'en-US', 'en']
    });
    
    // 하드웨어 동시성
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 8
    });
    
    // 플랫폼
    Object.defineProperty(navigator, 'platform', {
      get: () => 'Win32'
    });
  });
  
  try {
    console.log('📍 Navigating to Coupang...');
    await page.goto('https://www.coupang.com/np/search?q=무선이어폰', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    console.log('✅ Page loaded!');
    
    // WebDriver 체크
    const checks = await page.evaluate(() => {
      return {
        webdriver: navigator.webdriver,
        userAgent: navigator.userAgent,
        plugins: navigator.plugins.length,
        languages: navigator.languages
      };
    });
    console.log('Browser checks:', checks);
    
    // 30초 대기
    console.log('⏸️  Waiting 30 seconds...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

testFirefoxStealth();