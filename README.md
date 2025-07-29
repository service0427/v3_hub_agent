# ParserHub V3 - 쿠팡 전용 실시간 순위 조회 시스템

**GitHub**: https://github.com/service0427/v3_hub_agent

## 🎯 프로젝트 개요

ParserHub V3는 쿠팡 전용으로 특화된 실시간 제품 순위 조회 서비스입니다. 윈도우 VM 기반의 멀티 브라우저 에이전트를 활용하여 차단을 회피하고 안정적인 크롤링을 제공합니다.

## ✨ 주요 특징

- **🎯 쿠팡 전용**: 네이버 등 타 플랫폼 제거로 성능 최적화
- **🚀 원클릭 설치**: curl 명령어 하나로 에이전트 자동 설치
- **⚡ 실시간 조회**: 캐시 없이 에이전트 직접 크롤링
- **💰 과금 시스템**: keyword+code 조합별 일일 30원 과금
- **🛡️ 차단 회피**: 자동 대기 시간 조정으로 차단 회피

## 🏗️ 시스템 아키텍처

```
Client → Hub Server → Windows VM Agents
  ↓         ↓              ↓
Public     Agent         Chrome
API       Manager       Firefox
 ↓         ↓              Edge
Result ← Database ←    Coupang
                      Crawling
```

## 🚀 빠른 시작

### 1. 허브 서버 설정 (Ubuntu/Linux)

```bash
# 프로젝트 클론
git clone https://github.com/service0427/v3_hub_agent.git
cd v3_hub_agent/hub/

# 의존성 설치
npm install

# 환경변수 설정 (운영 DB 정보 포함)
cp .env.example .env
# .env 파일에서 포트 변경 (기본: 8545)

# 빌드 및 실행
npm run build
pm2 start dist/index.js --name parserhub-v3

# 또는 개발 모드
npm run dev
```

### 2. 에이전트 설치 (Linux)

#### 🚀 원클릭 설치 (권장)
```bash
curl -sSL https://raw.githubusercontent.com/service0427/v3_hub_agent/main/dev_agent/install.sh | bash
```

설치 완료 후:
```bash
# 새 터미널을 열거나
source ~/.bashrc

# 연속 실행 모드 시작
v3-agent start

# 또는 단일 체크 테스트
v3-agent check
```

#### 전역 명령어
- `v3-agent start` - 연속 실행 모드
- `v3-agent check [n]` - n개 키워드 체크
- `v3-agent status` - 실행 상태 확인
- `v3-agent logs` - 로그 확인
- `v3-agent update` - 최신 버전 업데이트

### 3. API 테스트

```bash
# 헬스 체크
curl "https://u24.techb.kr/v3/health"

# 쿠팡 API (에이전트 연결 필요)
curl "https://u24.techb.kr/v3/api/coupang?keyword=노트북&code=83887459648&key=test-api-key-123"
```

## 📋 API 사용법

### 기본 요청
```
GET https://u24.techb.kr/v3/api/coupang?keyword={keyword}&code={code}&key={key}
```

### 파라미터
- `keyword` (필수): 검색 키워드
- `code` (필수): 제품 코드
- `key` (필수): API 키
- `pages` (선택): 검색 페이지 수 (기본값: 1)
- `browser` (선택): 브라우저 지정 (chrome/firefox/firefox-nightly/edge/auto)

### 응답 예시
```json
{
  "success": true,
  "data": {
    "platform": "coupang",
    "keyword": "노트북",
    "code": "83887459648",
    "rank": 15,
    "realRank": 12,
    "product": {
      "name": "삼성 갤럭시북 프로",
      "price": 1299000,
      "thumbnail": "https://...",
      "rating": "4.5",
      "reviewCount": 1234
    },
    "browser": "chrome",
    "agentInfo": {
      "vmId": "WIN-VM-01",
      "browserVersion": "Chrome 120.0.6099.109"
    }
  },
  "timestamp": "2025-07-27T12:00:00+09:00",
  "executionTime": 3.2
}
```

## 💰 과금 시스템

