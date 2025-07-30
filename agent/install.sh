#!/bin/bash

# V3 Agent Installer Script (Chrome/Firefox 통합 버전)
# Usage: curl -sSL https://raw.githubusercontent.com/service0427/v3_hub_agent/main/agent/install.sh | bash

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

# OS 감지
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VER=$VERSION_ID
else
    echo -e "${RED}❌ OS를 감지할 수 없습니다.${NC}"
    exit 1
fi

# 패키지 관리자 확인
if command -v apt-get &> /dev/null; then
    PKG_MANAGER="apt-get"
elif command -v yum &> /dev/null; then
    PKG_MANAGER="yum"
elif command -v dnf &> /dev/null; then
    PKG_MANAGER="dnf"
else
    echo -e "${RED}❌ 지원되지 않는 패키지 관리자입니다.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ OS: $OS ($VER)${NC}"
echo -e "${GREEN}✅ Package Manager: $PKG_MANAGER${NC}"

# curl 확인 및 설치 (필수 도구)
if ! command -v curl &> /dev/null; then
    echo -e "${YELLOW}⚠️  curl이 설치되어 있지 않습니다. 자동으로 설치합니다...${NC}"
    
    if [ "$PKG_MANAGER" = "apt-get" ]; then
        sudo apt-get update
        sudo apt-get install -y curl
    elif [ "$PKG_MANAGER" = "yum" ] || [ "$PKG_MANAGER" = "dnf" ]; then
        sudo $PKG_MANAGER install -y curl
    fi
    
    if ! command -v curl &> /dev/null; then
        echo -e "${RED}❌ curl 설치에 실패했습니다.${NC}"
        exit 1
    fi
fi

# Node.js 확인 및 설치
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}⚠️  Node.js가 설치되어 있지 않습니다. 자동으로 설치합니다...${NC}"
    
    # sudo 권한 확인
    if ! command -v sudo &> /dev/null; then
        echo -e "${RED}❌ sudo가 없습니다. root 권한으로 실행해주세요.${NC}"
        exit 1
    fi
    
    # NodeSource 저장소 추가 및 Node.js 설치
    if [ "$PKG_MANAGER" = "apt-get" ]; then
        echo -e "${BLUE}📦 NodeSource 저장소 추가 중...${NC}"
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif [ "$PKG_MANAGER" = "yum" ] || [ "$PKG_MANAGER" = "dnf" ]; then
        echo -e "${BLUE}📦 NodeSource 저장소 추가 중...${NC}"
        curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
        sudo $PKG_MANAGER install -y nodejs
    else
        echo -e "${RED}❌ Node.js 자동 설치를 지원하지 않는 시스템입니다.${NC}"
        echo "Node.js를 수동으로 설치해주세요: https://nodejs.org/"
        exit 1
    fi
    
    # 설치 확인
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js 설치에 실패했습니다.${NC}"
        exit 1
    fi
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✅ Node.js 발견: $NODE_VERSION${NC}"

# Git 확인 및 설치
if ! command -v git &> /dev/null; then
    echo -e "${YELLOW}⚠️  Git이 설치되어 있지 않습니다. 자동으로 설치합니다...${NC}"
    
    if [ "$PKG_MANAGER" = "apt-get" ]; then
        sudo apt-get update
        sudo apt-get install -y git
    elif [ "$PKG_MANAGER" = "yum" ] || [ "$PKG_MANAGER" = "dnf" ]; then
        sudo $PKG_MANAGER install -y git
    else
        echo -e "${RED}❌ Git 자동 설치를 지원하지 않는 시스템입니다.${NC}"
        exit 1
    fi
    
    # 설치 확인
    if ! command -v git &> /dev/null; then
        echo -e "${RED}❌ Git 설치에 실패했습니다.${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✅ Git 발견${NC}"

# 기존 설치 제거
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}⚠️  기존 설치를 제거합니다...${NC}"
    rm -rf "$INSTALL_DIR"
fi

