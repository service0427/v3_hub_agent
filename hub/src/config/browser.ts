import os from 'os';
import { config } from './index';

export type BrowserType = 'chrome' | 'firefox' | 'edge';

// OS별 브라우저 지원 매핑
const browserSupportMatrix: Record<string, BrowserType[]> = {
  linux: ['chrome', 'firefox'], // Linux에서는 Edge 미지원
  darwin: ['chrome', 'firefox', 'edge'], // macOS
  win32: ['chrome', 'firefox', 'edge'], // Windows
};

/**
 * 현재 OS에서 지원하는 브라우저 목록 반환
 */
export function getOSSupportedBrowsers(): BrowserType[] {
  const platform = os.platform();
  return browserSupportMatrix[platform] || ['chrome', 'firefox'];
}

/**
 * 현재 환경에서 실제 사용 가능한 브라우저 목록 반환
 * (환경 설정과 OS 지원의 교집합)
 */
export function getAvailableBrowsers(): BrowserType[] {
  const osSupportedBrowsers = getOSSupportedBrowsers();
  const configuredBrowsers = config.browser.supported as BrowserType[];
  
  return configuredBrowsers.filter(browser => 
    osSupportedBrowsers.includes(browser)
  );
}

/**
 * 특정 브라우저가 현재 환경에서 사용 가능한지 확인
 */
export function isBrowserAvailable(browser: BrowserType): boolean {
  const availableBrowsers = getAvailableBrowsers();
  return availableBrowsers.includes(browser);
}

/**
 * 브라우저 선택 (자동 또는 지정)
 */
export function selectBrowser(preferredBrowser?: string): BrowserType | null {
  const availableBrowsers = getAvailableBrowsers();
  
  if (availableBrowsers.length === 0) {
    return null;
  }

  // 선호 브라우저가 지정되고 사용 가능한 경우
  if (preferredBrowser && isBrowserAvailable(preferredBrowser as BrowserType)) {
    return preferredBrowser as BrowserType;
  }

  // 자동 선택: 첫 번째 사용 가능한 브라우저
  return availableBrowsers[0];
}

/**
 * 현재 OS 정보 반환
 */
export function getOSInfo() {
  return {
    platform: os.platform(),
    type: os.type(),
    release: os.release(),
    arch: os.arch(),
  };
}

/**
 * 브라우저 설정 상태 로깅
 */
export function logBrowserConfiguration(): void {
  const osInfo = getOSInfo();
  const osSupportedBrowsers = getOSSupportedBrowsers();
  const availableBrowsers = getAvailableBrowsers();
  
  console.log('Browser Configuration:');
  console.log(`  OS: ${osInfo.platform} (${osInfo.type} ${osInfo.release})`);
  console.log(`  OS Supported Browsers: ${osSupportedBrowsers.join(', ')}`);
  console.log(`  Configured Browsers: ${config.browser.supported.join(', ')}`);
  console.log(`  Available Browsers: ${availableBrowsers.join(', ')}`);
  
  // Edge 미지원 경고 (Linux)
  if (osInfo.platform === 'linux' && config.browser.supported.includes('edge')) {
    console.warn('  ⚠️  Warning: Edge browser is not supported on Linux, it will be excluded');
  }
}