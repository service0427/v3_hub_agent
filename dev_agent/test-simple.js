const { firefox } = require('playwright');

(async () => {
  console.log('Firefox 쿠팡 테스트 - 간단 버전\n');
  
  const browser = await firefox.launch({ 
    headless: false,
    firefoxUserPrefs: {
      'dom.webdriver.enabled': false
    }
  });
  
  const page = await browser.newPage();
  
  console.log('검색 페이지로 이동 중...');
  
  // 검색 페이지로 이동
  await page.goto('https://www.coupang.com/np/search?q=식혜', {
    waitUntil: 'load',
    timeout: 60000
  });
  
  await page.waitForTimeout(5000);
  
  // 현재 상태 확인
  const pageInfo = await page.evaluate(() => {
    return {
      title: document.title,
      url: window.location.href,
      hasProductList: !!document.querySelector('#product-list'),
      productCount: document.querySelectorAll('#product-list li').length
    };
  });
  
  console.log('\n페이지 정보:');
  console.log('- 제목:', pageInfo.title);
  console.log('- URL:', pageInfo.url);
  console.log('- 상품 목록:', pageInfo.hasProductList ? '있음' : '없음');
  console.log('- 상품 개수:', pageInfo.productCount);
  
  console.log('\n브라우저를 수동으로 닫아주세요.');
  console.log('또는 Ctrl+C를 눌러 종료하세요.');
  
  // 무한 대기 (사용자가 브라우저를 닫거나 Ctrl+C를 누를 때까지)
  await new Promise(() => {});
})();