# 리포지토리 클론
echo -e "${BLUE}📥 리포지토리 다운로드 중...${NC}"
git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"

# agent 디렉토리로 이동
cd "$INSTALL_DIR/agent"

# 의존성 설치
echo -e "${BLUE}📦 의존성 설치 중...${NC}"
npm install

# Playwright 브라우저 설치
echo -e "${BLUE}🌐 브라우저 설치 중...${NC}"
npx playwright install chromium firefox

# .env 파일은 선택사항 - 있으면 사용, 없으면 DB 설정 사용
if [ -f .env.example ] && [ ! -f .env ]; then
    echo -e "${BLUE}ℹ️  .env 파일이 없습니다. DB 설정을 사용합니다.${NC}"
    echo -e "${YELLOW}   필요시 'cp .env.example .env'로 생성할 수 있습니다.${NC}"
fi

# 실행 스크립트 생성
echo -e "${BLUE}🔧 전역 명령어 설정 중...${NC}"

# 사용자 bin 디렉토리 생성
mkdir -p "$HOME/.local/bin"

# v3-agent 명령어 생성
cat > "$HOME/.local/bin/v3-agent" << 'EOF'
#!/bin/bash

V3_AGENT_DIR="$HOME/v3-agent/agent"

if [ ! -d "$V3_AGENT_DIR" ]; then
    echo "❌ V3 Agent가 설치되어 있지 않습니다."
    echo "설치: curl -sSL https://raw.githubusercontent.com/service0427/v3_hub_agent/main/agent/install.sh | bash"
    exit 1
fi

cd "$V3_AGENT_DIR"

case "$1" in
    start|run)
        echo "🚀 V3 Agent 시작 (기본: Chrome)..."
        ./run-chrome.sh
        ;;
    chrome)
        echo "🚀 V3 Agent 시작 (Chrome)..."
        ./run-chrome.sh
        ;;
    firefox)
        echo "🚀 V3 Agent 시작 (Firefox)..."
        ./run-firefox.sh
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
        if [ -f "./update.sh" ]; then
            ./update.sh
        else
            # 폴백: 기본 업데이트
            echo "업데이트 스크립트를 다운로드합니다..."
            curl -sSL https://raw.githubusercontent.com/service0427/v3_hub_agent/main/agent/update.sh -o update.sh
            chmod +x update.sh
            ./update.sh
        fi
        ;;
    *)
        echo "V3 Agent 명령어"
        echo ""
        echo "사용법: v3-agent [명령]"
        echo ""
        echo "명령어:"
        echo "  start, run   연속 실행 모드 시작 (Chrome)"
        echo "  chrome       Chrome 브라우저로 실행"
        echo "  firefox      Firefox 브라우저로 실행"
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
echo -e "${BLUE}🎯 중요: 에이전트는 DB 설정을 자동으로 사용합니다.${NC}"
echo -e "   - Hub API URL, 대기 시간 등은 v3_agent_config 테이블에서 관리"
echo -e "   - Agent ID는 시스템 정보를 기반으로 자동 생성"
echo -e "   - .env 파일 없이도 정상 작동"
echo ""
echo -e "${BLUE}실행 방법:${NC}"
echo "  v3-agent chrome   # Chrome 브라우저로 실행"
echo "  v3-agent firefox  # Firefox 브라우저로 실행"
echo "  v3-agent check    # 단일 체크"
echo "  v3-agent status   # 상태 확인"
echo ""
echo -e "${YELLOW}⚠️  새 터미널을 열거나 아래 명령을 복사해서 실행하세요:${NC}"
echo ""
echo -e "${GREEN}source ~/.bashrc${NC}"
echo ""
echo -e "${BLUE}설치 위치: $INSTALL_DIR/agent${NC}"
echo ""
echo -e "${YELLOW}또는 직접 실행:${NC}"
echo "  cd $INSTALL_DIR/agent"
echo "  ./run-chrome.sh   # Chrome 실행"
echo "  ./run-firefox.sh  # Firefox 실행"