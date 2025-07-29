# Firefox 차단 감지 테스트 가이드

## 📋 개요
서비스에 영향을 주지 않는 독립적인 Firefox 차단 감지 테스트 도구입니다.
API 호출 없이 차단을 **즉시 감지하고 빠르게 종료**하여 안전을 보장합니다.

## ⚡ 빠른 차단 감지 특징
- **500ms 내 1차 차단 감지**
- **차단 감지시 즉시 `process.exit(1)` 호출**
- **타임아웃/네트워크 오류도 차단으로 간주**
- **브라우저 실행 실패시에도 즉시 종료**

## 🔥 Firefox Nightly 설치

### Linux (Ubuntu/Debian)
```bash
# 방법 1: Snap 설치
sudo snap install firefox --channel=nightly

# 방법 2: 직접 다운로드
wget -O firefox-nightly.tar.bz2 "https://download.mozilla.org/?product=firefox-nightly-latest&os=linux64&lang=ko"
tar -xjf firefox-nightly.tar.bz2
sudo mv firefox /opt/firefox-nightly
sudo ln -s /opt/firefox-nightly/firefox /usr/local/bin/firefox-nightly
```

### Windows
1. https://www.mozilla.org/firefox/channel/desktop/#nightly 방문
2. Firefox Nightly 다운로드 및 설치
3. PATH에 `firefox-nightly` 추가

## 🚀 사용법

### 1. 의존성 설치
```bash
cd /home/tech/v3_hub_agent/dev_agent
npm install  # playwright가 이미 설치되어 있어야 함
```

### 2. 테스트 실행
```bash
./run-nightly-test.sh
```

또는 직접 실행:
```bash
AGENT_ID="firefox-nightly-test" node test-nightly.js
```

## 📊 테스트 내용

### 검색 키워드
- 무선이어폰
- 노트북
- 스마트워치
- 블루투스스피커
- 휴대용충전기

### 차단 감지 방식
1. **즉시 차단 감지 (500ms 내)**:
   - URL 신호: `error`, `blocked`, `captcha`, `forbidden`, `denied`
   - 제목 신호: `Error`, `차단`, `접근`, `거부`, `보안`
   - 페이지 상태: body 없음, 평가 실패
   - 내용 신호: `접근이 차단`, `보안 문자`, `captcha`

2. **네트워크 오류 감지**:
   - Navigation timeout
   - net:: 오류
   - Connection 실패

3. **브라우저 오류 감지**:
   - Launch 실패
   - Connect 실패
   - Browser 오류

**⚠️ 모든 차단 감지시 즉시 `process.exit(1)` 호출**

## 📈 결과 분석

### 성공 케이스
```
✅ Success: 무선이어폰 - 48 products
🎯 Target found at rank: 15
```

### 차단 케이스 (즉시 종료)
```
🚨 QUICK BLOCK DETECTED: Blocked URL signal: captcha in https://...
🛑 TERMINATING TEST IMMEDIATELY
```

### 네트워크 차단 (즉시 종료)
```
🚨 NETWORK/TIMEOUT ERROR - POSSIBLE BLOCK
🛑 TERMINATING TEST DUE TO POSSIBLE BLOCKING
```

### 브라우저 차단 (즉시 종료)
```
🚨 BROWSER LAUNCH FAILED - POSSIBLE SYSTEM BLOCK
🛑 TERMINATING TEST
```

## 📁 로그 파일
- 위치: `logs/nightly-test-YYYY-MM-DD.log`
- 형식: JSON + 텍스트 혼합
- 보관: 일별 파일 생성

## ⚙️ 설정 변경

### 테스트 키워드 변경
`test-nightly.js` 파일의 `config.testKeywords` 배열 수정:
```javascript
testKeywords: [
  '새로운키워드1',
  '새로운키워드2',
  // ...
]
```

### 상품 코드 변경
`config.testProductCodes` 배열 수정:
```javascript
testProductCodes: [
  '123456789',
  '987654321',
  // ...
]
```

### 기타 설정
```javascript
const config = {
  delayBetweenRequests: 1000,  // 요청 간 대기시간 (1초로 단축)
  maxPages: 3,                 // 최대 검색 페이지
  headless: false,             // 항상 GUI 모드
  logLevel: 'info',            // 로그 레벨
  exitOnBlock: true            // 차단 감지시 즉시 종료
};
```

## 🛡️ 보안 고려사항

1. **서비스 영향 없음**: API 호출 없이 독립 실행
2. **즉시 종료**: 차단 감지시 500ms 내 즉시 종료
3. **GUI 모드**: headless 모드 비활성화로 감지 회피
4. **User Agent**: Windows Firefox로 설정
5. **빠른 간격**: 1초 대기로 빠른 테스트 완료
6. **안전 우선**: 의심스러운 신호도 차단으로 간주

## 🔧 문제 해결

### Firefox Nightly 인식 안됨
```bash
# PATH 확인
which firefox-nightly

# 수동 경로 지정 (필요시 스크립트 수정)
export PATH="/opt/firefox-nightly:$PATH"
```

### 권한 에러
```bash
chmod +x run-nightly-test.sh
```

### Playwright 브라우저 설치
```bash
npx playwright install firefox
```

## 📞 문의
- 차단 발생시: 로그 파일과 함께 보고
- 새로운 테스트 케이스 요청 환영
- 성능 개선 제안 환영