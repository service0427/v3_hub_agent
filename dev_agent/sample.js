const { chromium, devices } = require('playwright');
const readline = require('readline');

async function main() {
  console.log('Chrome 브라우저를 실행합니다...');
  
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome', // 실제 Chrome 브라우저 사용
    args: ['--disable-blink-features=AutomationControlled']
  });

  // Chrome DevTools의 iPhone 12 Pro 설정과 동일
  const iPhone12Pro = devices['iPhone 12 Pro'];
  
  const context = await browser.newContext({
    ...iPhone12Pro,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul'
  });

  // navigator.webdriver 속성 제거
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined
    });
  });

  const page = await context.newPage();
  
  console.log('쿠팡 페이지로 이동합니다...');
  await page.goto('https://www.coupang.com/np/search?q=%EA%B0%A4%EB%9F%AD%EC%8B%9C+a32+%EC%BC%80%EC%9D%B4%EC%8A%A4&channel=auto');
  
  console.log('쿠팡 페이지가 열렸습니다.');
  console.log('종료하려면 Enter 키를 누르세요...');
  
  // Enter 키 입력 대기
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  await new Promise((resolve) => {
    rl.question('', () => {
      rl.close();
      resolve();
    });
  });
  
  console.log('브라우저를 종료합니다...');
  await browser.close();
  console.log('종료되었습니다.');
}

main().catch(console.error);