const fs = require('fs').promises;
const path = require('path');

class CoupangSearchWorkflow {
  constructor(logger) {
    this.logger = logger;
  }

  async execute(page, params) {
    const { 
      keyword = '노트북', 
      code = '92416744677', 
      pages = 4 
    } = params;
    
    // 기본값이 있으므로 필수 체크 제거

    this.logger.info('Starting Coupang search', {
      keyword,
      code,
      pages
    });

    // Clear browser state for clean session
    await this.clearBrowserState(page);

    const startTime = Date.now();
    const results = await this.searchProducts(page, keyword, null, pages, code);
    const executionTime = Date.now() - startTime;

    this.logger.info('Coupang search completed', {
      keyword,
      code,
      found: results.targetFound,
      rank: results.targetRank,
      executionTime
    });

    // 찾은 경우 간단한 응답 반환
    if (results.targetFound) {
      return {
        found: true,
        rank: results.targetRank,
        page: results.targetProduct.pageNumber,
        product: results.targetProduct,
        keyword,
        code,
        executionTime,
        timestamp: new Date().toISOString()
      };
    }

    // 못 찾은 경우
    return {
      found: false,
      keyword,
      code,
      pagesSearched: results.pagesSearched,
      executionTime,
      timestamp: new Date().toISOString()
    };
  }

  async clearBrowserState(page) {
    try {
      await page.context().clearCookies();
      await page.evaluate(() => {
        try { localStorage.clear(); } catch(e) {}
        try { sessionStorage.clear(); } catch(e) {}
      });
      this.logger.debug('Browser state cleared');
    } catch (error) {
      this.logger.warn('Failed to clear browser state', { error: error.message });
    }
  }

