# 허브 서버 이전 가이드

ParserHub V3 허브 서버를 다른 서버로 이전하는 상세 가이드입니다.

## 📋 이전 체크리스트

### 사전 준비
- [ ] 새 서버 준비 완료 (Ubuntu 20.04+ 권장)
- [ ] 도메인/DNS 변경 권한 확보
- [ ] 기존 서버 접근 권한 확보
- [ ] 데이터베이스 접속 정보 확보

## 🚀 이전 절차

### 1. 새 서버 환경 구성

```bash
# Node.js 18+ 설치
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2 글로벌 설치
sudo npm install -g pm2

# PostgreSQL 클라이언트 설치
sudo apt-get install -y postgresql-client

# Git 설치
sudo apt-get install -y git

# 필수 도구 설치
sudo apt-get install -y curl wget unzip
```

### 2. 코드 배포

```bash
# 프로젝트 클론
git clone https://github.com/service0427/v3_hub_agent.git
cd v3_hub_agent/hub/

# 의존성 설치
npm install
```

### 3. 환경설정 복사

#### 방법 1: SCP로 복사 (기존 서버가 접근 가능한 경우)
```bash
# 기존 서버에서 .env 파일 복사
scp user@old-server:/path/to/v3_hub_agent/hub/.env .env

# 권한 확인
chmod 600 .env
```

#### 방법 2: 수동 설정
```bash
# 예시 파일 복사
cp .env.example .env

# .env 파일 수정
nano .env
```

`.env` 파일 내용:
```env
NODE_ENV=production
PORT=8545

# 데이터베이스 설정 (운영 DB)
DB_HOST=mkt.techb.kr
DB_PORT=5432
DB_USER=techb_pp
DB_PASS=Tech1324!
DB_NAME=productparser_db

# 기타 설정
MIN_CHECK_INTERVAL=1800
SYNC_TIME_LIMIT=60
```

### 4. 서비스 배포

```bash
# 원클릭 배포
./deploy.sh

# 배포 성공 확인
pm2 status
```

### 5. 자동 시작 설정

```bash
# 시스템 재부팅 시 자동 시작 설정
sudo pm2 startup systemd -u $USER --hp $HOME

# 현재 프로세스 목록 저장
pm2 save
```

### 6. 방화벽 설정

```bash
# UFW 방화벽 사용하는 경우
sudo ufw allow 8545/tcp

# iptables 직접 사용하는 경우
sudo iptables -A INPUT -p tcp --dport 8545 -j ACCEPT
sudo iptables-save > /etc/iptables/rules.v4
```

### 7. 서비스 확인

```bash
# 헬스 체크
curl http://localhost:8545/health

# API 테스트
curl "http://localhost:8545/api/v3/agents/status"

# PM2 상태 확인
pm2 status
pm2 logs parserhub-v3

# 시스템 리소스 확인
pm2 monit
```

## 🌐 도메인/DNS 변경

### 현재 설정
- **도메인**: u24.techb.kr
- **포트**: 8545
- **프로토콜**: HTTP

### DNS 변경 절차

1. **DNS 관리 콘솔 접속**
   - 도메인 등록업체 또는 DNS 서비스 콘솔

2. **A 레코드 변경**
   ```
   호스트명: u24
   타입: A
   값: [새 서버 IP 주소]
   TTL: 300 (5분)
   ```

3. **DNS 전파 확인**
   ```bash
   # DNS 전파 확인
   nslookup u24.techb.kr
   dig u24.techb.kr
   
   # 여러 지역에서 확인
   # https://www.whatsmydns.net/#A/u24.techb.kr
   ```

### 새 도메인 사용 시

새 도메인을 사용하는 경우:

1. **도메인 설정**
   ```
   예시: parser.yourdomain.com
   A 레코드: [새 서버 IP]
   ```

2. **에이전트 설정 변경**
   - 모든 에이전트의 HUB_URL 변경 필요
   - `/hub/src/config/index.ts`에서 기본 URL 변경

3. **문서 업데이트**
   - README.md의 API 예시 URL 변경
   - 관련 문서들의 엔드포인트 URL 변경

## 🔄 롤백 계획

문제 발생 시 기존 서버로 롤백:

### 즉시 롤백
```bash
# DNS를 기존 서버 IP로 변경
# TTL이 짧으면 5-10분 내 복구
```

### 서비스별 상태 확인
```bash
# 허브 서버 상태
curl http://localhost:8545/health

# 데이터베이스 연결 확인
psql -h mkt.techb.kr -U techb_pp -d productparser_db -c "SELECT 1;"

# 에이전트 연결 확인
curl "http://localhost:8545/api/v3/agents/status"
```

## 📊 모니터링 설정

### 로그 모니터링
```bash
# 실시간 로그 확인
pm2 logs parserhub-v3 --lines 100

# 로그 파일 위치
ls -la logs/
tail -f logs/app.log
```

### 시스템 모니터링
```bash
# PM2 모니터링 대시보드
pm2 monit

# 시스템 리소스
htop
df -h
free -m
```

### 헬스체크 자동화
```bash
# crontab 설정
crontab -e

# 5분마다 헬스체크
*/5 * * * * curl -f http://localhost:8545/health || echo "Hub server down" | mail -s "Alert" admin@example.com
```

## 🛠 문제 해결

### 일반적인 문제

1. **포트 충돌**
   ```bash
   # 8545 포트 사용 중인 프로세스 확인
   sudo lsof -i :8545
   sudo netstat -tulpn | grep 8545
   
   # 다른 포트로 변경
   nano .env  # PORT=8546으로 변경
   pm2 restart parserhub-v3
   ```

2. **데이터베이스 연결 실패**
   ```bash
   # 연결 테스트
   psql -h mkt.techb.kr -U techb_pp -d productparser_db
   
   # 네트워크 연결 확인
   telnet mkt.techb.kr 5432
   ```

3. **PM2 권한 문제**
   ```bash
   # PM2 재설치
   npm uninstall -g pm2
   sudo npm install -g pm2
   
   # 사용자 권한으로 재시작
   pm2 kill
   pm2 start dist/index.js --name parserhub-v3
   ```

### 성능 최적화

```bash
# Node.js 힙 메모리 증가
pm2 delete parserhub-v3
pm2 start dist/index.js --name parserhub-v3 --node-args="--max-old-space-size=2048"

# PM2 클러스터 모드 (필요시)
pm2 start dist/index.js --name parserhub-v3 -i 2
```

## 📞 지원 및 연락처

이전 과정에서 문제가 발생하면:
1. 로그 파일 수집 (`pm2 logs`, `logs/app.log`)
2. 시스템 정보 수집 (`pm2 status`, `node -v`, `npm -v`)
3. 에러 메시지와 함께 문의

---

**마지막 업데이트**: 2025-08-02  
**문서 버전**: 1.0