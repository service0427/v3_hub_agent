require('dotenv').config();
const { chromium, firefox } = require('playwright');
const winston = require('winston');
const path = require('path');
const fs = require('fs').promises;

// Configuration
const config = {
  browserType: process.env.BROWSER_TYPE || 'chrome',
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
async function ensureDirectories(additionalDir = null) {
  const dirs = ['data', 'data/users', 'logs'];
  if (additionalDir) {
    dirs.push(additionalDir);
  }
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
    const logsDir = path.join(__dirname, '../logs');
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
        // 수정 시간 기준으로 정렬 (오래된 것부터)
        files.sort((a, b) => a.mtime - b.mtime);
        
        // 오래된 파일들 삭제 (20개만 남기고)
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

// Main test function
async function runBrowserTest() {
  logger.info('=== ParserHub V3 Development Agent ===');
  logger.info('Configuration:', {
    browserType: config.browserType,
    headless: config.headless,
    window: config.window,
    display: process.env.DISPLAY || 'not set',
    clickTargetProduct: config.clickTargetProduct
  });

  let browser = null;
  let context = null;
  let page = null;

  try {
    // Ensure directories exist
    await ensureDirectories();
    
    // 오래된 로그 파일 정리
    await cleanupOldLogs();

    // Launch browser based on type
    logger.info(`Launching ${config.browserType} browser...`);
    
    let launchOptions = {
      headless: config.headless
    };

    switch (config.browserType) {
      case 'chrome':
        launchOptions.channel = 'chrome';  // Use installed Chrome instead of Chromium
        launchOptions.args = ['--disable-blink-features=AutomationControlled'];
        browser = await chromium.launch(launchOptions);
        break;
        
      case 'chromium':
        // Chromium은 channel 설정 없이 사용
        launchOptions.args = ['--disable-blink-features=AutomationControlled'];
        browser = await chromium.launch(launchOptions);
        break;
        
      case 'firefox':
        logger.info('Launching regular Firefox (not Nightly)');
        // V2처럼 간단하게 실행
        launchOptions.args = [
          '--new-instance',
          '--no-remote'
        ];
        browser = await firefox.launch(launchOptions);
        break;
        
      case 'firefox-nightly':
        // Firefox Nightly 경로 확인 - 여러 가능한 경로 시도
        const possiblePaths = [
          process.env.FIREFOX_NIGHTLY_PATH,
          '/usr/bin/firefox-nightly',
          '/opt/firefox-nightly/firefox',
          '/usr/local/bin/firefox-nightly',
          '/snap/bin/firefox-nightly'
        ].filter(Boolean);
        
        let nightlyPath = null;
        for (const path of possiblePaths) {
          try {
            await fs.access(path);
            nightlyPath = path;
            logger.info(`Found Firefox Nightly at: ${path}`);
            break;
          } catch (e) {
            // Continue to next path
          }
        }
        
        if (!nightlyPath) {
          // Firefox Nightly가 없으면 일반 Firefox 사용
          logger.warn('Firefox Nightly not found, using regular Firefox');
          browser = await firefox.launch(launchOptions);
        } else {
          launchOptions.executablePath = nightlyPath;
          browser = await firefox.launch(launchOptions);
        }
        break;
        
      case 'edge':
        // Edge는 Windows에서만 지원
        if (process.platform !== 'win32') {
          throw new Error('Microsoft Edge is only supported on Windows. Use Chrome or Firefox on Linux.');
        }
        launchOptions.channel = 'msedge';
        browser = await chromium.launch(launchOptions);
        break;
        
      default:
        throw new Error(`Unsupported browser type: ${config.browserType}`);
    }

    logger.info('✅ Browser launched successfully');
    logger.info('Browser version:', browser.version());
    
    // 브라우저 타입 확인
    logger.info('Browser type:', browser.browserType().name());

    // Create context - 시크릿 모드처럼 동작하도록 설정
    const contextOptions = {
      viewport: { 
        width: config.window.width, 
        height: config.window.height 
      },
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
      // 시크릿 모드 동작을 위한 옵션
      storageState: undefined,  // 저장된 상태 사용하지 않음
      httpCredentials: undefined,  // HTTP 인증 정보 사용하지 않음
      ignoreHTTPSErrors: false,  // HTTPS 오류 무시하지 않음
      bypassCSP: false,  // CSP 우회하지 않음
      javaScriptEnabled: true,
      userAgent: undefined  // 기본 User-Agent 사용
    };
    
    // Firefox는 V2처럼 extraHTTPHeaders만 추가
    if (config.browserType === 'firefox' || config.browserType === 'firefox-nightly') {
      contextOptions.extraHTTPHeaders = {
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'
      };
    }
    
    context = await browser.newContext(contextOptions);

    logger.info('✅ Browser context created');
    
    // 브라우저 상태 확인 및 초기화
    try {
      // 초기화 전 쿠키 확인
      const cookiesBefore = await context.cookies();
      logger.info(`🍪 초기화 전 쿠키 개수: ${cookiesBefore.length}`);
      if (cookiesBefore.length > 0) {
        logger.info('쿠키 샘플 (최대 3개):', cookiesBefore.slice(0, 3).map(c => ({
          name: c.name,
          domain: c.domain,
          value: c.value.substring(0, 20) + '...'
        })));
      }
      
      // 쿠키 삭제
      await context.clearCookies();
      
      // 권한 초기화
      await context.clearPermissions();
      
      // 초기화 후 쿠키 확인
      const cookiesAfter = await context.cookies();
      logger.info(`✅ Browser state cleared - 남은 쿠키: ${cookiesAfter.length}개`);
    } catch (error) {
      logger.warn('Failed to clear some browser state:', error.message);
    }

    // Create page
    page = await context.newPage();
    logger.info('✅ New page created');
    
    // 페이지 콘솔 메시지 캡처 (디버깅용)
    page.on('console', msg => {
      if (msg.type() === 'log' || msg.type() === 'info') {
        logger.info(`[Browser Console] ${msg.text()}`);
      } else if (msg.type() === 'error') {
        logger.error(`[Browser Console Error] ${msg.text()}`);
      }
    });
    
    // V2처럼 Firefox는 별도 처리 없이 진행
    
    // 테스트 시작 전 안내
    logger.info('🔍 브라우저가 시크릿 모드처럼 동작합니다.');
    logger.info('쿠키와 스토리지는 첫 페이지 로드 시 확인됩니다.');

    // 여러 페이지에서 상품 검색
    const maxPages = config.maxPages;
    let foundProduct = null;
    const allProducts = []; // 모든 상품 정보 저장
    let searchBlocked = false;
    let blockInfo = null;
    
    for (let currentPage = 1; currentPage <= maxPages; currentPage++) {
      // 검색 URL 생성 (페이지 파라미터 포함)
      const searchUrl = `https://www.coupang.com/np/search?q=${encodeURIComponent(config.testKeyword)}&channel=user&failRedirectApp=true&page=${currentPage}&listSize=72`;
      
      logger.info(`Searching page ${currentPage}: ${searchUrl}`);
      
      // 페이지 이동
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
        break; // 검색 중단
      }
      
      // 응답 상태 확인 (V2 방식처럼 try 밖에서 체크)
      const status = response ? response.status() : 0;
      const currentUrl = page.url();
      logger.info(`Page ${currentPage} - Status: ${status}, URL: ${currentUrl}`);
      
      // HTTP 상태 코드로 차단 감지
      if (status === 403) {
        logger.error(`❌ HTTP 403 Forbidden - 쿠팡이 접근을 차단했습니다.`);
        searchBlocked = true;
        blockInfo = {
          type: 'HTTP_403_FORBIDDEN',
          status: status,
          error: 'HTTP 403 - 쿠팡이 접근을 차단했습니다',
          blockedAt: currentPage,
          url: searchUrl
        };
        break; // 검색 중단
      }
      
      if (status === 429) {
        logger.error(`❌ HTTP 429 Too Many Requests - 요청이 너무 많습니다.`);
        searchBlocked = true;
        blockInfo = {
          type: 'HTTP_429_TOO_MANY_REQUESTS',
          status: status,
          error: 'HTTP 429 - 너무 많은 요청으로 차단되었습니다',
          blockedAt: currentPage,
          url: searchUrl
        };
        break; // 검색 중단
      }

      // chrome-error URL은 네트워크 차단을 의미
      if (currentUrl.startsWith('chrome-error://')) {
        logger.error(`❌ 네트워크 레벨 차단 감지됨!`);
        logger.error(`차단된 URL: ${currentUrl}`);
        searchBlocked = true;
        blockInfo = {
          type: 'NETWORK_LEVEL_BLOCK',
          error: '네트워크 레벨에서 차단됨',
          blockedAt: currentPage,
          blockedUrl: currentUrl,
          url: searchUrl
        };
        break; // 검색 중단
      }
      
      logger.info(`✅ Page ${currentPage} loaded successfully`);

      // 페이지 초기 로드 대기 (1초로 단축)
      await page.waitForTimeout(1000);
      
      // 1페이지에서만 시크릿 모드 확인 및 스토리지 체크
      if (currentPage === 1) {
        // 시크릿 모드 확인
        const privacyCheck = await page.evaluate(() => {
          return {
            cookieEnabled: navigator.cookieEnabled,
            doNotTrack: navigator.doNotTrack,
            storageEstimate: 'storage' in navigator && 'estimate' in navigator.storage,
            indexedDBAvailable: 'indexedDB' in window,
            webDriverStatus: navigator.webdriver
          };
        });
        
        logger.info('🔒 프라이버시 상태:', privacyCheck);
        
        const storageInfo = await page.evaluate(() => {
          const info = {
            localStorageCount: 0,
            sessionStorageCount: 0,
            samples: {}
          };
          
          try {
            info.localStorageCount = localStorage.length;
            info.sessionStorageCount = sessionStorage.length;
            
            // 주요 항목 샘플링
            if (localStorage.getItem('searchHistory')) {
              info.samples.searchHistory = localStorage.getItem('searchHistory').substring(0, 100);
            }
            if (sessionStorage.getItem('recentKeywords')) {
              info.samples.recentKeywords = sessionStorage.getItem('recentKeywords').substring(0, 100);
            }
            
            // 스토리지 초기화
            localStorage.clear();
            sessionStorage.clear();
          } catch (e) {
            info.error = e.message;
          }
          
          return info;
        });
        
        logger.info(`📦 첫 페이지 로드 - LocalStorage: ${storageInfo.localStorageCount}개, SessionStorage: ${storageInfo.sessionStorageCount}개`);
        if (Object.keys(storageInfo.samples).length > 0) {
          logger.info('스토리지 샘플:', storageInfo.samples);
        }
        logger.info('✅ 스토리지 초기화 완료');
      }
      
      // "검색결과가 없습니다" 체크 및 에러 페이지 감지
      const quickCheck = await page.evaluate(() => {
        const noResultElement = document.querySelector('[class^=no-result_magnifier]');
        const noResultText = document.body?.innerText?.includes('에 대한 검색결과가 없습니다');
        const productList = document.querySelector('#product-list');
        const hasProductList = !!productList;
        const productCount = productList ? productList.querySelectorAll('li[data-id]').length : 0;
        
        // Firefox 에러 페이지 감지
        const bodyText = document.body?.innerText || '';
        const isErrorPage = bodyText.includes('Secure Connection Failed') || 
                           bodyText.includes('NS_ERROR_NET_INTERRUPT') ||
                           bodyText.includes('The connection to') ||
                           bodyText.includes('was interrupted') ||
                           bodyText.includes('The page you are trying to view');
        
        return {
          hasNoResult: !!noResultElement || !!noResultText,
          hasProductList: hasProductList,
          productCount: productCount,
          isErrorPage: isErrorPage,
          bodyPreview: bodyText.substring(0, 200)
        };
      });
      
      logger.info(`페이지 ${currentPage} 빠른 체크:`, quickCheck);
      
      // 에러 페이지 감지 시 즉시 차단 처리
      if (quickCheck.isErrorPage) {
        logger.error(`❌ 브라우저 에러 페이지 감지됨!`);
        logger.error(`페이지 내용: ${quickCheck.bodyPreview}`);
        searchBlocked = true;
        blockInfo = {
          type: 'BROWSER_ERROR_PAGE',
          error: 'Browser error page detected',
          blockedAt: currentPage,
          bodyPreview: quickCheck.bodyPreview,
          url: searchUrl
        };
        break; // 검색 중단
      }
      
      if (quickCheck.hasNoResult && currentPage === 1) {
        logger.warn(`검색 결과 없음 - "${config.testKeyword}"에 대한 검색결과가 없습니다.`);
        continue;
      }
      
      // 상품 리스트 대기
      if (!quickCheck.hasProductList || quickCheck.productCount === 0) {
        try {
          await page.waitForSelector('#product-list > li[data-id]', { timeout: 5000 });
          logger.info('상품 리스트 로드 완료');
        } catch (error) {
          logger.warn(`페이지 ${currentPage}: 상품 리스트를 찾을 수 없음 (waitForSelector timeout)`);
          
          // 디버깅을 위해 페이지 정보 확인
          const pageInfo = await page.evaluate(() => {
            const bodyText = document.body?.innerText || '';
            const productList = document.querySelector('#product-list');
            const allLis = document.querySelectorAll('li');
            
            // 추가 에러 체크
            const isErrorPage = bodyText.includes('Secure Connection Failed') || 
                               bodyText.includes('NS_ERROR_NET_INTERRUPT') ||
                               bodyText.includes('The connection to') ||
                               bodyText.includes('was interrupted');
            
            return {
              hasProductList: !!productList,
              productListChildren: productList ? productList.children.length : 0,
              totalLis: allLis.length,
              bodyPreview: bodyText.substring(0, 200),
              isErrorPage: isErrorPage
            };
          });
          logger.info('Debug - Page info:', pageInfo);
          
          // 에러 페이지인 경우 즉시 차단 처리
          if (pageInfo.isErrorPage) {
            logger.error(`❌ 상품 리스트 대기 중 에러 페이지 감지!`);
            searchBlocked = true;
            blockInfo = {
              type: 'BROWSER_ERROR_PAGE_IN_WAIT',
              error: 'Browser error page detected while waiting for products',
              blockedAt: currentPage,
              bodyPreview: pageInfo.bodyPreview,
              url: searchUrl
            };
            break; // 검색 중단
          }
          
          // 상품 리스트가 실제로 있다면 계속 진행
          if (!pageInfo.hasProductList) {
            continue;
          }
          logger.info('상품 리스트가 존재하므로 계속 진행합니다.');
        }
      }
        
      // 현재 페이지에서 모든 상품 정보 추출 (V2 코드 참고)
      const result = await page.evaluate((params) => {
        const { targetCode, pageNum } = params;
        // 쿠팡 상품 리스트 선택자 (#product-list > li[data-id])
        const products = document.querySelectorAll('#product-list > li[data-id]');
        console.log(`Found ${products.length} products on page ${pageNum}`);
          
        const pageProducts = [];
        let targetFound = null;
        const matchedProducts = []; // 매칭된 모든 상품들
        
        // 광고 상품 제외하고 필터링
        const filteredProducts = Array.from(products).filter(i => {
          const linkElement = i.querySelector('a');
          const adMarkElement = i.querySelector('[class*=AdMark]');
          const href = linkElement ? linkElement.getAttribute('href') : '';
          
          // 타겟 상품이 광고로 필터링되는지 확인
          if (i.dataset.id === '92984476751') {
            console.log('DEBUG - Target product filter check:', {
              dataId: i.dataset.id,
              hasAdMark: !!adMarkElement,
              href: href,
              isAd: href.includes('sourceType=srp_product_ads'),
              willBeFiltered: !!adMarkElement || href.includes('sourceType=srp_product_ads')
            });
          }
          
          return !adMarkElement && !href.includes('sourceType=srp_product_ads');
        });
        
        console.log(`Filtered to ${filteredProducts.length} non-ad products`);
        
        for (let i = 0; i < filteredProducts.length; i++) {
          const product = filteredProducts[i];
          const linkElement = product.querySelector('a');
            
            if (linkElement) {
              const href = linkElement.getAttribute('href');
              
            // URL에서 rank 및 제품 코드 추출
            const rankMatch = href.match(/rank=(\d+)/);
            const rank = rankMatch ? rankMatch[1] : null;
            
            const productIdMatch = href.match(/\/vp\/products\/(\d+)/);
            const itemIdMatch = href.match(/itemId=(\d+)/);
            const vendorItemIdMatch = href.match(/vendorItemId=(\d+)/);
            
            const productId = productIdMatch ? productIdMatch[1] : null;
            const itemId = itemIdMatch ? itemIdMatch[1] : null;
            const vendorItemId = vendorItemIdMatch ? vendorItemIdMatch[1] : null;
              
            // 상품명 추출
            const nameElement = product.querySelector('[class*=productName]');
            
            // 가격 추출
            let price = null;
            const priceElement = product.querySelector('[class*="Price_priceValue__"]');
            if (priceElement) {
              const priceText = priceElement.textContent || priceElement.innerText;
              const priceMatch = priceText.match(/[\d,]+/);
              if (priceMatch) {
                price = parseInt(priceMatch[0].replace(/,/g, ''));
              }
            }
            
            // 이미지 추출
            const imgElement = product.querySelector('img');
              
            const productInfo = {
              id: product.dataset.id,
              rank: rank || String(i + 1),
              realRank: i + 1, // 일단 페이지 내 순위, 나중에 전체 순위로 업데이트
              pageIndex: i + 1, // 페이지 내에서의 인덱스 (광고 제외)
              page: pageNum,
              productId: productId,
              itemId: itemId,
              vendorItemId: vendorItemId,
              name: nameElement ? nameElement.innerText || nameElement.textContent : 'Unknown',
              price: price,
              priceText: priceElement ? priceElement.textContent.trim() : null,
              image: imgElement ? imgElement.getAttribute('src') : null,
              url: `https://www.coupang.com${href}`
            };
              
              pageProducts.push(productInfo);
              
            // 디버깅: 첫 5개 상품 정보 출력
            if (i < 5) {
              console.log(`Product ${i + 1}:`, {
                id: productInfo.id,
                productId: productInfo.productId,
                itemId: productInfo.itemId,
                vendorItemId: productInfo.vendorItemId,
                name: productInfo.name.substring(0, 50),
                targetCode
              });
            }
            
            // 타겟 코드와 일치하는지 확인 (문자열 비교)
            const codeStr = String(targetCode);
            
            // 디버깅: 타겟 상품 체크
            if (productInfo.id === '92984476751' || productInfo.vendorItemId === '92984476751') {
              console.log(`DEBUG - Found target product candidate:`, {
                id: productInfo.id,
                vendorItemId: productInfo.vendorItemId,
                targetCode: targetCode,
                codeStr: codeStr,
                idMatch: String(productInfo.id) === codeStr,
                vendorMatch: String(productInfo.vendorItemId) === codeStr
              });
            }
            
            if (String(productInfo.id) === codeStr ||
                String(productInfo.productId) === codeStr ||
                String(productInfo.itemId) === codeStr ||
                String(productInfo.vendorItemId) === codeStr) {
              
              // 매칭된 상품 목록에 추가
              matchedProducts.push(productInfo);
              
              // 첫 번째 매칭이면 targetFound에 설정
              if (!targetFound) {
                targetFound = productInfo;
              }
              
              console.log(`Target product found! #${matchedProducts.length} - rank: ${productInfo.rank} (광고포함), realRank: ${productInfo.realRank} (광고제외), pageIndex: ${productInfo.pageIndex}`);
              
              // 찾은 상품을 시각적으로 강조
              product.style.border = '5px solid #ff0000';
              product.style.backgroundColor = '#ffff00';
              product.style.boxShadow = '0 0 20px rgba(255, 0, 0, 0.8)';
              product.style.transform = 'scale(1.05)';
              product.style.transition = 'all 0.3s ease';
              
              // 첫 번째 매칭 상품만 스크롤
              if (matchedProducts.length === 1) {
                product.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
              
              // 깜빡이는 애니메이션 추가
              let blink = true;
              const blinkInterval = setInterval(() => {
                product.style.opacity = blink ? '0.5' : '1';
                blink = !blink;
              }, 500);
              
              // 5초 후 애니메이션 중지
              setTimeout(() => {
                clearInterval(blinkInterval);
                product.style.opacity = '1';
              }, 5000);
            }
          }
        }
        
        // 매칭된 상품이 여러 개인 경우 로그
        if (matchedProducts.length > 1) {
          console.log(`페이지 ${pageNum}에서 ${matchedProducts.length}개의 매칭 상품 발견!`);
          matchedProducts.forEach((prod, idx) => {
            console.log(`  ${idx + 1}. ${prod.id} - ${prod.name.substring(0, 50)}...`);
          });
        }
        
        return { 
          found: targetFound !== null, 
          productCount: products.length,
          pageProducts: pageProducts,
          targetProduct: targetFound,
          allMatchedProducts: matchedProducts
        };
      }, { targetCode: config.testProductCode, pageNum: currentPage });
        
        // 이 페이지의 상품들을 전체 목록에 추가하면서 realRank 업데이트
        if (result.pageProducts && result.pageProducts.length > 0) {
          // 현재까지의 전체 상품 수를 기준으로 realRank 업데이트
          const currentTotalCount = allProducts.length;
          result.pageProducts.forEach((product, index) => {
            product.realRank = currentTotalCount + index + 1;
          });
          allProducts.push(...result.pageProducts);
        }
      
      logger.info(`Page ${currentPage} search result:`, { 
        found: result.found, 
        productCount: result.productCount,
        extractedCount: result.pageProducts ? result.pageProducts.length : 0
      });
      
      if (result.found) {
        foundProduct = result.targetProduct;
        
        // 여러 매칭이 있는 경우 로그
        if (result.allMatchedProducts && result.allMatchedProducts.length > 1) {
          logger.warn(`🔍 페이지 ${currentPage}에서 ${result.allMatchedProducts.length}개의 매칭 상품 발견!`);
          result.allMatchedProducts.forEach((prod, idx) => {
            logger.info(`  ${idx + 1}. [${prod.realRank}위] ${prod.id} - ${prod.name}`);
          });
          logger.info(`  → 첫 번째 상품을 선택했습니다.`);
        }
        
        // realRank 업데이트 (현재까지의 전체 상품 수 기준)
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
          vendorItemId: foundProduct.vendorItemId
        });
        
        // 시각적으로 강조된 상품을 볼 수 있도록 대기
        const waitTime = config.clickTargetProduct ? 3000 : config.highlightWaitTime;
        if (waitTime > 0) {
          logger.info(`🎨 타겟 상품을 시각적으로 강조했습니다. ${waitTime/1000}초 대기...`);
          await page.waitForTimeout(waitTime);
        } else {
          logger.info(`🎨 타겟 상품을 시각적으로 강조했습니다. (대기 시간: 0초)`);
        }
        
        // 클릭 설정이 true인 경우에만 상품 클릭
        if (config.clickTargetProduct) {
          // 타겟 상품 클릭
          try {
            logger.info('🖱️ 타겟 상품을 클릭합니다...');
            
            // 상품의 링크 요소를 찾아 클릭
            await page.evaluate((targetId) => {
              const targetProduct = document.querySelector(`li[data-id="${targetId}"]`);
              if (targetProduct) {
                const link = targetProduct.querySelector('a');
                if (link) {
                  // 클릭 전 한 번 더 강조
                  targetProduct.style.border = '8px solid #00ff00';
                  link.click();
                }
              }
            }, foundProduct.id);
            
            // 새 페이지 로드 대기
            await page.waitForLoadState('domcontentloaded');
            
            // 상품 상세 페이지 URL 확인
            const productUrl = page.url();
            logger.info(`✅ 상품 상세 페이지로 이동했습니다: ${productUrl}`);
            
            // 상품 상세 페이지에서 정보 추출
            await page.waitForTimeout(2000); // 페이지 안정화 대기
            
            try {
              const productDetails = await page.evaluate(() => {
                // 상품명
                const titleElement = document.querySelector('h2.prod-buy-header__title');
                const title = titleElement ? titleElement.textContent.trim() : '';
                
                // 가격
                const priceElement = document.querySelector('.total-price strong');
                const price = priceElement ? priceElement.textContent.trim() : '';
                
                // 판매자
                const sellerElement = document.querySelector('.prod-sale-vendor-name');
                const seller = sellerElement ? sellerElement.textContent.trim() : '';
                
                // 평점
                const ratingElement = document.querySelector('.prod-buy-header__score');
                const rating = ratingElement ? ratingElement.textContent.trim() : '';
                
                // 리뷰 수
                const reviewElement = document.querySelector('.prod-buy-header__review-count');
                const reviewCount = reviewElement ? reviewElement.textContent.trim() : '';
                
                return {
                  title,
                  price,
                  seller,
                  rating,
                  reviewCount,
                  url: window.location.href
                };
              });
              
              logger.info('📋 상품 상세 정보:');
              logger.info(`  - 상품명: ${productDetails.title}`);
              logger.info(`  - 가격: ${productDetails.price}`);
              logger.info(`  - 판매자: ${productDetails.seller}`);
              logger.info(`  - 평점: ${productDetails.rating}`);
              logger.info(`  - 리뷰 수: ${productDetails.reviewCount}`);
              
              // 상세 정보를 foundProduct에 추가
              foundProduct.detailInfo = productDetails;
              
            } catch (detailError) {
              logger.warn('상품 상세 정보 추출 실패:', detailError.message);
            }
            
            // 페이지에서 2초 더 대기
            await page.waitForTimeout(2000);
            
          } catch (error) {
            logger.error('상품 클릭 중 오류 발생:', error.message);
          }
        } else {
          logger.info('📌 클릭 설정이 비활성화되어 있습니다. (CLICK_TARGET_PRODUCT=false)');
        }
        
        // 타겟 상품을 찾았으므로 중단
        break;
      } else {
        logger.info(`Product not found on page ${currentPage} (extracted ${result.pageProducts ? result.pageProducts.length : 0} products)`);
      }
    }
    
    // 모든 상품 정보를 JSON 파일로 저장
    const jsonFileName = `products_${config.testKeyword}_${Date.now()}.json`;
    const jsonFilePath = path.join('logs', jsonFileName);
    
    const jsonData = {
      searchKeyword: config.testKeyword,
      targetCode: config.testProductCode,
      timestamp: new Date().toISOString(),
      totalProducts: allProducts.length,
      pagesSearched: maxPages,
      targetFound: foundProduct !== null,
      targetProduct: foundProduct,
      allProducts: allProducts
    };
    
    try {
      await fs.writeFile(jsonFilePath, JSON.stringify(jsonData, null, 2));
      logger.info(`✅ 상품 정보가 ${jsonFilePath}에 저장되었습니다`);
    } catch (error) {
      logger.error('JSON 파일 저장 실패:', error.message);
    }
    
    // 간단한 형식의 TXT 파일로도 저장
    const txtFileName = `simple_${config.testKeyword}_${Date.now()}.txt`;
    const txtFilePath = path.join('logs', txtFileName);
    
    try {
      let txtContent = `검색어: ${config.testKeyword}\n`;
      txtContent += `검색 시간: ${new Date().toLocaleString('ko-KR')}\n`;
      txtContent += `총 상품 수: ${allProducts.length}개\n`;
      txtContent += `타겟 코드: ${config.testProductCode}\n`;
      if (foundProduct) {
        txtContent += `\n★ 타겟 상품 발견! ★\n`;
        txtContent += `순위: ${foundProduct.realRank}위\n`;
        txtContent += `ID: ${foundProduct.id}\n`;
        txtContent += `productId: ${foundProduct.productId}\n`;
        txtContent += `상품명: ${foundProduct.name}\n`;
      }
      txtContent += `\n=== 전체 상품 목록 (realRank, id, name) ===\n\n`;
      
      // 모든 상품을 realRank 순으로 정렬
      const sortedProducts = [...allProducts].sort((a, b) => a.realRank - b.realRank);
      
      // realRank별로 그룹화
      const rankGroups = {};
      sortedProducts.forEach(product => {
        if (!rankGroups[product.realRank]) {
          rankGroups[product.realRank] = [];
        }
        rankGroups[product.realRank].push(product);
      });
      
      // 그룹화된 상품들을 출력
      Object.keys(rankGroups).sort((a, b) => parseInt(a) - parseInt(b)).forEach(rank => {
        const products = rankGroups[rank];
        if (products.length === 1) {
          // 단일 상품
          const product = products[0];
          const isTarget = product.id === foundProduct?.id ? ' ★' : '';
          txtContent += `${product.realRank}. ${product.id} - ${product.name}${isTarget}\n`;
        } else {
          // 중복 순위 상품들
          products.forEach((product, idx) => {
            const isTarget = product.id === foundProduct?.id ? ' ★' : '';
            const subIndex = String.fromCharCode(97 + idx); // a, b, c...
            txtContent += `${product.realRank}${subIndex}. ${product.id} - ${product.name}${isTarget}\n`;
          });
        }
      });
      
      await fs.writeFile(txtFilePath, txtContent, 'utf8');
      logger.info(`✅ 간단한 상품 목록이 ${txtFilePath}에 저장되었습니다`);
    } catch (error) {
      logger.error('TXT 파일 저장 실패:', error.message);
    }
    
    // 차단된 경우 에러 결과 반환
    if (searchBlocked) {
      logger.error('');
      logger.error('========================================');
      logger.error('❌ 검색 차단됨');
      logger.error(`차단 유형: ${blockInfo.type}`);
      logger.error(`차단 페이지: ${blockInfo.blockedAt}`);
      logger.error(`에러: ${blockInfo.error}`);
      logger.error(`검색어: ${config.testKeyword}`);
      logger.error(`추출된 상품: ${allProducts.length}개 (차단 전까지)`);
      logger.error('========================================');
      
      // JSON 파일에도 차단 정보 저장
      const jsonFileName = `blocked_${config.testKeyword}_${Date.now()}.json`;
      const jsonFilePath = path.join('logs', jsonFileName);
      
      const blockData = {
        searchKeyword: config.testKeyword,
        targetCode: config.testProductCode,
        timestamp: new Date().toISOString(),
        blocked: true,
        blockInfo: blockInfo,
        productsBeforeBlock: allProducts.length,
        allProducts: allProducts
      };
      
      try {
        await fs.writeFile(jsonFilePath, JSON.stringify(blockData, null, 2));
        logger.info(`❌ 차단 정보가 ${jsonFilePath}에 저장되었습니다`);
      } catch (error) {
        logger.error('JSON 파일 저장 실패:', error.message);
      }
      
      // 프로세스 종료
      logger.error('차단으로 인해 프로그램을 종료합니다.');
      process.exit(1);
    }
    
    // 결과 로깅
    if (foundProduct) {
      logger.info('');
      logger.info('========================================');
      logger.info('🎯 상품 검색 결과');
      logger.info(`검색어: ${config.testKeyword}`);
      logger.info(`상품 코드: ${config.testProductCode}`);
      logger.info(`순위: ${foundProduct.rank}위 (광고 포함)`);
      logger.info(`실제 순위: ${foundProduct.realRank}위 (광고 제외)`);
      logger.info(`페이지: ${foundProduct.page}`);
      logger.info(`상품명: ${foundProduct.name}`);
      logger.info(`가격: ${foundProduct.price ? foundProduct.price.toLocaleString() : 'N/A'}원`);
      logger.info(`총 추출된 상품 수: ${allProducts.length}개`);
      logger.info('========================================');
    } else {
      logger.info('');
      logger.info('========================================');
      logger.info('❌ 상품을 찾을 수 없음');
      logger.info(`검색어: ${config.testKeyword}`);
      logger.info(`상품 코드: ${config.testProductCode}`);
      logger.info(`검색한 페이지: ${maxPages}페이지`);
      logger.info(`총 추출된 상품 수: ${allProducts.length}개`);
      logger.info('========================================');
    }
    
    logger.info('');
    logger.info(`📄 상세 정보는 ${jsonFileName} 파일을 확인하세요`);
    logger.info(`📄 간단한 목록은 simple_${config.testKeyword}_*.txt 파일을 확인하세요`);
    
    // 페이지 정리 비활성화 (사용자 요청)
    // try {
    //   await page.goto('about:blank', { 
    //     waitUntil: 'domcontentloaded',
    //     timeout: 1000 
    //   });
    // } catch (error) {
    //   // 무시
    // }

    // Wait for user interaction
    logger.info('');
    logger.info('========================================');
    logger.info('🖥️  Browser GUI is now open and visible');
    logger.info(`📍 Position: ${config.window.x}, ${config.window.y}`);
    logger.info(`📐 Size: ${config.window.width}x${config.window.height}`);
    logger.info('');
    logger.info('You can interact with the browser window.');
    logger.info('Press Ctrl+C or Enter to close the browser and exit.');
    logger.info('========================================');
    logger.info('');

    // Keep browser open until user interaction
    await new Promise((resolve) => {
      // Ctrl+C, SIGTERM 처리
      process.on('SIGINT', resolve);
      process.on('SIGTERM', resolve);
      
      // Enter 키 입력 처리
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      
      process.stdin.on('data', (key) => {
        // Enter key (carriage return)
        if (key === '\r' || key === '\n') {
          resolve();
        }
        // Ctrl+C
        if (key === '\u0003') {
          resolve();
        }
      });
    });

  } catch (error) {
    logger.error('❌ Error during browser test:', {
      error: error.message,
      stack: error.stack
    });
  } finally {
    // Cleanup
    logger.info('Cleaning up...');
    
    // stdin을 정상 상태로 복원
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
    
    if (page) await page.close();
    if (context) await context.close();
    if (browser) await browser.close();
    
    logger.info('✅ Browser closed successfully');
    process.exit(0);
  }
}

// Handle unhandled errors
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error);
  process.exit(1);
});

// Check display environment
if (!config.headless && !process.env.DISPLAY) {
  logger.warn('⚠️  DISPLAY environment variable not set!');
  logger.warn('GUI might not be visible. Try setting: export DISPLAY=:0');
}

// Run the test
runBrowserTest();