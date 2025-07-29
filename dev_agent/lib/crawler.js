const logger = require('./logger');

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
    
    // 최대 5페이지까지 검색
    let foundRank = null;
    let currentPage = 1;
    const maxPages = 5;
    
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
      
      // 다음 페이지로 이동
      if (currentPage < maxPages) {
        currentPage++;
        const nextUrl = `https://www.coupang.com/np/search?q=${encodeURIComponent(keyword)}&channel=user&failRedirectApp=true&page=${currentPage}&listSize=72`;
        await page.goto(nextUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1000);
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