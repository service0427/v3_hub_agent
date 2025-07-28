# ParserHub V3 개발용 에이전트

소켓 연결 없이 로컬에서 브라우저 GUI를 직접 테스트하기 위한 개발용 에이전트입니다.

## 목적

- V3 에이전트의 GUI 표시 문제를 디버깅
- 브라우저별 실행 옵션 테스트
- 소켓 통신 없이 순수 브라우저 제어 테스트

## 사용 방법

### 1. 자동 실행 (권장)
```bash
./run.sh
```

### 2. 수동 실행

#### Chrome 테스트
```bash
npm install
export DISPLAY=:0
BROWSER_TYPE=chrome node src/index.js
```

#### Firefox 테스트
```bash
BROWSER_TYPE=firefox node src/index.js
```

#### Edge 테스트
```bash
BROWSER_TYPE=edge node src/index.js
```

## 환경 설정

`.env` 파일에서 다음 설정을 변경할 수 있습니다:

- `BROWSER_TYPE`: 브라우저 종류 (chrome/firefox/edge)
- `HEADLESS`: GUI 표시 여부 (false 권장)
- `WINDOW_WIDTH/HEIGHT`: 브라우저 창 크기
- `WINDOW_X/Y`: 브라우저 창 위치
- `TEST_URL`: 테스트할 URL
- `TEST_KEYWORD`: 검색 테스트 키워드

## 주요 기능

1. **GUI 표시 확인**: 브라우저가 화면에 실제로 표시되는지 확인
2. **창 위치/크기 제어**: 지정된 위치와 크기로 브라우저 창 열기
3. **스크린샷 캡처**: logs 폴더에 스크린샷 저장
4. **검색 테스트**: 쿠팡 검색 기능 테스트

## 문제 해결

### GUI가 표시되지 않을 때

1. DISPLAY 환경변수 확인:
```bash
echo $DISPLAY
# 없으면 설정:
export DISPLAY=:0
```

2. X11 서버 실행 확인:
```bash
ps aux | grep X
```

3. 브라우저 설치 확인:
```bash
which google-chrome
which firefox
```

## 로그 및 스크린샷

- 콘솔에 실시간 로그 출력
- `logs/` 폴더에 스크린샷 저장

## V2와의 차이점 분석

이 개발 에이전트를 통해 V2와 V3의 브라우저 실행 방식 차이를 분석하고, GUI 표시 문제를 해결할 수 있습니다.