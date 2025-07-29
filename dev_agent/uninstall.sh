#!/bin/bash

# V3 Agent Uninstaller Script

set -e

# 색상 정의
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== V3 Agent Uninstaller ===${NC}"
echo ""

# 실행 중인 프로세스 확인
if pgrep -f "node.*check\.js" > /dev/null || pgrep -f "run\.sh" > /dev/null; then
    echo -e "${YELLOW}⚠️  실행 중인 Agent를 종료합니다...${NC}"
    pkill -f "node.*check\.js" || true
    pkill -f "run\.sh" || true
    sleep 2
fi

# 설치 디렉토리 제거
INSTALL_DIR="$HOME/v3-agent"
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${BLUE}🗑️  설치 디렉토리 제거 중...${NC}"
    rm -rf "$INSTALL_DIR"
    echo -e "${GREEN}✅ 설치 디렉토리가 제거되었습니다.${NC}"
else
    echo -e "${YELLOW}⚠️  설치 디렉토리를 찾을 수 없습니다.${NC}"
fi

# 전역 명령어 제거
if [ -f "$HOME/.local/bin/v3-agent" ]; then
    echo -e "${BLUE}🗑️  전역 명령어 제거 중...${NC}"
    rm -f "$HOME/.local/bin/v3-agent"
    echo -e "${GREEN}✅ 전역 명령어가 제거되었습니다.${NC}"
fi

echo ""
echo -e "${GREEN}✅ V3 Agent가 완전히 제거되었습니다.${NC}"
echo ""
echo -e "${BLUE}재설치하려면:${NC}"
echo "  curl -sSL https://raw.githubusercontent.com/service0427/v3_hub_agent/main/dev_agent/install.sh | bash"