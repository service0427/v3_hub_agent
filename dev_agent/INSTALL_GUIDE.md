# V3 Agent 설치 가이드

## 🚀 빠른 설치 (권장)

### 원클릭 설치
```bash
curl -sSL https://raw.githubusercontent.com/service0427/v3_hub_agent/main/dev_agent/install.sh | bash
```

설치가 완료되면 새 터미널을 열거나 다음 명령을 실행하세요:
```bash
source ~/.bashrc
```

## 📋 시스템 요구사항

- **OS**: Linux (Ubuntu 20.04 이상 권장)
- **Node.js**: 14.x 이상
- **브라우저**: Chrome 또는 Firefox 설치 필요
- **메모리**: 최소 2GB RAM
- **디스크**: 최소 1GB 여유 공간

## 🔧 수동 설치

1. **리포지토리 클론**
   ```bash
   git clone https://github.com/service0427/v3_hub_agent.git ~/v3-agent
   cd ~/v3-agent/dev_agent
   ```

2. **의존성 설치**
   ```bash
   npm install
   ```

3. **환경 설정**
   ```bash
   cp .env.example .env
   nano .env  # 필요한 설정 수정
   ```

## 💻 사용 방법

### 전역 명령어 (설치 후)
```bash
# 연속 실행 모드 시작
v3-agent start

# 단일 키워드 체크
v3-agent check

# 5개 키워드 체크
v3-agent check 5

# 실행 상태 확인
v3-agent status

# 실시간 로그 확인
v3-agent logs

# 설정 파일 편집
v3-agent config

# 최신 버전으로 업데이트
v3-agent update
```

### 직접 실행 (설치 디렉토리에서)
```bash
cd ~/v3-agent/dev_agent

# 연속 실행
./run.sh

# 단일 체크
node check.js
```

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

## 🗑️ 제거

### 완전 제거
```bash
curl -sSL https://raw.githubusercontent.com/service0427/v3_hub_agent/main/dev_agent/uninstall.sh | bash
```

### 수동 제거
```bash
rm -rf ~/v3-agent
rm -f ~/.local/bin/v3-agent
```

## ⚙️ 환경 설정

`.env` 파일에서 다음 항목을 설정할 수 있습니다:

```env
# Hub API 주소
HUB_API_URL=http://u24.techb.kr:3331

# Chrome only (Firefox support removed)

# 로그 레벨 (debug/info/warn/error)
LOG_LEVEL=info

# Agent ID (자동 생성됨)
AGENT_ID=agent-hostname-timestamp
```

## 🐛 문제 해결

### Node.js가 설치되어 있지 않은 경우
```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# CentOS/RHEL
curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
sudo yum install nodejs
```

### Chrome이 설치되어 있지 않은 경우
```bash
# Ubuntu/Debian
wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list'
sudo apt update
sudo apt install google-chrome-stable
```

### Firefox가 설치되어 있지 않은 경우
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install firefox
```

### 권한 문제
```bash
# 실행 권한 부여
chmod +x ~/v3-agent/dev_agent/run.sh
chmod +x ~/.local/bin/v3-agent
```

### PATH 문제
```bash
# PATH에 추가
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

## 📊 모니터링

에이전트 실행 상태는 Hub 대시보드에서 확인할 수 있습니다:
- https://u24.techb.kr/v3/agents

로컬 로그 확인:
```bash
# 실시간 로그
v3-agent logs

# 전체 로그 파일
cat ~/v3-agent/dev_agent/logs/app.log
```

## 🔐 보안 주의사항

- `.env` 파일에는 민감한 정보가 포함될 수 있으므로 권한을 제한하세요
- 공용 서버에서는 각 사용자별로 별도의 Agent ID를 사용하세요
- 정기적으로 업데이트하여 최신 보안 패치를 적용하세요

## 📞 지원

문제가 발생하면 다음을 확인하세요:
1. 로그 파일: `~/v3-agent/dev_agent/logs/app.log`
2. 시스템 요구사항 충족 여부
3. 네트워크 연결 상태

추가 지원이 필요하면 GitHub Issues에 문의하세요:
https://github.com/service0427/v3_hub_agent/issues