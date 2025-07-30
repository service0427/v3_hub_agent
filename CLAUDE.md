# CLAUDE.md - ParserHub V3 프로젝트 가이드

## 🚨 중요: 응답 언어 정책
**모든 응답은 반드시 한국어로 작성해야 합니다.** (All responses must be written in Korean)

## 📋 프로젝트 개요
ParserHub V3는 **쿠팡 전용 실시간 제품 순위 조회 서비스**입니다.

**GitHub 저장소**: https://github.com/service0427/v3_hub_agent

### 핵심 특징
- **쿠팡 전용**: 네이버 등 타 플랫폼 지원 안함
- **Chrome 전용**: 안정성과 성능을 위해 Chrome 브라우저만 지원
- **실시간 조회**: 캐시 없이 에이전트 직접 크롤링
- **V2 격리**: 기존 V2 시스템과 완전히 분리된 환경에서 동작
- **단순 롤링**: 쿨다운 없이 모든 에이전트 순차 사용
- **무제한 사용**: API 호출량 제한 없음

## 🏗️ 시스템 아키텍처

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   Client Apps   │    │   Hub Server     │    │  Linux/Windows VM   │
│                 │    │   (Coupang Only) │    │                     │
│ - Coupang API   │◄──►│ - Single API     │◄──►│ ┌─────────────────┐ │
│   Only          │    │ - Agent Pool     │    │ │  Chrome Agents  │ │
└─────────────────┘    │ - Chrome Only    │    │ └─────────────────┘ │
                       └──────────────────┘    └─────────────────────┘
                              │                
                              ▼                
                       ┌──────────────────┐    
                       │   PostgreSQL     │    
                       │                  │    
                       │ - v3_api_keys    │
                       │ - v3_keyword_list │
                       │ - v3_ranking_checks│
                       └──────────────────┘
```

## 📁 프로젝트 구조

```
v3_hub_agent/
├── CLAUDE.md                     # 이 파일 (프로젝트 가이드)
├── README.md                     # 프로젝트 설명서
├── hub/                          # 허브 서버 (구현 완료)
│   ├── src/
│   │   ├── index.ts              # Express 서버 메인
│   │   ├── api/
│   │   │   ├── coupang.ts        # 쿠팡 API 엔드포인트
│   │   │   └── agents.ts         # 에이전트 상태 API
│   │   ├── agent/
│   │   │   └── manager.ts        # 에이전트 풀 관리
│   │   ├── config/
│   │   │   ├── index.ts          # 환경 설정
│   │   │   └── browser.ts        # Chrome 브라우저 설정
│   │   ├── db/
│   │   │   ├── connection.ts     # PostgreSQL 연결
│   │   │   └── models/
│   │   │       ├── ApiKey.ts     # v3_api_keys 모델
│   │   │       ├── KeywordList.ts # v3_keyword_list 모델
│   │   │       ├── RankingChecks.ts # v3_keyword_ranking_checks 모델
│   │   │       └── index.ts      # 모델 내보내기
│   │   ├── middleware/
│   │   │   ├── auth.ts           # API 키 인증
│   │   │   ├── errorHandler.ts   # 에러 처리
│   │   │   └── logger.ts         # HTTP 로깅
│   │   ├── services/
│   │   │   └── ranking.ts        # 순위 조회 비즈니스 로직
│   │   ├── types/
│   │   │   └── index.ts          # TypeScript 타입 정의
│   │   └── utils/
│   │       ├── logger.ts         # Winston 로거
│   │       └── validator.ts      # Joi 검증
│   ├── dist/                     # 빌드된 JavaScript
│   ├── logs/                     # 로그 파일
│   ├── deploy.sh                 # PM2 배포 스크립트
│   ├── package.json
│   └── tsconfig.json
├── agent/                        # 윈도우 VM 에이전트 (현재 미사용)
│   └── (dev_agent 개발 완료 후 사용 예정)
├── dev_agent/                    # 개발용 에이전트 (사용 중)
│   ├── run-continuous-stats.sh   # 연속 실행 + 통계 모니터링
│   ├── batch-check-api-simple.js # 간결한 API 체크
│   ├── package.json              # 의존성 관리
│   ├── README.md                 # 사용 가이드
│   ├── logs/                     # 실행 로그
│   └── _archived/                # 이전 개발 파일들
├── docs/                         # 프로젝트 문서
│   ├── QUICK_START.md            # 빠른 시작 가이드
│   ├── DATABASE_INFO.md          # DB 연결 정보
│   └── GITHUB_SETUP.md           # GitHub 설정
└── scripts/
    └── init-db.sql               # V3 테이블 생성 SQL
