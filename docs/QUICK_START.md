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

### 3단계: 에이전트 설정 (Windows VM)

```cmd
cd agent\

# 의존성 설치
npm install

# 브라우저 설치
npx playwright install chromium firefox msedge

# 환경변수 설정
copy .env.example .env
# .env 파일에서 HUB_URL을 http://u24.techb.kr:8545로 설정

# 에이전트 실행 (개발 예정)
npm start
```

### 4단계: API 테스트

```bash
# 헬스 체크
curl http://u24.techb.kr:8545/health

# 에이전트 상태 확인
curl http://u24.techb.kr:8545/api/v3/agents/status

# 쿠팡 순위 조회 테스트 (에이전트 필요)
curl "http://u24.techb.kr:8545/api/v3/coupang?keyword=노트북&code=83887459648&key=test-api-key-123"
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
npm run dev         # 개발 모드
npm run chrome      # 크롬 전용 실행
npm run firefox     # 파이어폭스 전용 실행
npm run edge        # 엣지 전용 실행
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
curl http://u24.techb.kr:8545/api/v3/agents/status

# 브라우저별 통계 확인
curl http://u24.techb.kr:8545/api/v3/coupang/stats?hours=24
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
   - 에이전트가 아직 개발되지 않음
   - Windows VM에서 에이전트 개발 필요
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

- **Chrome**: 가장 안정적, 기본 선택
- **Firefox**: 차단 회피에 효과적
- **Edge**: Windows 환경 최적화

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
sudo ufw allow 8445/tcp
sudo ufw allow 8446/tcp
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