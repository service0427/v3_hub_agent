const puppeteer = require('puppeteer');

async function testPuppeteerFirefox() {
  console.log('🦊 Testing Puppeteer with Firefox...');
  
  try {
    const browser = await puppeteer.launch({
      product: 'firefox',
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });
    
    const page = await browser.newPage();
    
    // WebDriver 비활성화
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false
      });
    });
    
    console.log('📍 Navigating to Coupang...');
    await page.goto('https://www.coupang.com/np/search?q=무선이어폰', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    console.log('✅ Page loaded!');
    
    // 30초 대기
    console.log('⏸️  Waiting 30 seconds...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    await browser.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testPuppeteerFirefox();