#!/bin/bash

# V3 Agent Installer Script
# Usage: curl -sSL https://raw.githubusercontent.com/service0427/v3_hub_agent/main/dev_agent/install.sh | bash

set -e

# 색상 정의
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 설치 경로
INSTALL_DIR="$HOME/v3-agent"
REPO_URL="https://github.com/service0427/v3_hub_agent.git"
BRANCH="main"

echo -e "${BLUE}=== V3 Agent Installer ===${NC}"
echo ""

# Node.js 확인
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js가 설치되어 있지 않습니다.${NC}"
    echo "Node.js를 먼저 설치해주세요: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✅ Node.js 발견: $NODE_VERSION${NC}"

# Git 확인
if ! command -v git &> /dev/null; then
    echo -e "${RED}❌ Git이 설치되어 있지 않습니다.${NC}"
    exit 1
fi

# 기존 설치 제거
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}⚠️  기존 설치를 제거합니다...${NC}"
    rm -rf "$INSTALL_DIR"
fi

# 리포지토리 클론
echo -e "${BLUE}📥 리포지토리 다운로드 중...${NC}"
git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"

# dev_agent 디렉토리로 이동
cd "$INSTALL_DIR/dev_agent"

# 의존성 설치
echo -e "${BLUE}📦 의존성 설치 중...${NC}"
npm install

# .env 파일 생성
if [ ! -f .env ]; then
    echo -e "${BLUE}🔧 환경 설정 파일 생성 중...${NC}"
    
    # 프로덕션 환경 파일 복사
    if [ -f .env.production ]; then
        cp .env.production .env
    else
        cat > .env << EOF
# V3 Agent Configuration
HUB_API_URL=http://u24.techb.kr:3331
# Chrome only (Firefox support removed)
LOG_LEVEL=info
EOF
    fi
    
    # Agent ID 자동 생성 및 추가
    echo "" >> .env
    echo "# Agent identification (자동 생성됨)" >> .env
    
    # MAC 주소 또는 Machine ID로 고유 ID 생성
    HOSTNAME=$(hostname)
    
    # OS 감지
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "mingw"* || "$OSTYPE" == "cygwin" ]] || command -v ipconfig &>/dev/null; then
        # Windows (Git Bash)
        # MAC 주소 시도 (ipconfig 사용)
        MAC=$(ipconfig /all 2>/dev/null | grep -A 4 "Ethernet\|Wi-Fi" | grep "Physical Address" | head -1 | awk -F': ' '{print $2}' | tr -d '-' | tail -c 6 | tr '[:lower:]' '[:upper:]')
        if [ -n "$MAC" ] && [ "$MAC" != "000000" ]; then
            AGENT_ID="${HOSTNAME}-${MAC}"
        else
            # Windows 고유 ID (BIOS 시리얼 번호 일부)
            SERIAL=$(wmic bios get serialnumber 2>/dev/null | grep -v SerialNumber | head -1 | tr -d ' \r\n' | tail -c 6)
            if [ -n "$SERIAL" ]; then
                AGENT_ID="${HOSTNAME}-${SERIAL}"
            else
                # 폴백
                AGENT_ID="${HOSTNAME}-$(date +%s | tail -c 6)"
            fi
        fi
    elif [ -f /etc/machine-id ]; then
        # Linux with machine-id
        MACHINE_ID=$(head -c 8 /etc/machine-id)
        AGENT_ID="${HOSTNAME}-${MACHINE_ID}"
    else
        # Linux/macOS without machine-id
        MAC=$(ip link show 2>/dev/null | grep -E '^[0-9]+: (e|w)' | head -1 | xargs ip link show 2>/dev/null | grep -oE '([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}' | head -1 | tr -d ':' | tail -c 6 | tr '[:lower:]' '[:upper:]')
        if [ -n "$MAC" ]; then
            AGENT_ID="${HOSTNAME}-${MAC}"
        else
            # 폴백
            AGENT_ID="${HOSTNAME}-$(date +%s | tail -c 6)"
        fi
    fi
    
    echo "AGENT_ID=${AGENT_ID}" >> .env
    
    echo -e "${GREEN}✅ .env 파일이 생성되었습니다.${NC}"
fi

# 실행 스크립트 생성
echo -e "${BLUE}🔧 전역 명령어 설정 중...${NC}"

# 사용자 bin 디렉토리 생성
mkdir -p "$HOME/.local/bin"

# v3-agent 명령어 생성
cat > "$HOME/.local/bin/v3-agent" << 'EOF'
#!/bin/bash

V3_AGENT_DIR="$HOME/v3-agent/dev_agent"

if [ ! -d "$V3_AGENT_DIR" ]; then
    echo "❌ V3 Agent가 설치되어 있지 않습니다."
    echo "설치: curl -sSL https://raw.githubusercontent.com/service0427/v3_hub_agent/main/dev_agent/install.sh | bash"
    exit 1
fi

cd "$V3_AGENT_DIR"

case "$1" in
    start|run)
        echo "🚀 V3 Agent 시작..."
        ./run.sh
        ;;
    check)
        echo "🔍 단일 체크 실행..."
        node check.js ${@:2}
        ;;
    status)
        echo "📊 Agent 상태 확인..."
        ps aux | grep -E "(node.*check\.js|run\.sh)" | grep -v grep || echo "Agent가 실행중이지 않습니다."
        ;;
    logs)
        echo "📋 최근 로그 확인..."
        tail -f logs/app.log
        ;;
    config)
        echo "⚙️  설정 편집..."
        ${EDITOR:-nano} .env
        ;;
    update)
        echo "🔄 Agent 업데이트..."
        git pull
        npm install
        ;;
    *)
        echo "V3 Agent 명령어"
        echo ""
        echo "사용법: v3-agent [명령]"
        echo ""
        echo "명령어:"
        echo "  start, run   연속 실행 모드 시작"
        echo "  check [n]    n개 키워드 체크 (기본값: 1)"
        echo "  status       실행 상태 확인"
        echo "  logs         실시간 로그 확인"
        echo "  config       설정 파일 편집"
        echo "  update       최신 버전으로 업데이트"
        ;;
esac
EOF

chmod +x "$HOME/.local/bin/v3-agent"

# PATH 설정 추가
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    echo -e "${YELLOW}📝 PATH 설정 추가 중...${NC}"
    
    # bash 설정
    if [ -f "$HOME/.bashrc" ]; then
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
    fi
    
    # zsh 설정
    if [ -f "$HOME/.zshrc" ]; then
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.zshrc"
    fi
    
    export PATH="$HOME/.local/bin:$PATH"
fi

# 설치 완료
echo ""
echo -e "${GREEN}✅ V3 Agent 설치가 완료되었습니다!${NC}"
echo ""
echo -e "${BLUE}실행 방법:${NC}"
echo "  v3-agent start   # 연속 실행 모드"
echo "  v3-agent check   # 단일 체크"
echo "  v3-agent status  # 상태 확인"
echo "  v3-agent logs    # 로그 확인"
echo ""
echo -e "${YELLOW}⚠️  새 터미널을 열거나 아래 명령을 복사해서 실행하세요:${NC}"
echo ""
echo -e "${GREEN}source ~/.bashrc${NC}"
echo ""
echo -e "${BLUE}설치 위치: $INSTALL_DIR${NC}"