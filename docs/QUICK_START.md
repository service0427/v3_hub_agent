# ParserHub V3 빠른 시작 가이드

## 🚀 10분 만에 V3 셋업하기

### 1단계: 데이터베이스 설정

```bash
# 운영 DB 접속 (이미 설정되어 있음)
psql -h mkt.techb.kr -U techb_pp -d productparser_db

# V3 테이블 초기화 (최초 1회)
\i scripts/init-db.sql

# 테이블 확인
\dt v3_*
```

### 2단계: 허브 서버 실행

```bash
cd hub/

# 의존성 설치
npm install

# 환경변수 설정
cp .env.example .env
# .env 파일에서 포트 확인 (기본: 8545)

# 빌드 및 PM2 실행
npm run build
pm2 start dist/index.js --name parserhub-v3

# 또는 개발 모드
npm run dev
```

### 3단계: 에이전트 설정 (Linux/Windows)

```bash
cd agent/

# 의존성 설치
npm install

# 브라우저 설치
npx playwright install chromium firefox

# Firefox Nightly 설치 (선택)
wget -O firefox-nightly.tar.bz2 "https://download.mozilla.org/?product=firefox-nightly-latest&os=linux64"
tar -xjf firefox-nightly.tar.bz2
sudo mv firefox /usr/bin/firefox-nightly

# 환경변수 설정
cp .env.example .env
# .env 파일 편집
# - HUB_URL=https://u24.techb.kr
# - HEADLESS=false (GUI 모드 필수)
# - AGENT_ID=LINUX-3301
# - BROWSER_TYPE=chrome

# 에이전트 실행
./manage.sh  # 관리 도구 사용 (권장)
# 또는
npm start    # 직접 실행
```

### 4단계: API 테스트

```bash
# 헬스 체크
curl https://u24.techb.kr/v3/health

# 에이전트 상태 확인
curl https://u24.techb.kr/v3/api/agents/status

# 쿠팡 순위 조회 테스트 (에이전트 필요)
curl "https://u24.techb.kr/v3/api/coupang?keyword=노트북&code=83887459648&key=test-api-key-123"
```

## 🔧 개발 환경 설정

### 허브 서버 개발
```bash
cd hub/
npm run dev          # 개발 모드 (핫 리로드)
npm run build        # 빌드
npm run start        # 프로덕션 모드
npm test            # 테스트 실행
npm run lint        # 린트 검사
```

### 에이전트 개발
```bash
cd agent/
npm start           # 기본 실행 (.env 설정에 따름)
./manage.sh         # 관리 도구 (시작/중지/재시작)

# manage.sh 메뉴:
# 1) 상태 보기
# 2) 단일 에이전트 시작 (3301/3302/3303 선택)
# 3) 모든 에이전트 시작
# 4) 단일 에이전트 정지
# 5) 모든 에이전트 정지
# 6) 모든 에이전트 재시작
# 7) 로그 보기
```

## 🚀 PM2로 서버 관리

### 배포 스크립트 사용
```bash
cd hub/
npm run deploy  # 자동으로 빌드하고 PM2 시작
```

### PM2 명령어
```bash
pm2 status              # 프로세스 상태 확인
pm2 logs parserhub-v3   # 로그 확인
pm2 restart parserhub-v3 # 재시작
pm2 stop parserhub-v3    # 중지
pm2 delete parserhub-v3  # 삭제
```

## 📊 모니터링 설정

### 로그 확인
```bash
# 허브 로그
tail -f hub/logs/app.log

# 에이전트 로그
tail -f agent/logs/agent.log
```

### 시스템 상태 확인
```bash
# 에이전트 상태
curl https://u24.techb.kr/v3/api/agents/status

# 브라우저별 통계 확인
curl https://u24.techb.kr/v3/api/coupang/stats?hours=24
```

## 🔍 문제 해결

### 일반적인 문제들

1. **포트 충돌**
   ```bash
   # 포트 사용 확인
   netstat -tlnp | grep :8545
   ```

2. **데이터베이스 연결 실패**
   ```bash
   # 운영 DB 연결 테스트
   psql -h mkt.techb.kr -U techb_pp -d productparser_db -c "SELECT 1;"
   
   # V3 테이블 확인
   psql -h mkt.techb.kr -U techb_pp -d productparser_db -c "\dt v3_*"
   ```

3. **에이전트 연결 안됨**
   - GUI 환경에서 HEADLESS=false로 실행 필요
   - manage.sh 사용하여 에이전트 상태 확인
   - Socket.io는 HTTP와 같은 포트(8545) 사용

### 디버그 모드

```bash
# 허브 디버그 모드
LOG_LEVEL=debug npm run dev

# 에이전트 디버그 모드
LOG_LEVEL=debug npm start
```

## 📈 성능 최적화

### 권장 시스템 사양

**허브 서버**:
- CPU: 2 코어 이상
- RAM: 4GB 이상
- 디스크: 20GB 이상

**에이전트 (Windows VM)**:
- CPU: 4 코어 이상
- RAM: 8GB 이상
- 디스크: 50GB 이상

### 브라우저별 권장사항

- **Chrome**: 가장 안정적, 기본 선택 (포트 3301)
- **Firefox**: 차단 회피에 효과적 (포트 3302)
- **Firefox Nightly**: 최신 기능 테스트 (포트 3303)
- **Edge**: Windows 환경 최적화 (Windows에서만)

## 🔐 보안 설정

### API 키 관리
```sql
-- 새 API 키 생성
INSERT INTO v3_api_keys (api_key, name, description) 
VALUES ('your-api-key', 'Production Key', 'Live service');

-- API 키 비활성화
UPDATE v3_api_keys SET is_active = false WHERE api_key = 'old-key';
```

### 방화벽 설정
```bash
# Ubuntu UFW 예시
sudo ufw allow 8545/tcp  # Hub 서버 포트
sudo ufw enable
```

## 📞 지원

문제가 발생하면 다음 정보와 함께 문의하세요:

1. 로그 파일 (`hub/logs/app.log`, `agent/logs/agent.log`)
2. 환경 정보 (OS, Node.js 버전)
3. 에러 메시지
4. 재현 단계

---

이제 ParserHub V3를 사용할 준비가 완료되었습니다! 🎉