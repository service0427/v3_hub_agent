const { chromium, firefox } = require('playwright');
const path = require('path');
const fs = require('fs').promises;

class BrowserManager {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.browser = null;
    this.context = null;
    this.browserInfo = {
      type: config.browserType,
      name: '',
      version: '',
    };
  }

  async initialize() {
    try {
      this.logger.info(`Initializing browser: ${this.config.browserType}, headless: ${this.config.headless}`);
      
      switch (this.config.browserType) {
        case 'chrome':
          return await this.initializeChrome();
        case 'firefox':
          return await this.initializeFirefox();
        case 'firefox-nightly':
          return await this.initializeFirefoxNightly();
        default:
          throw new Error(`Unsupported browser type: ${this.config.browserType}`);
      }
    } catch (error) {
      this.logger.error('Failed to initialize browser', {
        error: error.message,
        browserType: this.config.browserType
      });
      return false;
    }
  }

  async initializeChrome() {
    const userDataDir = path.join(this.config.userDataDir, `chrome_${this.config.instanceId}`);
    await this.ensureDirectory(userDataDir);

    const launchOptions = {
      headless: this.config.headless,
      channel: 'chrome',  // Use installed Chrome instead of Chromium
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox'
      ],
    };

    // Add window position for non-headless mode
    if (!this.config.headless) {
      const position = this.getWindowPosition(this.config.instanceId);
      launchOptions.args.push(
        `--window-position=${position.x},${position.y}`,
        `--window-size=${position.width},${position.height}`
      );
    }

    this.logger.info('Launching Chrome with options:', JSON.stringify(launchOptions));
    this.browser = await chromium.launch(launchOptions);
    const position = this.getWindowPosition(this.config.instanceId);
    this.context = await this.browser.newContext({
      userDataDir: userDataDir,
      viewport: { width: position.width, height: position.height },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
    });

    // Set extra headers
    await this.context.setExtraHTTPHeaders({
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    });

    this.browserInfo.name = 'Chrome';
    this.browserInfo.version = this.browser.version();
    
    this.logger.info('Chrome browser initialized', {
      version: this.browserInfo.version,
      userDataDir,
    });

    return true;
  }

  async initializeFirefoxWithDeveloperPrefs() {
    const userDataDir = path.join(this.config.userDataDir, `firefox-dev_${this.config.instanceId}`);
    await this.ensureDirectory(userDataDir);

    const launchOptions = {
      headless: this.config.headless,
      firefoxUserPrefs: {
        'dom.webdriver.enabled': false,
        'useAutomationExtension': false,
        'general.useragent.override': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
        'browser.toolbars.bookmarks.visibility': 'never',
        'devtools.theme': 'dark',
        'devtools.chrome.enabled': true,
        'browser.tabs.remote.autostart': true,
        'browser.tabs.remote.autostart.2': true,
      },
    };

    // Add window position for non-headless mode
    if (!this.config.headless) {
      const position = this.getWindowPosition(this.config.instanceId);
      launchOptions.args = [
        `--window-position=${position.x},${position.y}`,
        `--window-size=${position.width},${position.height}`
      ];
    }

    this.browser = await firefox.launch(launchOptions);
    const position = this.getWindowPosition(this.config.instanceId);
    this.context = await this.browser.newContext({
      viewport: { width: position.width, height: position.height },
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
    });

    // Set extra headers
    await this.context.setExtraHTTPHeaders({
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    });

    this.browserInfo.name = 'Firefox';  // Firefox로 표시
    this.browserInfo.version = this.browser.version();
    
    this.logger.info('Firefox browser initialized (as Nightly fallback)', {
      version: this.browserInfo.version,
      userDataDir,
    });

    return true;
  }

  async initializeFirefox() {
    const userDataDir = path.join(this.config.userDataDir, `firefox_${this.config.instanceId}`);
    await this.ensureDirectory(userDataDir);

    const launchOptions = {
      headless: this.config.headless,
      executablePath: '/usr/bin/firefox',  // 시스템 Firefox 경로 지정
      firefoxUserPrefs: {
        'dom.webdriver.enabled': false,
        'useAutomationExtension': false,
        'general.useragent.override': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      },
    };

    // Add window position for non-headless mode
    if (!this.config.headless) {
      const position = this.getWindowPosition(this.config.instanceId);
      launchOptions.args = [
        `--window-position=${position.x},${position.y}`,
        `--window-size=${position.width},${position.height}`
      ];
    }

    this.browser = await firefox.launch(launchOptions);
    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
    });

    // Set extra headers
    await this.context.setExtraHTTPHeaders({
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    });

    this.browserInfo.name = 'Firefox';
    this.browserInfo.version = this.browser.version();
    
    this.logger.info('Firefox browser initialized', {
      version: this.browserInfo.version,
      userDataDir,
    });

    return true;
  }

  async initializeFirefoxNightly() {
    const userDataDir = path.join(this.config.userDataDir, `firefox-nightly_${this.config.instanceId}`);
    await this.ensureDirectory(userDataDir);

    // Check multiple possible paths for Firefox Nightly
    const possiblePaths = [
      this.config.firefoxNightlyPath,
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
        this.logger.info('Found Firefox Nightly at:', { path });
        break;
      } catch (error) {
        // Continue to next path
      }
    }
    
    if (!nightlyPath) {
      this.logger.warn('Firefox Nightly not found, using regular Firefox with developer preferences');
      // Use regular Firefox with Nightly-like preferences
      return await this.initializeFirefoxWithDeveloperPrefs();
    }

    const launchOptions = {
      headless: this.config.headless,
      executablePath: nightlyPath,
      firefoxUserPrefs: {
        'dom.webdriver.enabled': false,
        'useAutomationExtension': false,
        'general.useragent.override': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
        // Nightly specific preferences
        'browser.tabs.remote.autostart': true,
        'browser.tabs.remote.autostart.2': true,
      },
    };

    // Add window position for non-headless mode
    if (!this.config.headless) {
      const position = this.getWindowPosition(this.config.instanceId);
      launchOptions.args = [
        `--window-position=${position.x},${position.y}`,
        `--window-size=${position.width},${position.height}`
      ];
    }

    this.browser = await firefox.launch(launchOptions);
    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
    });

    // Set extra headers
    await this.context.setExtraHTTPHeaders({
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    });

    this.browserInfo.name = 'Firefox Nightly';
    this.browserInfo.version = this.browser.version();
    
    this.logger.info('Firefox Nightly browser initialized', {
      version: this.browserInfo.version,
      userDataDir,
      executablePath: nightlyPath,
    });

    return true;
  }

  async ensureDirectory(dir) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  getWindowPosition(instanceId) {
    const screenWidth = 1920;
    const screenHeight = 1080;
    const cols = 2;
    const rows = 2;
    const windowWidth = Math.floor(screenWidth / cols);
    const windowHeight = Math.floor(screenHeight / rows);
    
    const index = (instanceId - 1) % 4;
    const col = index % cols;
    const row = Math.floor(index / cols);
    
    return {
      x: col * windowWidth,
      y: row * windowHeight,
      width: windowWidth,
      height: windowHeight
    };
  }

  async newPage() {
    if (!this.context) {
      throw new Error('Browser context not initialized');
    }
    
    const page = await this.context.newPage();
    
    // Add stealth configurations (Playwright uses addInitScript)
    await page.addInitScript(() => {
      // Override webdriver flag
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
      
      // Override plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });
      
      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
    });

    return page;
  }

  getBrowserInfo() {
    return this.browserInfo;
  }

  async close() {
    try {
      if (this.context) {
        await this.context.close();
      }
      if (this.browser) {
        await this.browser.close();
      }
      this.logger.info('Browser closed successfully');
    } catch (error) {
      this.logger.error('Error closing browser', { error: error.message });
    }
  }
}

module.exports = BrowserManager;