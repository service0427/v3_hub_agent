# Firefox Nightly 테스트 가이드

## 📋 개요
서비스에 영향을 주지 않는 독립적인 Firefox Nightly 테스트 도구입니다.
API 호출 없이 단순히 차단 우회 및 검색 기능만 테스트합니다.

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

### 테스트 항목
1. **차단 감지**: 
   - URL 기반 차단 (`error`, `blocked`, `captcha`)
   - 제목 기반 차단 (`Error`, `차단`, `접근이 거부`)
   - 내용 기반 차단 (`접근이 차단`, `보안 문자`, `captcha`)

2. **검색 기능**:
   - 검색 결과 존재 여부
   - 상품 개수 확인
   - 목표 상품 순위 찾기 (테스트용)

3. **안정성 테스트**:
   - 페이지 로딩 성공률
   - 에러 발생률
   - 브라우저 안정성

## 📈 결과 분석

### 성공 케이스
```
✅ Success: 무선이어폰 - 48 products
🎯 Target found at rank: 15
```

### 차단 케이스
```
❌ BLOCKED: Blocked content detected in page
```

### 실패 케이스
```
❌ Failed: 무선이어폰 - Navigation timeout
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
  delayBetweenRequests: 3000,  // 요청 간 대기시간 (ms)
  maxPages: 3,                 // 최대 검색 페이지
  headless: false,             // 항상 GUI 모드
  logLevel: 'info'             // 로그 레벨
};
```

## 🛡️ 보안 고려사항

1. **서비스 영향 없음**: API 호출 없이 독립 실행
2. **GUI 모드**: headless 모드 비활성화로 감지 회피
3. **User Agent**: Windows Firefox로 설정
4. **요청 간격**: 3초 대기로 과도한 요청 방지

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