  async searchProducts(page, keyword, limit, maxPages, targetCode) {
    const pageSize = 72;
    let allProducts = [];
    let currentPage = 1;
    let targetProduct = null;
    let targetRank = null;
    let shouldContinue = true;

    // Setup request failure monitoring
    let networkBlocked = false;
    let failedRequests = [];

    const requestFailedHandler = (request) => {
      const url = request.url();
      const failure = request.failure();
      if (url.includes('coupang.com')) {
        this.logger.warn('Request failed', { url, error: failure?.errorText });
        failedRequests.push({
          url: url,
          error: failure?.errorText
        });
        
        const blockingErrors = [
          'net::ERR_BLOCKED_BY_CLIENT',
          'net::ERR_FAILED',
          'net::ERR_HTTP2_PROTOCOL_ERROR',
          'net::ERR_CONNECTION_REFUSED',
          'net::ERR_CONNECTION_RESET'
        ];
        
        if (blockingErrors.includes(failure?.errorText)) {
          networkBlocked = true;
        }
      }
    };

    page.on('requestfailed', requestFailedHandler);

    try {
      while (shouldContinue && currentPage <= maxPages) {
        this.logger.info(`Crawling page ${currentPage}...`);

        // Build search URL
        const searchUrl = `https://www.coupang.com/np/search?q=${encodeURIComponent(keyword)}&channel=user&failRedirectApp=true&page=${currentPage}&listSize=${pageSize}`;
        
        // Navigate to page
        let response;
        try {
          response = await page.goto(searchUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          });
        } catch (error) {
          this.logger.error('Navigation failed', { error: error.message });
          return this.createBlockedResponse(keyword, allProducts, searchUrl, 'NAVIGATION_FAILED', error.message);
        }

        const status = response ? response.status() : 0;
        const currentUrl = page.url();

        // Check for blocking
        if (status === 403) {
          return this.createBlockedResponse(keyword, allProducts, searchUrl, 'HTTP_403_FORBIDDEN', 'Access forbidden');
        }

        if (status === 429) {
          return this.createBlockedResponse(keyword, allProducts, searchUrl, 'HTTP_429_TOO_MANY_REQUESTS', 'Rate limited');
        }

        if (currentUrl.startsWith('chrome-error://') || networkBlocked) {
          return this.createBlockedResponse(keyword, allProducts, searchUrl, 'NETWORK_LEVEL_BLOCK', 'Network blocked');
        }

        // Wait for initial load
        await page.waitForTimeout(500);

        // Check for no results
        const noResults = await page.evaluate(() => {
          const noResultElement = document.querySelector('[class^=no-result_magnifier]');
          const noResultText = document.body?.innerText?.includes('에 대한 검색결과가 없습니다');
          return !!noResultElement || !!noResultText;
        });

        if (noResults && currentPage === 1) {
          this.logger.warn('No search results found', { keyword });
          return {
            keyword,
            count: 0,
            products: [],
            searchUrl: page.url(),
            message: `No results for "${keyword}"`,
            noResults: true,
            timestamp: new Date().toISOString()
          };
        }

        // Wait for product list
        try {
          await page.waitForSelector('#product-list', { timeout: 5000 });
        } catch (error) {
          this.logger.warn(`Page ${currentPage}: Product list not found`);
          break;
        }

        // Extract products
        const pageProducts = await page.evaluate((currentPage, pageSize) => {
          const items = document.querySelectorAll('#product-list > li[data-id]');
          
          // Filter out ads
          const filteredItems = Array.from(items).filter(item => {
            const linkElement = item.querySelector('a');
            const adMarkElement = item.querySelector('[class*=AdMark]');
            const href = linkElement ? linkElement.getAttribute('href') : '';
            return !adMarkElement && !href.includes('sourceType=srp_product_ads');
          });

          return filteredItems.map((item, index) => {
            const linkElement = item.querySelector('a');
            const imgElement = item.querySelector('img');
            const href = linkElement ? linkElement.getAttribute('href') : '';
            
            // Extract product details
            let rank = null;
            let productId = null;
            let itemId = null;
            let vendorItemId = null;

            if (href) {
              const rankMatch = href.match(/rank=(\d+)/);
              rank = rankMatch ? parseInt(rankMatch[1]) : null;
              
              const productIdMatch = href.match(/\/vp\/products\/(\d+)/);
              productId = productIdMatch ? productIdMatch[1] : null;
              
              const itemIdMatch = href.match(/itemId=(\d+)/);
              itemId = itemIdMatch ? itemIdMatch[1] : null;
              
              const vendorItemIdMatch = href.match(/vendorItemId=(\d+)/);
              vendorItemId = vendorItemIdMatch ? vendorItemIdMatch[1] : null;
            }

            // Extract price
            let price = null;
            try {
              const priceElement = item.querySelector('[class*="Price_priceValue__"]');
              if (priceElement) {
                const priceText = priceElement.textContent || priceElement.innerText;
                const priceMatch = priceText.match(/[\d,]+/);
                if (priceMatch) {
                  price = parseInt(priceMatch[0].replace(/,/g, ''));
                }
              }
            } catch (e) {}

            // Extract rating
            let rating = null;
            let reviewCount = null;
            
            try {
              const ratingContainer = item.querySelector('[class*="ProductRating_productRating__"]');
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

            const realRank = ((currentPage - 1) * pageSize) + index + 1;

            return {
              rank: rank || realRank,
              realRank: realRank,
              productId: productId,
              itemId: itemId,
              vendorItemId: vendorItemId,
              name: imgElement ? imgElement.getAttribute('alt') : 'Unknown',
              price: price,
              thumbnail: imgElement ? imgElement.getAttribute('src') : null,
              url: href ? `https://www.coupang.com${href}` : null,
              rating: rating,
              reviewCount: reviewCount,
              pageNumber: currentPage
            };
          });
        }, currentPage, pageSize);

        // Add products to collection
        allProducts = allProducts.concat(pageProducts);
        
        this.logger.info(`Page ${currentPage}: Found ${pageProducts.length} products (Total: ${allProducts.length})`);

        // Check if target product found
        if (targetCode) {
          const found = pageProducts.find(p => 
            p.productId === targetCode || 
            p.itemId === targetCode || 
            p.vendorItemId === targetCode
          );
          
          if (found) {
            targetProduct = found;
            targetRank = found.realRank;
            this.logger.info('Target product found!', {
              targetCode,
              rank: targetRank,
              name: found.name,
              price: found.price
            });
            shouldContinue = false;
            break; // 즉시 루프 종료
          }
        }

        // Check if limit reached
        if (limit && allProducts.length >= limit) {
          allProducts = allProducts.slice(0, limit);
          shouldContinue = false;
        }

        // Check if more pages available
        const hasNextPage = await page.evaluate(() => {
          const nextButton = document.querySelector('.btn-next');
          return nextButton && !nextButton.classList.contains('disabled');
        });

        if (!hasNextPage) {
          this.logger.info('No more pages available');
          shouldContinue = false;
        }

        currentPage++;
      }

    } catch (error) {
      this.logger.error('Search error', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      page.off('requestfailed', requestFailedHandler);
      
      // Navigate to blank page to clean up
      try {
        await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 1000 });
      } catch (e) {}
    }

    // Return results
    const result = {
      keyword,
      count: allProducts.length,
      products: allProducts,
      searchUrl: page.url(),
      pagesSearched: currentPage - 1,
      timestamp: new Date().toISOString()
    };

    if (targetCode) {
      result.targetCode = targetCode;
      result.targetProduct = targetProduct;
      result.targetRank = targetRank;
      result.targetFound = !!targetProduct;
    }

    return result;
  }

  createBlockedResponse(keyword, products, searchUrl, blockType, message) {
    return {
      keyword,
      count: products.length,
      products,
      searchUrl,
      blocked: true,
      blockType,
      message,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = CoupangSearchWorkflow;