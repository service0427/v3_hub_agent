# V3 Agent 배포 체크리스트

## 🚀 배포 전 확인사항

### 1. 시스템 요구사항
- [ ] Ubuntu 20.04 이상 또는 호환 Linux
- [ ] Node.js 14.x 이상 설치
- [ ] Chrome 브라우저 설치
- [ ] GUI 환경 (X11 또는 Wayland)
- [ ] 최소 2GB RAM
- [ ] 1GB 이상 디스크 여유 공간

### 2. 네트워크 요구사항
- [ ] Hub API 접근 가능 (http://u24.techb.kr:3331)
- [ ] 쿠팡 웹사이트 접근 가능
- [ ] 방화벽에서 3331 포트 열림

### 3. 설치 전 준비
```bash
# Node.js 설치 확인
node -v

# Chrome 설치 확인
google-chrome --version

# GUI 환경 확인
echo $DISPLAY
```

## 📦 설치 방법

### 원클릭 설치 (권장)
```bash
curl -sSL https://raw.githubusercontent.com/service0427/v3_hub_agent/main/dev_agent/install.sh | bash
```

### 설치 후 확인
```bash
# 새 터미널 열거나
source ~/.bashrc

# 설치 확인
v3-agent
```

## 🔧 초기 설정

### 1. 환경 설정 확인
```bash
v3-agent config
```

### 2. 필요시 설정 수정
- `HUB_API_URL`: Hub 서버 주소
- `LOG_LEVEL`: 로그 레벨 (debug/info/warn/error)

## 🏃 실행 및 테스트

### 1. 단일 키워드 테스트
```bash
v3-agent check
```

### 2. 연속 실행 모드
```bash
v3-agent start
```

### 3. 실행 상태 확인
```bash
v3-agent status
```

### 4. 로그 확인
```bash
v3-agent logs
```

## 📊 모니터링

### Hub에서 에이전트 상태 확인
1. Hub API 대시보드 접속
2. `/api/v3/agents` 엔드포인트 확인
3. 에이전트 ID와 상태 확인

### 로컬 로그 확인
```bash
# 실시간 로그
tail -f ~/v3-agent/dev_agent/logs/app.log

# 에러 로그만
grep ERROR ~/v3-agent/dev_agent/logs/app.log
```

## 🚨 문제 해결

### SSL 인증서 오류
- 자체 서명 인증서를 사용하는 경우 정상
- api-client.js에서 `rejectUnauthorized: false` 설정 확인

### 브라우저 실행 오류
```bash
# Chrome 의존성 확인
ldd $(which google-chrome) | grep "not found"

# 필요한 라이브러리 설치
sudo apt-get update
sudo apt-get install -y libgbm1 libxss1
```

### 키워드를 찾지 못하는 경우
1. DB에서 `processing_time IS NULL` 확인
2. Hub API 연결 상태 확인
3. 네트워크 차단 여부 확인

## 🔄 업데이트

### 자동 업데이트
```bash
v3-agent update
```

### 수동 업데이트
```bash
cd ~/v3-agent
git pull
cd dev_agent
npm install
```

## 📝 운영 팁

1. **연속 실행 모드 사용**
   - 자동으로 키워드를 가져와서 처리
   - 차단 시 자동 대기 시간 조정

2. **로그 레벨 조정**
   - 문제 해결 시: `LOG_LEVEL=debug`
   - 정상 운영 시: `LOG_LEVEL=info`

3. **Chrome 최적화**
   - 차단 발생 시 대기 시간 자동 조정
   - DB의 `v3_agent_config`에서 설정 가능

4. **모니터링**
   - 주기적으로 Hub 대시보드 확인
   - 에러율이 높으면 대기 시간 조정 고려

## ✅ 배포 완료 확인

- [ ] 에이전트가 Hub에 등록됨
- [ ] 키워드 체크가 정상 작동
- [ ] 로그가 정상적으로 기록됨
- [ ] 차단 감지 및 대기 시간 조정 작동
- [ ] DB에 결과가 정상 저장됨