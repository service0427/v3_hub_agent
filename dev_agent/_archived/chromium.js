require('dotenv').config();
const { chromium } = require('playwright');
const winston = require('winston');
const path = require('path');
const fs = require('fs').promises;

// Configuration
const config = {
  browserType: 'chromium',
  headless: process.env.HEADLESS === 'true',
  userDataDir: process.env.USER_DATA_DIR || './data/users',
  window: {
    width: parseInt(process.env.WINDOW_WIDTH || '1200'),
    height: parseInt(process.env.WINDOW_HEIGHT || '800'),
    x: parseInt(process.env.WINDOW_X || '100'),
    y: parseInt(process.env.WINDOW_Y || '100')
  },
  testUrl: process.env.TEST_URL,
  testKeyword: process.env.TEST_KEYWORD,
  testProductCode: process.env.TEST_PRODUCT_CODE,
  maxPages: parseInt(process.env.MAX_PAGES || '5'),
  defaultTimeout: parseInt(process.env.DEFAULT_TIMEOUT || '30000'),
  logLevel: process.env.LOG_LEVEL || 'info',
  clickTargetProduct: process.env.CLICK_TARGET_PRODUCT === 'true',
  highlightWaitTime: parseInt(process.env.HIGHLIGHT_WAIT_TIME || '2000')
};

// Logger setup
const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...rest }) => {
      const restStr = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
      return `${timestamp} [${level}] ${message}${restStr}`;
    })
  ),
  transports: [
    new winston.transports.Console()
  ]
});

// Ensure directories exist
async function ensureDirectories() {
  const dirs = ['data', 'data/users', 'logs'];
  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }
}

// 오래된 로그 파일 정리 (각 타입별로 20개만 유지)
async function cleanupOldLogs() {
  try {
    const logsDir = path.join(__dirname, 'logs');
    const files = await fs.readdir(logsDir);
    
    // 파일을 타입별로 그룹화
    const fileGroups = {
      products: [],
      simple: [],
      blocked: []
    };
    
    for (const file of files) {
      const filePath = path.join(logsDir, file);
      const stats = await fs.stat(filePath);
      
      if (stats.isFile()) {
        if (file.startsWith('products_') && file.endsWith('.json')) {
          fileGroups.products.push({ name: file, path: filePath, mtime: stats.mtime });
        } else if (file.startsWith('simple_') && file.endsWith('.txt')) {
          fileGroups.simple.push({ name: file, path: filePath, mtime: stats.mtime });
        } else if (file.startsWith('blocked_') && file.endsWith('.json')) {
          fileGroups.blocked.push({ name: file, path: filePath, mtime: stats.mtime });
        }
      }
    }
    
    // 각 그룹별로 정리
    for (const [, files] of Object.entries(fileGroups)) {
      if (files.length > 20) {
        files.sort((a, b) => a.mtime - b.mtime);
        const filesToDelete = files.slice(0, files.length - 20);
        for (const file of filesToDelete) {
          try {
            await fs.unlink(file.path);
            logger.info(`🗑️ 오래된 로그 파일 삭제: ${file.name}`);
          } catch (err) {
            logger.warn(`파일 삭제 실패: ${file.name}`, err.message);
          }
        }
      }
    }
  } catch (error) {
    logger.warn('로그 파일 정리 중 오류:', error.message);
  }
}