```

## 🔌 API 설계

### 쿠팡 전용 Public API
```
GET https://u24.techb.kr/v3/api/coupang?keyword={keyword}&code={code}&pages={pages}&key={key}&browser={browser}
```

### 파라미터
- `keyword` (필수): 검색 키워드
- `code` (필수): 제품 코드  
- `pages` (선택): 검색 페이지 수 (기본값: 1)
- `key` (필수): API 키
- `browser` (선택): 브라우저 지정 (chrome/firefox/edge/auto)

## 💾 데이터베이스 스키마

### 주요 테이블
- **v3_api_keys**: API 키 관리
- **v3_keyword_list**: 검색 키워드 및 상품 정보
- **v3_keyword_ranking_checks**: 순위 체크 결과 (10분 간격 최대 10회)
- **v3_agent_stats**: 에이전트 일별 통계
- **v3_agent_errors**: 에이전트 에러 로그
- **v3_agent_health**: 에이전트 상태 모니터링

## 🚨 에이전트 실행 정책
- **절대 headless 모드로 작동하지 않음**
- **실제 브라우저를 GUI로 띄워놓고 통신하는 방식만 사용**
- **에이전트는 GUI 환경에서만 실행 가능**
- **HEADLESS=false 설정 필수**
- **원격 서버에서는 사용자가 직접 GUI 모드로 실행**

### 현재 사용 중인 에이전트
- **dev_agent**: 개발/테스트용 에이전트
  - `run-continuous-stats.sh`: 실시간 통계와 함께 연속 실행
  - Hub API와 통신하여 키워드 순위 체크
  - 차단 감지 및 자동 대기 시간 조정

## 🔧 개발 환경 설정

### 데이터베이스 설정 (PostgreSQL)
```bash
# 1. PostgreSQL 접속 (운영 DB)
psql -h mkt.techb.kr -U techb_pp -d productparser_db

# 2. V3용 테이블 생성
\i scripts/init-db.sql

# 3. 연결 확인
SELECT * FROM v3_keyword_list;
```

**운영 DB 접속 정보**:
- Host: `mkt.techb.kr`
- Port: `5432`
- Database: `productparser_db`
- User: `techb_pp`
- Password: `Tech1324!`

### 허브 서버 (Ubuntu/Linux)
```bash
cd hub/
npm install

# .env 파일 설정 (운영 DB 정보 입력)
cp .env.example .env

npm run dev  # 개발 모드
```

### 에이전트 (Windows VM)
```cmd
cd agent/
npm install
node src/index.js  # 에이전트 실행
```

## 🚀 배포 가이드

### Docker 배포 (허브)
```bash
cd hub/
docker-compose up -d
```

### 에이전트 배포
1. Node.js 설치
2. Chrome 브라우저 설치
3. 원클릭 설치: `curl -sSL https://raw.githubusercontent.com/service0427/v3_hub_agent/main/dev_agent/install.sh | bash`

## 📊 모니터링

### 로그 위치
- 허브 서버: `hub/logs/`
- 에이전트: `agent/logs/`

### 주요 메트릭
- API 요청 수
- 에이전트별 성공률
- 차단 발생률
- 응답 시간

## 🔐 보안 고려사항

- API 키 기반 인증
- 에이전트별 차단 관리
- 로그 데이터 보안
- PostgreSQL 단일 DB 사용

## 📞 문제 해결

### 일반적인 문제
1. **에이전트 연결 안됨**: 방화벽 설정 확인
2. **Chrome 차단**: 대기 시간 자동 증가로 회피
3. **순위 조회 실패**: 연속 3회 실패 시 자동 중단

### 로그 확인
```bash
# 허브 로그
tail -f hub/logs/app.log

# 에이전트 로그  
tail -f agent/logs/agent.log
```

## 📚 참고 문서

프로젝트 개발 시 자주 참조해야 할 중요 문서들:
- **데이터베이스 정보**: `/home/tech/v3_hub_agent/docs/DATABASE_INFO.md`
- **GitHub 설정 가이드**: `/home/tech/v3_hub_agent/docs/GITHUB_SETUP.md`
- **빠른 시작 가이드**: `/home/tech/v3_hub_agent/docs/QUICK_START.md`

## 🌐 웹 프론트엔드 계획
- **기술 스택**: React + TypeScript + Tailwind CSS + Vite
- **개발 시점**: API 서버 완성 후 진행
- **주요 기능**: 실시간 순위 조회, 사용량 통계, API 키 관리

## 🔧 개발 정책

### 파일 관리 원칙
- **새 파일 생성 최소화**: 가능한 기존 파일을 수정하여 사용
- **불필요한 파일 삭제**: 사용하지 않는 파일은 즉시 삭제
- **문서 최신화**: 개발 내용은 즉시 문서에 반영
- **중복 방지**: 동일한 기능의 파일은 하나만 유지

### 코드 품질
- **주석 최소화**: 코드 자체가 설명이 되도록 작성
- **타입 안전성**: TypeScript의 타입 시스템 적극 활용
- **에러 처리**: 모든 에러는 적절히 처리하고 로깅

### 데이터 정책
- **순위 체크 제한**: 30분 간격으로 최대 10회 체크
- **자동 중단**: 연속 3회 순위 0일 경우 자동 중단
- **재시작 가능**: 수동으로 is_completed=FALSE 설정 시 재시작
- **단일 DB 사용**: PostgreSQL만 사용 (MySQL 분리)

---

**개발 시작일**: 2025-07-27  
**대상 버전**: ParserHub V3.0.0  
**개발 환경**: Linux(허브) + Linux/Windows(에이전트)