### 과금 정책
- **일일 중복 제거**: 같은 keyword+code 조합은 하루 1회만 과금
- **고정 요금**: 조합당 30원
- **제한 없음**: API 사용량 제한 없음

### 과금 예시
```
오늘 요청:
1. keyword="노트북" + code="123" → 30원 (첫 요청)
2. keyword="노트북" + code="123" → 0원 (중복)
3. keyword="노트북" + code="456" → 30원 (새 조합)

총 과금: 60원
```

## 🐳 배포

### PM2를 이용한 배포
```bash
cd hub/
npm run deploy  # 자동 빌드 및 PM2 실행

# PM2 명령어
pm2 status          # 상태 확인
pm2 logs parserhub-v3   # 로그 확인
pm2 restart parserhub-v3  # 재시작
```

### 환경변수 설정 (.env)
```env
NODE_ENV=production
PORT=8545
DB_HOST=mkt.techb.kr
DB_PORT=5432
DB_USER=techb_pp
DB_PASS=Tech1324!
DB_NAME=productparser_db
```

## 📊 모니터링

### 상태 확인
```bash
# 허브 상태
curl https://u24.techb.kr/v3/health

# 에이전트 상태
curl https://u24.techb.kr/v3/api/agents/status
```

### 로그 확인
```bash
# 허브 로그
tail -f hub/logs/app.log

# 에이전트 로그
tail -f agent/logs/agent.log
```

## 🔧 개발 가이드

### 프로젝트 구조
```
v3_hub_agent/
├── hub/                    # 허브 서버 (TypeScript)
│   ├── src/
│   │   ├── api/           # API 엔드포인트
│   │   ├── agent/         # 에이전트 관리
│   │   ├── config/        # 설정 관리
│   │   ├── db/            # 데이터베이스 모델
│   │   ├── middleware/    # Express 미들웨어
│   │   ├── services/      # 비즈니스 로직
│   │   ├── types/         # TypeScript 타입
│   │   └── utils/         # 유틸리티
│   └── dist/              # 빌드 결과물
├── agent/                  # 에이전트 (JavaScript) - 개발 예정
├── docs/                   # 프로젝트 문서
└── scripts/               # DB 초기화 스크립트
```

### 개발 명령어
```bash
# 허브 개발 모드
cd hub/ && npm run dev

# 에이전트 개발 모드
cd agent/ && npm run dev

# 테스트
npm test

# 빌드
npm run build
```

## 📚 문서

- [빠른 시작 가이드](docs/QUICK_START.md)
- [데이터베이스 정보](docs/DATABASE_INFO.md)
- [GitHub 설정](docs/GITHUB_SETUP.md)

## 🔐 보안

- API 키 기반 인증
- 과금 데이터 영구 보존
- 브라우저별 차단 관리
- 요청 로깅 및 감사

## 🐛 문제 해결

### 일반적인 문제

1. **에이전트 연결 안됨**
   - GUI 환경에서 HEADLESS=false로 실행 필요
   - manage.sh를 사용하여 에이전트 실행

2. **포트 접속 불가**
   - 방화벽 설정 확인 필요
   - 포트 8545 개방 확인

3. **데이터베이스 연결 실패**
   - 운영 DB 접속 정보 확인
   - PostgreSQL 네트워크 연결 확인

### 지원

문제 발생 시 로그 파일과 함께 문의해 주세요.

## 🚧 개발 현황

### 완료
- ✅ Hub API 서버 (TypeScript/Express)
- ✅ PostgreSQL 데이터베이스 연동
- ✅ 쿠팡 API 엔드포인트
- ✅ 과금 시스템 (일일 중복 제거)
- ✅ Socket.io 에이전트 통신
- ✅ PM2 배포 스크립트
- ✅ Linux 에이전트 (Chrome 전용)
- ✅ 하트비트 모니터링 시스템
- ✅ 단순 롤링 전략
- ✅ 원클릭 설치 시스템 (curl 설치)

### 진행 예정
- ⏳ Windows VM 에이전트 개발
- ⏳ React 웹 프론트엔드
- ⏳ GitHub Actions CI/CD

---

**버전**: V3.0.0  
**개발 시작**: 2025-07-27  
**라이센스**: MIT