// Main function
async function run() {
  logger.info('=== ParserHub V3 Chromium Agent ===');
  logger.info('Configuration:', {
    browserType: 'chromium',
    keyword: config.testKeyword,
    productCode: config.testProductCode,
    maxPages: config.maxPages,
    clickTargetProduct: config.clickTargetProduct,
    highlightWaitTime: config.highlightWaitTime
  });

  let browser = null;
  let context = null;
  let page = null;

  try {
    await ensureDirectories();
    await cleanupOldLogs();

    // Launch Chromium
    logger.info('Launching Chromium browser...');
    browser = await chromium.launch({
      headless: config.headless,
      args: ['--disable-blink-features=AutomationControlled']
    });

    logger.info('✅ Browser launched successfully');

    // Create context
    context = await browser.newContext({
      viewport: { 
        width: config.window.width, 
        height: config.window.height 
      },
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
      storageState: undefined,
      httpCredentials: undefined,
      ignoreHTTPSErrors: false,
      bypassCSP: false,
      javaScriptEnabled: true,
      userAgent: undefined
    });

    logger.info('✅ Browser context created');

    // Clear browser state
    try {
      await context.clearCookies();
      await context.clearPermissions();
      logger.info('✅ Browser state cleared');
    } catch (error) {
      logger.warn('Failed to clear some browser state:', error.message);
    }

    // Create page
    page = await context.newPage();
    logger.info('✅ New page created');

    // Search logic
    const maxPages = config.maxPages;
    let foundProduct = null;
    const allProducts = [];
    let searchBlocked = false;
    let blockInfo = null;

    for (let currentPage = 1; currentPage <= maxPages; currentPage++) {
      const searchUrl = `https://www.coupang.com/np/search?q=${encodeURIComponent(config.testKeyword)}&channel=user&failRedirectApp=true&page=${currentPage}&listSize=72`;
      
      logger.info(`Searching page ${currentPage}: ${searchUrl}`);
      
      // Page navigation
      let response;
      try {
        response = await page.goto(searchUrl, { 
          waitUntil: 'domcontentloaded',
          timeout: config.defaultTimeout 
        });
      } catch (error) {
        logger.error(`❌ Navigation failed: ${error.message}`);
        searchBlocked = true;
        blockInfo = {
          type: 'NAVIGATION_ERROR',
          error: `Navigation failed: ${error.message}`,
          blockedAt: currentPage,
          url: searchUrl
        };
        break;
      }
      
      // Check response status
      const status = response ? response.status() : 0;
      const currentUrl = page.url();
      
      if (status === 403 || status === 429) {
        logger.error(`❌ HTTP ${status} - Access blocked`);
        searchBlocked = true;
        blockInfo = {
          type: `HTTP_${status}`,
          error: `HTTP ${status} - Access blocked by Coupang`,
          blockedAt: currentPage,
          url: searchUrl
        };
        break;
      }

      if (currentUrl.startsWith('chrome-error://')) {
        logger.error(`❌ Network level block detected`);
        searchBlocked = true;
        blockInfo = {
          type: 'NETWORK_LEVEL_BLOCK',
          error: 'Network level block detected',
          blockedAt: currentPage,
          blockedUrl: currentUrl,
          url: searchUrl
        };
        break;
      }

      await page.waitForTimeout(1000);

      // Check for error page
      const quickCheck = await page.evaluate(() => {
        const noResultElement = document.querySelector('[class^=no-result_magnifier]');
        const noResultText = document.body?.innerText?.includes('에 대한 검색결과가 없습니다');
        const productList = document.querySelector('#product-list');
        const hasProductList = !!productList;
        const productCount = productList ? productList.querySelectorAll('li[data-id]').length : 0;
        
        const bodyText = document.body?.innerText || '';
        const isErrorPage = bodyText.includes('Secure Connection Failed') || 
                           bodyText.includes('NS_ERROR_NET_INTERRUPT') ||
                           bodyText.includes('The connection to') ||
                           bodyText.includes('was interrupted');
        
        return {
          hasNoResult: !!noResultElement || !!noResultText,
          hasProductList: hasProductList,
          productCount: productCount,
          isErrorPage: isErrorPage,
          bodyPreview: bodyText.substring(0, 200)
        };
      });
      
      if (quickCheck.isErrorPage) {
        logger.error(`❌ Browser error page detected!`);
        searchBlocked = true;
        blockInfo = {
          type: 'BROWSER_ERROR_PAGE',
          error: 'Browser error page detected',
          blockedAt: currentPage,
          bodyPreview: quickCheck.bodyPreview,
          url: searchUrl
        };
        break;
      }
      
      if (quickCheck.hasNoResult && currentPage === 1) {
        logger.warn(`No results for "${config.testKeyword}"`);
        break;
      }
      
      // Wait for product list if needed
      if (!quickCheck.hasProductList || quickCheck.productCount === 0) {
        try {
          await page.waitForSelector('#product-list > li[data-id]', { timeout: 5000 });
        } catch (error) {
          logger.warn(`Page ${currentPage}: Product list not found`);
          
          // Debug info
          const pageInfo = await page.evaluate(() => {
            const bodyText = document.body?.innerText || '';
            const productList = document.querySelector('#product-list');
            
            return {
              hasProductList: !!productList,
              productListChildren: productList ? productList.children.length : 0,
              bodyPreview: bodyText.substring(0, 200)
            };
          });
          // logger.info('Debug - Page info:', pageInfo);
          
          continue;
        }
      }

      // Extract products
      const result = await page.evaluate((params) => {
        const { targetCode, pageNum } = params;
        const products = document.querySelectorAll('#product-list > li[data-id]');
        
        const pageProducts = [];
        let targetFound = null;
        const matchedProducts = [];
        
        // Filter out ads
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
            const rankMatch = href.match(/rank=(\d+)/);
            const rank = rankMatch ? rankMatch[1] : null;
            
            const productIdMatch = href.match(/\/vp\/products\/(\d+)/);
            const itemIdMatch = href.match(/itemId=(\d+)/);
            const vendorItemIdMatch = href.match(/vendorItemId=(\d+)/);
            
            const productId = productIdMatch ? productIdMatch[1] : null;
            const itemId = itemIdMatch ? itemIdMatch[1] : null;
            const vendorItemId = vendorItemIdMatch ? vendorItemIdMatch[1] : null;
            
            // Extract name
            const nameElement = product.querySelector('[class*=productName]');
            
            // Extract price
            let price = null;
            const priceElement = product.querySelector('[class*="Price_priceValue__"]');
            if (priceElement) {
              const priceText = priceElement.textContent || priceElement.innerText;
              const priceMatch = priceText.match(/[\d,]+/);
              if (priceMatch) {
                price = parseInt(priceMatch[0].replace(/,/g, ''));
              }
            }
            
            const productInfo = {
              id: product.dataset.id,
              rank: rank || String(i + 1),
              realRank: i + 1,
              pageIndex: i + 1,
              page: pageNum,
              productId: productId,
              itemId: itemId,
              vendorItemId: vendorItemId,
              name: nameElement ? nameElement.innerText || nameElement.textContent : 'Unknown',
              price: price,
              url: `https://www.coupang.com${href}`
            };
            
            pageProducts.push(productInfo);
            
            // Check if target
            const codeStr = String(targetCode);
            if (String(productInfo.id) === codeStr ||
                String(productInfo.productId) === codeStr ||
                String(productInfo.itemId) === codeStr ||
                String(productInfo.vendorItemId) === codeStr) {
              
              matchedProducts.push(productInfo);
              
              if (!targetFound) {
                targetFound = productInfo;
              }
              
              // Highlight
              product.style.border = '5px solid #ff0000';
              product.style.backgroundColor = '#ffff00';
              product.style.boxShadow = '0 0 20px rgba(255, 0, 0, 0.8)';
              product.style.transform = 'scale(1.05)';
              product.style.transition = 'all 0.3s ease';
              
              if (matchedProducts.length === 1) {
                product.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
              
              // Blink animation
              let blink = true;
              const blinkInterval = setInterval(() => {
                product.style.opacity = blink ? '0.5' : '1';
                blink = !blink;
              }, 500);
              
              setTimeout(() => {
                clearInterval(blinkInterval);
                product.style.opacity = '1';
              }, 5000);
            }
          }
        }
        
        return { 
          found: targetFound !== null, 
          productCount: products.length,
          pageProducts: pageProducts,
          targetProduct: targetFound,
          allMatchedProducts: matchedProducts
        };
      }, { targetCode: config.testProductCode, pageNum: currentPage });
      
      // Update realRank
      if (result.pageProducts && result.pageProducts.length > 0) {
        const currentTotalCount = allProducts.length;
        result.pageProducts.forEach((product, index) => {
          product.realRank = currentTotalCount + index + 1;
        });
        allProducts.push(...result.pageProducts);
      }
      
      logger.info(`Page ${currentPage}: found ${result.pageProducts ? result.pageProducts.length : 0} products`);
      
      if (result.found) {
        foundProduct = result.targetProduct;
        
        if (result.allMatchedProducts && result.allMatchedProducts.length > 1) {
          logger.warn(`🔍 Found ${result.allMatchedProducts.length} matching products on page ${currentPage}`);
          result.allMatchedProducts.forEach((prod, idx) => {
            logger.info(`  ${idx + 1}. [${prod.realRank}] ${prod.id} - ${prod.name}`);
          });
        }
        
        // Update realRank
        const targetIndex = result.pageProducts.findIndex(p => 
          String(p.id) === String(config.testProductCode) ||
          String(p.productId) === String(config.testProductCode) ||
          String(p.itemId) === String(config.testProductCode) ||
          String(p.vendorItemId) === String(config.testProductCode)
        );
        if (targetIndex !== -1) {
          foundProduct.realRank = allProducts.length - result.pageProducts.length + targetIndex + 1;
        }
        
        logger.info(`✅ Product found!`, {
          code: config.testProductCode,
          rank: foundProduct.rank,
          realRank: foundProduct.realRank,
          page: foundProduct.page,
          name: foundProduct.name,
          id: foundProduct.id,
          productId: foundProduct.productId,
          vendorItemId: foundProduct.vendorItemId
        });
        
        // Wait for highlight
        const waitTime = config.clickTargetProduct ? 3000 : config.highlightWaitTime;
        if (waitTime > 0) {
          logger.info(`🎨 Highlighted. Waiting ${waitTime/1000}s...`);
          await page.waitForTimeout(waitTime);
        }
        
        // Click if enabled
        if (config.clickTargetProduct) {
          try {
            logger.info('🖱️ Clicking target product...');
            
            await page.evaluate((targetId) => {
              const targetProduct = document.querySelector(`li[data-id="${targetId}"]`);
              if (targetProduct) {
                const link = targetProduct.querySelector('a');
                if (link) {
                  targetProduct.style.border = '8px solid #00ff00';
                  link.click();
                }
              }
            }, foundProduct.id);
            
            await page.waitForLoadState('domcontentloaded');
            const productUrl = page.url();
            logger.info(`✅ Navigated to: ${productUrl}`);
            
            await page.waitForTimeout(2000);
          } catch (error) {
            logger.error('Click error:', error.message);
          }
        }
        
        break;
      }
    }
    
    // Save results
    const timestamp = Date.now();
    
    // JSON file
    const jsonFileName = `products_${config.testKeyword}_${timestamp}.json`;
    const jsonFilePath = path.join('logs', jsonFileName);
    
    const jsonData = {
      searchKeyword: config.testKeyword,
      targetCode: config.testProductCode,
      timestamp: new Date().toISOString(),
      totalProducts: allProducts.length,
      pagesSearched: maxPages,
      targetFound: foundProduct !== null,
      targetProduct: foundProduct,
      searchBlocked: searchBlocked,
      blockInfo: blockInfo,
      allProducts: allProducts
    };
    
    try {
      await fs.writeFile(jsonFilePath, JSON.stringify(jsonData, null, 2));
      logger.info(`✅ Full data saved to ${jsonFilePath}`);
    } catch (error) {
      logger.error('Failed to save JSON:', error.message);
    }
    
    // Simple TXT file
    const txtFileName = `simple_${config.testKeyword}_${timestamp}.txt`;
    const txtFilePath = path.join('logs', txtFileName);
    
    try {
      let txtContent = `검색어: ${config.testKeyword}\n`;
      txtContent += `검색 시간: ${new Date().toLocaleString('ko-KR')}\n`;
      txtContent += `총 상품 수: ${allProducts.length}개\n`;
      txtContent += `타겟 코드: ${config.testProductCode}\n`;
      
      if (searchBlocked) {
        txtContent += `\n❌ 검색 차단됨\n`;
        txtContent += `차단 페이지: ${blockInfo.blockedAt}\n`;
        txtContent += `차단 사유: ${blockInfo.error}\n`;
      }
      
      if (foundProduct) {
        txtContent += `\n★ 타겟 상품 발견! ★\n`;
        txtContent += `순위: ${foundProduct.realRank}위\n`;
        txtContent += `ID: ${foundProduct.id}\n`;
        txtContent += `productId: ${foundProduct.productId}\n`;
        txtContent += `상품명: ${foundProduct.name}\n`;
      }
      
      txtContent += `\n=== 전체 상품 목록 (realRank, id, name) ===\n\n`;
      
      const sortedProducts = [...allProducts].sort((a, b) => a.realRank - b.realRank);
      
      // Group by realRank
      const rankGroups = {};
      sortedProducts.forEach(product => {
        if (!rankGroups[product.realRank]) {
          rankGroups[product.realRank] = [];
        }
        rankGroups[product.realRank].push(product);
      });
      
      Object.keys(rankGroups).sort((a, b) => parseInt(a) - parseInt(b)).forEach(rank => {
        const products = rankGroups[rank];
        if (products.length === 1) {
          const product = products[0];
          const isTarget = product.id === foundProduct?.id ? ' ★' : '';
          txtContent += `${product.realRank}. ${product.id} - ${product.name}${isTarget}\n`;
        } else {
          products.forEach((product, idx) => {
            const isTarget = product.id === foundProduct?.id ? ' ★' : '';
            const subIndex = String.fromCharCode(97 + idx);
            txtContent += `${product.realRank}${subIndex}. ${product.id} - ${product.name}${isTarget}\n`;
          });
        }
      });
      
      await fs.writeFile(txtFilePath, txtContent, 'utf8');
      logger.info(`✅ Simple list saved to ${txtFilePath}`);
    } catch (error) {
      logger.error('Failed to save TXT:', error.message);
    }
    
    // Log results
    if (searchBlocked) {
      logger.error('========================================');
      logger.error('❌ Search blocked');
      logger.error(`Type: ${blockInfo.type}`);
      logger.error(`Page: ${blockInfo.blockedAt}`);
      logger.error(`Error: ${blockInfo.error}`);
      logger.error('========================================');
    } else if (foundProduct) {
      logger.info('========================================');
      logger.info('🎯 Search completed');
      logger.info(`Keyword: ${config.testKeyword}`);
      logger.info(`Product code: ${config.testProductCode}`);
      logger.info(`Rank: ${foundProduct.rank} (with ads)`);
      logger.info(`Real rank: ${foundProduct.realRank} (without ads)`);
      logger.info(`Page: ${foundProduct.page}`);
      logger.info(`Name: ${foundProduct.name}`);
      logger.info(`Price: ${foundProduct.price ? foundProduct.price.toLocaleString() : 'N/A'}원`);
      logger.info('========================================');
    } else {
      logger.info('========================================');
      logger.info('❌ Product not found');
      logger.info(`Keyword: ${config.testKeyword}`);
      logger.info(`Product code: ${config.testProductCode}`);
      logger.info(`Pages searched: ${maxPages}`);
      logger.info(`Total products: ${allProducts.length}`);
      logger.info('========================================');
    }

  } catch (error) {
    logger.error('❌ Error:', error);
  } finally {
    if (page) await page.close();
    if (context) await context.close();
    if (browser) await browser.close();
    
    logger.info('✅ Browser closed');
    process.exit(0);
  }
}

// Handle errors
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error);
  process.exit(1);
});

// Run immediately
run();