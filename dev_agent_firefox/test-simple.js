const { firefox } = require('playwright');

(async () => {
  console.log('Firefox 쿠팡 테스트 - 안정적인 클릭 페이지네이션\n');
  
  const browser = await firefox.launch({ 
    headless: false,
    firefoxUserPrefs: {
      'dom.webdriver.enabled': false
    }
  });
  
  const page = await browser.newPage();
  
  console.log('검색 페이지로 이동 중...');
  
  // 검색 페이지로 이동
  await page.goto('https://www.coupang.com/np/search?q=%EC%8B%9D%ED%98%9C&listSize=72&page=1', {
    waitUntil: 'load',
    timeout: 60000
  });
  
  await page.waitForTimeout(5000);
  
  // 5페이지까지 클릭으로 이동
  for (let pageNum = 1; pageNum <= 5; pageNum++) {
    console.log(`\n=== ${pageNum}페이지 ===`);
    
    // 차단 여부 확인
    const isBlocked = await page.evaluate(() => {
      const bodyText = document.body?.innerText || '';
      const title = document.title || '';
      
      return bodyText.includes('Secure Connection Failed') ||
             bodyText.includes('NS_ERROR') ||
             bodyText.includes('ERR_') ||
             bodyText.includes('HTTP2_PROTOCOL_ERROR') ||
             title.includes('Error') ||
             title.includes('오류');
    });
    
    if (isBlocked) {
      console.error(`❌ ${pageNum}페이지에서 차단됨`);
      break;
    }
    
    // 현재 페이지 정보 확인
    await page.waitForSelector('#product-list', { timeout: 10000 });
    const pageInfo = await page.evaluate(() => {
      return {
        productCount: document.querySelectorAll('#product-list li[data-id]').length,
        currentPage: new URLSearchParams(window.location.search).get('page') || '1'
      };
    });
    
    console.log(`✅ ${pageNum}페이지 로드 성공`);
    console.log(`- 상품 개수: ${pageInfo.productCount}개`);
    console.log(`- URL 페이지: ${pageInfo.currentPage}`);
    
    // 현재 페이지네이션 상태 확인
    const paginationState = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('a[data-page]'));
      const pageNumbers = buttons
        .filter(btn => !['prev', 'next'].includes(btn.getAttribute('data-page')))
        .map(btn => btn.getAttribute('data-page'));
      return {
        availablePages: pageNumbers,
        maxPage: pageNumbers.length > 0 ? Math.max(...pageNumbers.map(Number)) : 0
      };
    });
    console.log(`- 사용 가능한 페이지: ${paginationState.availablePages.join(', ')}`);
    console.log(`- 최대 페이지: ${paginationState.maxPage}`);
    
    // 다음 페이지로 이동 (마지막 페이지가 아닌 경우)
    if (pageNum < 5) {
      const nextPageNum = pageNum + 1;
      
      try {
        // 먼저 다음 페이지 버튼이 존재하는지 확인
        const hasNextButton = await page.evaluate((targetPage) => {
          const button = document.querySelector(`a[data-page="${targetPage}"]`);
          return !!button;
        }, nextPageNum);
        
        if (!hasNextButton) {
          console.log(`\n${nextPageNum}페이지 버튼이 없음 - 마지막 페이지 도달`);
          break;
        }
        
        // Playwright click 사용
        console.log(`${nextPageNum}페이지 버튼 클릭 준비`);
        
        // 페이지네이션 영역으로 스크롤 (클래스명 패턴 매칭)
        await page.evaluate(() => {
          const pagination = document.querySelector('[class*="Pagination_pagination"]') || 
                           document.querySelector('.pagination') ||
                           document.querySelector('[class*="pagination"]');
          if (pagination) {
            pagination.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        });
        
        await page.waitForTimeout(1000);
        
        // 버튼 선택자
        const buttonSelector = `a[data-page="${nextPageNum}"]`;
        
        // 마우스 호버 효과
        await page.hover(buttonSelector);
        console.log(`🖱️ ${nextPageNum}페이지 버튼에 마우스 오버`);
        await page.waitForTimeout(300);
        
        // 버튼에 시각적 효과 추가
        await page.evaluate((selector) => {
          const button = document.querySelector(selector);
          if (button) {
            // 원래 스타일 저장
            const originalStyle = button.style.cssText;
            const originalBackground = button.style.backgroundColor;
            
            // 클릭 효과 추가 (노란색-빨간색 계열)
            button.style.transition = 'all 0.3s ease';
            button.style.transform = 'scale(1.1)';
            button.style.backgroundColor = '#FFD700';
            button.style.boxShadow = '0 0 20px rgba(255,69,0,0.8), 0 0 40px rgba(255,215,0,0.6)';
            button.style.border = '2px solid #FF4500';
            button.style.zIndex = '9999';
            button.style.position = 'relative';
            
            // 300ms 후 원래대로 복구
            setTimeout(() => {
              button.style.cssText = originalStyle;
              if (originalBackground) {
                button.style.backgroundColor = originalBackground;
              }
            }, 300);
          }
        }, buttonSelector);
        
        await page.waitForTimeout(200);
        
        // Playwright 클릭
        await page.click(buttonSelector, { 
          timeout: 5000,
          delay: 100 // 클릭 전 약간의 지연
        });
        
        console.log(`✅ ${nextPageNum}페이지 버튼 클릭 완료`);
        
        // 페이지 로딩 대기
        await page.waitForLoadState('domcontentloaded');
        
        // URL 변경 확인
        await page.waitForFunction(
          targetPage => {
            const urlParams = new URLSearchParams(window.location.search);
            return urlParams.get('page') === String(targetPage);
          },
          nextPageNum,
          { timeout: 10000 }
        );
        
        await page.waitForTimeout(1500);
        
      } catch (error) {
        console.error(`페이지 이동 실패: ${error.message}`);
        break;
      }
    }
  }
  
  console.log('\n브라우저를 수동으로 닫아주세요.');
  console.log('또는 Ctrl+C를 눌러 종료하세요.');
  
  // 무한 대기
  await new Promise(() => {});
})();