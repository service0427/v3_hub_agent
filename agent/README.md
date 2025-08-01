# V3 Agent - Chrome/Firefox/WebKit 통합 에이전트

쿠팡 키워드 순위를 체크하는 통합 에이전트입니다. Chrome, Firefox, WebKit 브라우저를 선택적으로 사용할 수 있습니다.

## 🚀 빠른 시작

### Chrome 실행 (기본값)
```bash
./run.sh
# 또는
./run-chrome.sh
```

### Firefox 실행
```bash
./run.sh firefox
# 또는
./run-firefox.sh
```

### WebKit 실행
```bash
./run.sh webkit
# 또는
./run-webkit.sh
```

## 📦 설치

### 자동 설치 (권장)
```bash
curl -sSL https://raw.githubusercontent.com/service0427/v3_hub_agent/main/agent/install.sh | bash
```

### 수동 설치
1. Node.js 설치 (v16 이상)
2. Chrome 또는 Firefox 브라우저 설치
3. 의존성 설치: `npm install`
4. 환경 설정: `cp .env.example .env`
5. 실행: `./run.sh [browser]`

### 재부팅 시 자동 실행 설정
```bash
# 자동 시작 설정
./setup-autostart.sh

# 자동 시작 제거
./remove-autostart.sh
```

## 🔧 환경 설정

### 필수 환경 변수 (.env)
```bash
HUB_API_URL=http://u24.techb.kr:3331  # Hub API 주소
BROWSER=chrome                         # 기본 브라우저 (chrome/firefox/webkit)
```

### 브라우저 선택
- **실행 시 지정**: `./run.sh firefox`
- **환경 변수**: `export BROWSER=firefox`
- **DB 설정**: v3_agent_config 테이블에서 browser 설정

## 📊 주요 기능

### 브라우저별 특징
- **Chrome**: 안정적, 빠른 속도
- **Firefox**: 페이지네이션 클릭 방식 지원
- **WebKit**: Safari 엔진, 실험적 지원

### 페이지 이동 방식
- **Chrome**: URL 직접 이동
- **Firefox**: 페이지네이션 버튼 클릭 (차단 회피)
- **WebKit**: URL 직접 이동

### WebKit 사용 시 주의사항
- **Linux**: 시스템 의존성 필수 설치
  ```bash
  sudo npx playwright install-deps webkit
  ```
- **Windows**: 지원되지 않음
- **macOS**: 별도 설치 없이 작동

### 실시간 통계
- 성공/실패/차단 건수
- 성공률 계산
- 경과 시간 표시
- 자동 대기 시간 조정

## 📁 디렉토리 구조

```
agent/
├── run.sh                # 메인 실행 스크립트
├── run-chrome.sh         # Chrome 전용 실행
├── run-firefox.sh        # Firefox 전용 실행
├── run-webkit.sh         # WebKit 전용 실행
├── check.js              # API 체크 스크립트
├── lib/
│   ├── api-client.js     # API 클라이언트
│   ├── batch-processor.js # 배치 처리
│   ├── browser-config.js # 브라우저 설정
│   ├── config.js         # 설정 관리
│   ├── crawler.js        # 크롤러
│   ├── logger.js         # 로거
│   ├── system-info.js    # 시스템 정보
│   └── validator.js      # 검증
├── logs/                 # 실행 로그
└── data/                 # 브라우저 데이터
```

## 🚀 자동 시작 설정

### 설정 방법
```bash
# 대화형 설정 (권장)
./setup-autostart.sh

# 옵션:
# 1) 모든 브라우저 자동 시작
# 2) Chrome만
# 3) Firefox만
# 4) WebKit만
# 5) 사용자 지정
```

### 자동 시작 동작
1. **OS 부팅 → GUI 로그인**
2. **네트워크 연결 대기** (최대 5분)
3. **Git 업데이트 확인**
4. **각 브라우저별 터미널 자동 실행**
   - Chrome: 좌측 상단
   - Firefox: 우측 상단
   - WebKit: 하단 중앙

### 지원 터미널
- gnome-terminal (Ubuntu 기본)
- konsole (KDE)
- xfce4-terminal (XFCE)
- mate-terminal (MATE)
- xterm (범용)

## 🛠️ 문제 해결

### Chrome 차단 시
- 자동으로 대기 시간이 증가합니다
- 최대 600초까지 대기

### Firefox 차단 시
- 페이지네이션 클릭 방식으로 회피 시도
- 3페이지 이후 차단 시 대기 시간 증가

### 브라우저 전환
- 한 브라우저가 차단되면 다른 브라우저로 전환
- 예: Chrome 차단 → Firefox로 실행

## 📝 로그

- 실행 로그: `logs/batch-check-api-*.log`
- 에러 로그: 콘솔에 실시간 표시
- 통계 정보: 화면 상단에 지속 표시

## 🔄 업데이트

### 자동 업데이트 (기본 활성화)
에이전트는 10분마다 자동으로 최신 버전을 확인하고 업데이트합니다.

**동작 방식**:
1. **시간 기반 체크**: 매 사이클마다 확인하되, 10분 간격 유지
2. **Lock 메커니즘**: 동시 실행 방지 (Chrome/Firefox 중복 방지)
3. **안전한 재시작**: 현재 작업 완료 후 재시작
4. **자동 롤백**: 업데이트 실패 시 백업에서 복원

**임시 파일 위치** (우선순위):
- `$HOME/v3-agent/.update/` (권장)
- `$HOME/.v3-agent-update/`
- `/tmp/v3-agent-update/`
- `/var/tmp/v3-agent-update/`

**Lock 파일**:
- `update.lock`: 업데이트 진행 중 표시
- `last-check`: 마지막 체크 시간 (timestamp)
- `update.pid`: 업데이트 프로세스 ID
- `restart-required`: 재시작 필요 플래그

### 수동 업데이트
```bash
# 대화형 업데이트 (권장)
v3-agent update

# 직접 git pull
cd ~/v3-agent
git pull origin main
npm install
```

### 업데이트 비활성화
```bash
# 로컬 변경사항이 있으면 자동으로 스킵됨
git diff  # 변경사항 확인
```

## ⚙️ 고급 설정

### DB 설정 (v3_agent_config)
- `browser`: 기본 브라우저 (chrome/firefox)
- `browser_close_delay`: 브라우저 닫기 지연 (ms)
- `max_pages`: 최대 검색 페이지 수
- `batch_size`: 배치 크기

### 브라우저 옵션
- Chrome: `--disable-blink-features=AutomationControlled`
- Firefox: `dom.webdriver.enabled=false`

## 📞 지원

문제가 있으면 로그를 확인하고 다음을 시도하세요:
1. 브라우저 전환 (Chrome ↔ Firefox)
2. 대기 시간 증가
3. Hub 서버 상태 확인
4. 네트워크 연결 확인