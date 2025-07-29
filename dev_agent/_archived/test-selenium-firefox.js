const { Builder, By, until } = require('selenium-webdriver');
const firefox = require('selenium-webdriver/firefox');

async function testSeleniumFirefox() {
  console.log('🦊 Testing Selenium with Firefox...');
  
  // Firefox 옵션 설정
  const options = new firefox.Options();
  options.addArguments('--width=1920');
  options.addArguments('--height=1080');
  
  // WebDriver 감지 비활성화를 위한 프로필 설정
  options.setPreference('dom.webdriver.enabled', false);
  options.setPreference('useAutomationExtension', false);
  
  const driver = await new Builder()
    .forBrowser('firefox')
    .setFirefoxOptions(options)
    .build();
  
  try {
    console.log('📍 Navigating to Coupang...');
    await driver.get('https://www.coupang.com/np/search?q=무선이어폰');
    
    // WebDriver 속성 확인
    const webdriverCheck = await driver.executeScript('return navigator.webdriver');
    console.log('WebDriver detected:', webdriverCheck);
    
    console.log('✅ Page loaded!');
    
    // 30초 대기
    console.log('⏸️  Waiting 30 seconds...');
    await driver.sleep(30000);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await driver.quit();
  }
}

testSeleniumFirefox();