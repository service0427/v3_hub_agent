# ParserHub V3 배포 가이드

## 시스템 요구사항

### 허브 서버 (Linux)
- Ubuntu 20.04 이상
- Node.js 18.x 이상
- PostgreSQL 13 이상
- RAM 4GB 이상
- 포트 8545 개방

### 에이전트 (Linux/Windows)
- Linux: Ubuntu 20.04 이상 / Windows: Windows 10 이상
- Node.js 18.x 이상
- RAM 8GB 이상 (브라우저당 2GB 권장)
- Chrome, Firefox 설치 필요

## 1. 허브 서버 배포

### 1.1 코드 다운로드
```bash
git clone https://github.com/service0427/v3_hub_agent.git
cd v3_hub_agent/hub
```

### 1.2 의존성 설치
```bash
npm install
```

### 1.3 환경 설정
```bash
cp .env.example .env
nano .env
```

주요 설정:
```env
NODE_ENV=production
PORT=8545
DB_HOST=localhost
DB_PORT=5432
DB_USER=techb_pp
DB_PASS=Tech1324!
DB_NAME=productparser_db
LOG_LEVEL=info
```

### 1.4 데이터베이스 초기화
```bash
psql -h localhost -U techb_pp -d productparser_db -f ../scripts/init-db.sql
```

### 1.5 빌드 및 실행
```bash
npm run build
npm run deploy
```

### 1.6 PM2로 관리
```bash
# 상태 확인
pm2 status

# 로그 확인
pm2 logs parserhub-v3

# 재시작
pm2 restart parserhub-v3

# 중지
pm2 stop parserhub-v3
```

## 2. 에이전트 배포

### 2.1 코드 준비
```bash
cd v3_hub_agent/agent
npm install
```

### 2.2 브라우저 설치
```bash
# Playwright 브라우저 설치
npx playwright install chromium
npx playwright install firefox

# Firefox Nightly 설치 (V3 지원)
wget -O firefox-nightly.tar.bz2 "https://download.mozilla.org/?product=firefox-nightly-latest&os=linux64"
tar -xjf firefox-nightly.tar.bz2
sudo mv firefox /usr/bin/firefox-nightly
```

### 2.3 환경 설정

#### 단일 에이전트 (3301)
```bash
nano .env
```

```env
AGENT_ID=LINUX-3301
INSTANCE_ID=3301
BROWSER_TYPE=chrome
HUB_URL=https://u24.techb.kr
API_KEY=test-api-key-123
HEADLESS=false  # V3는 GUI 모드 필수
```

### 2.4 에이전트 실행

#### manage.sh 사용 (권장)
```bash
chmod +x manage.sh
./manage.sh

# 메뉴에서 선택:
# 2) 단일 에이전트 시작 (3301)
# 3) 다중 에이전트 시작 (3301-3304)
```

#### 직접 실행
```bash
# 단일 에이전트
npm start

# 백그라운드 실행
nohup npm start > logs/agent_3301.log 2>&1 &
```

#### 다중 에이전트 실행
```bash
# 3301~3304 에이전트 동시 실행
for port in 3301 3302 3303 3304; do
    AGENT_ID=LINUX-$port INSTANCE_ID=$port nohup node src/index.js > logs/agent_$port.log 2>&1 &
    sleep 2
done
```

## 3. Docker 배포 (허브 서버)

### 3.1 Docker Compose 설정
```yaml
version: '3.8'

services:
  hub:
    build: ./hub
    ports:
      - "8545:8545"
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - DB_USER=techb_pp
      - DB_PASS=Tech1324!
      - DB_NAME=productparser_db
    depends_on:
      - postgres
    restart: unless-stopped

  postgres:
    image: postgres:13
    environment:
      - POSTGRES_USER=techb_pp
      - POSTGRES_PASSWORD=Tech1324!
      - POSTGRES_DB=productparser_db
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init.sql
    restart: unless-stopped

volumes:
  postgres_data:
```

### 3.2 실행
```bash
docker-compose up -d
docker-compose logs -f
```

## 4. 시스템 모니터링

### 4.1 허브 서버 모니터링
```bash
# API 상태 확인
curl https://u24.techb.kr/v3/health

# 에이전트 상태 확인
curl https://u24.techb.kr/v3/api/agents/status

# 롤링 상태 확인 (사용 순서, 차단 기록)
curl https://u24.techb.kr/v3/api/agents/rolling-status

# 헬스 체크 상태
curl https://u24.techb.kr/v3/api/agents/health

# PM2 모니터링
pm2 monit
```

### 4.2 에이전트 모니터링
```bash
# 프로세스 확인
ps aux | grep "v3_hub_agent/agent.*node"

# 로그 확인
tail -f logs/agent_*.log

# 리소스 사용량
htop
```

## 5. 문제 해결

### 5.1 허브 서버 문제

#### 포트 충돌
```bash
# 8545 포트 사용 확인
sudo lsof -i :8545

# 다른 포트로 변경
PORT=8546 npm start
```

#### 데이터베이스 연결 실패
```bash
# PostgreSQL 상태 확인
sudo systemctl status postgresql

# 연결 테스트
psql -h localhost -U techb_pp -d productparser_db -c "SELECT 1"
```

### 5.2 에이전트 문제

#### 브라우저 실행 실패
```bash
# X Server 오류 시 (Linux)
export DISPLAY=:0
xhost +

# 주의: V3는 GUI 모드만 지원 (HEADLESS=false 필수)
# VNC나 실제 데스크톱 환경에서 실행 필요
```

#### 허브 연결 실패
```bash
# 네트워크 연결 확인
ping u24.techb.kr
telnet u24.techb.kr 8545

# 방화벽 확인
sudo ufw status
```

## 6. 보안 설정

### 6.1 방화벽 설정
```bash
# 허브 서버 포트 개방
sudo ufw allow 8545/tcp

# 특정 IP만 허용
sudo ufw allow from 220.78.239.115 to any port 8545
```

### 6.2 환경 변수 보안
```bash
# .env 파일 권한 설정
chmod 600 .env

# 민감한 정보는 환경 변수로
export DB_PASS='your-secure-password'
```

## 7. 백업 및 복구

### 7.1 데이터베이스 백업
```bash
# 전체 백업
pg_dump -h localhost -U techb_pp productparser_db > backup_$(date +%Y%m%d).sql

# V3 테이블만 백업
pg_dump -h localhost -U techb_pp -t 'v3_*' productparser_db > v3_backup_$(date +%Y%m%d).sql
```

### 7.2 복구
```bash
psql -h localhost -U techb_pp productparser_db < backup_20250127.sql
```

## 8. 업데이트

### 8.1 코드 업데이트
```bash
# 허브 서버
cd v3_hub_agent/hub
git pull
npm install
npm run build
pm2 restart parserhub-v3

# 에이전트
cd v3_hub_agent/agent
git pull
npm install
# manage.sh에서 5번 선택 (재시작)
```

## 9. 성능 최적화

### 9.1 허브 서버
- PM2 클러스터 모드 사용
- PostgreSQL 연결 풀 크기 조정
- 로그 레벨을 'error'로 설정 (프로덕션)

### 9.2 에이전트
- 브라우저 캐시 정기 정리
- 메모리 사용량 모니터링
- 필요시 에이전트 재시작 스케줄링