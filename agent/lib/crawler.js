const logger = require('./logger');
const { config } = require('./config');

// Search keyword function
async function searchKeyword(page, keyword, productCode) {
  try {
    const searchUrl = `https://www.coupang.com/np/search?q=${encodeURIComponent(keyword)}&channel=user&failRedirectApp=true&page=1&listSize=72`;
    
    await page.goto(searchUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 40000  // 첫 페이지는 40초 타임아웃 (브라우저 초기화 고려)
    });
    
    await page.waitForTimeout(2000); // 페이지 안정화 대기
    
    // Check for error page
    const quickCheck = await page.evaluate(() => {
      const noResultElement = document.querySelector('[class^=no-result_magnifier]');
      const noResultText = document.body?.innerText?.includes('에 대한 검색결과가 없습니다');
      const productList = document.querySelector('#product-list');
      const hasProductList = !!productList;
      const productCount = productList ? productList.querySelectorAll('li[data-id]').length : 0;
      
      const bodyText = document.body?.innerText || '';
      const pageTitle = document.title || '';
      const isErrorPage = bodyText.includes('Secure Connection Failed') || 
                         bodyText.includes('NS_ERROR_NET_INTERRUPT') ||
                         bodyText.includes('The connection to') ||
                         bodyText.includes('was interrupted') ||
                         bodyText.includes('ERR_') ||
                         bodyText.includes('HTTP2_PROTOCOL_ERROR') ||
                         pageTitle.includes('Error') ||
                         pageTitle.includes('오류');
      
      return {
        hasNoResult: !!noResultElement || !!noResultText,
        hasProductList: hasProductList,
        productCount: productCount,
        isErrorPage: isErrorPage,
        bodyPreview: bodyText.substring(0, 200)
      };
    });
    
    if (quickCheck.isErrorPage) {
      logger.error(`❌ Browser error page detected for: ${keyword}`);
      throw new Error('BLOCKED: Browser error page detected');
    }
    
    if (quickCheck.hasNoResult) {
      logger.warn(`No results for: ${keyword}`);
      return null;
    }
    
    // Wait for product list if needed
    if (!quickCheck.hasProductList || quickCheck.productCount === 0) {
      try {
        await page.waitForSelector('#product-list > li[data-id]', { timeout: 8000 }); // 전체 30초 제한 내 동작
      } catch (error) {
        // 네트워크 오류인지 확인
        const pageUrl = page.url();
        const pageTitle = await page.title().catch(() => '');
        
        if (pageUrl.includes('error') || pageTitle.includes('Error') || pageTitle.includes('오류')) {
          logger.error(`❌ Error page detected for: ${keyword}`);
          throw new Error('BLOCKED: Error page detected');
        }
        
        logger.warn(`Failed to find product list for: ${keyword}`);
        return null;
      }
    }
    
    // 최대 페이지 수는 config에서 가져옴
    let foundRank = null;
    let currentPage = 1;
    const maxPages = config.maxPages || 5;
    
    while (currentPage <= maxPages && !foundRank) {
      logger.info(`🔍 검색 중: ${keyword} (page ${currentPage}/${maxPages}) - 상품코드: ${productCode}`);
      
      const pageInfo = await page.evaluate(() => {
        const products = document.querySelectorAll('#product-list > li[data-id]');
        return {
          totalProducts: products.length,
          productIds: Array.from(products).slice(0, 5).map(p => p.getAttribute('data-id'))
        };
      });
      
      logger.debug(`  └─ 페이지 내 상품 수: ${pageInfo.totalProducts}개`);
      
      const result = await page.evaluate((targetCode) => {
        const products = document.querySelectorAll('#product-list > li[data-id]');
        const filteredProducts = Array.from(products).filter(i => {
          const linkElement = i.querySelector('a');
          const adMarkElement = i.querySelector('[class*=AdMark]');
          const href = linkElement ? linkElement.getAttribute('href') : '';
          return !adMarkElement && !href.includes('sourceType=srp_product_ads');
        });
        
        for (let i = 0; i < filteredProducts.length; i++) {
          const product = filteredProducts[i];
          const linkElement = product.querySelector('a');
          
          if (linkElement) {
            const href = linkElement.getAttribute('href');
            
            // Extract IDs
            const productIdMatch = href.match(/\/vp\/products\/(\d+)/);
            const itemIdMatch = href.match(/itemId=(\d+)/);
            const vendorItemIdMatch = href.match(/vendorItemId=(\d+)/);
            
            const productId = productIdMatch ? productIdMatch[1] : null;
            const itemId = itemIdMatch ? itemIdMatch[1] : null;
            const vendorItemId = vendorItemIdMatch ? vendorItemIdMatch[1] : null;
            
            const codeStr = String(targetCode);
            if (String(product.dataset.id) === codeStr ||
                String(productId) === codeStr ||
                String(itemId) === codeStr ||
                String(vendorItemId) === codeStr) {
              
              // 상품 정보 추출
              const imgElement = product.querySelector('img');
              const productName = imgElement ? imgElement.getAttribute('alt') : 'Unknown';
              const thumbnailUrl = imgElement ? imgElement.getAttribute('src') : null;
            
              let rating = null;
              let reviewCount = null;
              
              try {
                const ratingContainer = product.querySelector('[class*="ProductRating_productRating__"]');
                if (ratingContainer) {
                  const ratingSpan = ratingContainer.querySelector('[class*="ProductRating_rating__"]');
                  if (ratingSpan) {
                    const ratingText = ratingSpan.textContent.trim();
                    const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
                    if (ratingMatch) {
                      rating = parseFloat(ratingMatch[1]).toFixed(1);
                    }
                  }
                  
                  const reviewCountElement = ratingContainer.querySelector('[class*="ProductRating_ratingCount__"]');
                  if (reviewCountElement) {
                    const reviewText = reviewCountElement.textContent || reviewCountElement.innerText;
                    const reviewMatch = reviewText.match(/\(?\s*(\d+)\s*\)?/);
                    if (reviewMatch) {
                      reviewCount = parseInt(reviewMatch[1]);
                    }
                  }
                }
              } catch (e) {}
              
              return {
                rank: i + 1, // realRank (광고 제외)
                productName: productName,
                thumbnailUrl: thumbnailUrl,
                rating: rating,
                reviewCount: reviewCount
              };
            }
          }
        }
        
        return null;
      }, productCode);
      
      if (result) {
        foundRank = (currentPage - 1) * 72 + result.rank;
        // 상품 정보도 함께 반환하기 위해 result 객체 저장
        return {
          rank: foundRank,
          productName: result.productName,
          thumbnailUrl: result.thumbnailUrl,
          rating: result.rating,
          reviewCount: result.reviewCount
        };
      }
      
      // 다음 페이지로 이동 (클릭 방식)
      if (currentPage < maxPages) {
        currentPage++;
        
        try {
          // 먼저 다음 페이지 버튼이 존재하는지 확인
          const hasNextButton = await page.evaluate((targetPage) => {
            const button = document.querySelector(`a[data-page="${targetPage}"]`);
            return !!button;
          }, currentPage);
          
          if (!hasNextButton) {
            logger.info(`${currentPage}페이지 버튼이 없음 - 마지막 페이지 도달`);
            break;
          }
          
          // 페이지네이션 영역으로 스크롤
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
          const buttonSelector = `a[data-page="${currentPage}"]`;
          
          // 마우스 호버 효과
          await page.hover(buttonSelector);
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
          
          // 버튼 클릭
          await page.click(buttonSelector, { 
            timeout: 5000,
            delay: 100
          });
          
          // 페이지 로딩 대기
          await page.waitForLoadState('domcontentloaded');
          
          // URL 변경 확인
          await page.waitForFunction(
            targetPage => {
              const urlParams = new URLSearchParams(window.location.search);
              return urlParams.get('page') === String(targetPage);
            },
            currentPage,
            { timeout: 10000 }
          );
          
          await page.waitForTimeout(1500);
          
        } catch (e) {
          // 클릭 실패 시 로그만 남기고 종료
          logger.error(`페이지 ${currentPage} 클릭 실패: ${e.message}`);
          break;  // 더 이상 진행하지 않음
        }
      } else {
        break;
      }
    }
    
    return null;
    
  } catch (error) {
    throw error;
  }
}

module.exports = {
  searchKeyword
};