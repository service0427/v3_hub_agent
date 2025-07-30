#!/bin/bash

# V3 Agent Update Script
# 안전하고 깔끔한 업데이트를 위한 스크립트

set -e

# 색상 정의
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

INSTALL_DIR="$HOME/v3-agent"
BACKUP_DIR="$HOME/v3-agent-backup-$(date +%Y%m%d-%H%M%S)"

echo -e "${BLUE}=== V3 Agent 업데이트 ===${NC}"
echo ""

# 현재 위치 확인
CURRENT_DIR=$(pwd)
if [[ "$CURRENT_DIR" != *"/v3-agent/agent"* ]]; then
    if [ -d "$INSTALL_DIR/agent" ]; then
        cd "$INSTALL_DIR/agent"
    else
        echo -e "${RED}❌ V3 Agent가 설치되어 있지 않습니다.${NC}"
        echo "설치: curl -sSL https://raw.githubusercontent.com/service0427/v3_hub_agent/main/agent/install.sh | bash"
        exit 1
    fi
fi

# 실행 중인 에이전트 확인
if pgrep -f "node.*check.js" > /dev/null || pgrep -f "run.sh" > /dev/null; then
    echo -e "${YELLOW}⚠️  실행 중인 에이전트가 있습니다.${NC}"
    read -p "중단하고 계속하시겠습니까? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}❌ 업데이트 취소${NC}"
        exit 1
    fi
    
    # 프로세스 종료
    pkill -f "node.*check.js" || true
    pkill -f "run.sh" || true
    sleep 2
fi

# 업데이트 방법 선택
echo -e "${BLUE}업데이트 방법을 선택하세요:${NC}"
echo "1) 빠른 업데이트 (git pull) - 권장"
echo "2) 깨끗한 재설치 (기존 삭제 후 새로 설치)"
echo ""
read -p "선택 (1-2): " -n 1 -r UPDATE_METHOD
echo ""

if [[ "$UPDATE_METHOD" == "1" ]]; then
    # Git Pull 방식
    echo -e "${BLUE}🔄 Git으로 업데이트 중...${NC}"
    
    # 로컬 변경사항 확인
    if ! git diff --quiet || ! git diff --cached --quiet; then
        echo -e "${YELLOW}⚠️  로컬 변경사항이 있습니다.${NC}"
        git status --short
        echo ""
        read -p "변경사항을 무시하고 계속하시겠습니까? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${RED}❌ 업데이트 취소${NC}"
            exit 1
        fi
        
        # 변경사항 백업
        echo -e "${YELLOW}📦 변경사항 백업 중...${NC}"
        git stash push -m "Backup before update $(date +%Y%m%d-%H%M%S)"
    fi
    
    # Pull 실행
    git fetch origin main
    git reset --hard origin/main
    
    # npm 패키지 업데이트
    echo -e "${BLUE}📦 패키지 업데이트 중...${NC}"
    rm -rf node_modules package-lock.json
    npm install
    
    # Playwright 브라우저 재설치
    echo -e "${BLUE}🌐 브라우저 업데이트 중...${NC}"
    npx playwright install chromium firefox
    
elif [[ "$UPDATE_METHOD" == "2" ]]; then
    # 완전 재설치 방식
    echo -e "${BLUE}🗑️  기존 설치 백업 중...${NC}"
    
    # .env 파일 백업 (있는 경우)
    if [ -f "$INSTALL_DIR/agent/.env" ]; then
        mkdir -p "$BACKUP_DIR"
        cp "$INSTALL_DIR/agent/.env" "$BACKUP_DIR/.env"
        echo -e "${GREEN}✅ .env 파일 백업 완료${NC}"
    fi
    
    # logs 백업 (있는 경우)
    if [ -d "$INSTALL_DIR/agent/logs" ]; then
        mkdir -p "$BACKUP_DIR"
        cp -r "$INSTALL_DIR/agent/logs" "$BACKUP_DIR/logs"
        echo -e "${GREEN}✅ 로그 백업 완료${NC}"
    fi
    
    # 기존 설치 제거
    echo -e "${YELLOW}🗑️  기존 설치 제거 중...${NC}"
    cd "$HOME"
    rm -rf "$INSTALL_DIR"
    
    # 새로 설치
    echo -e "${BLUE}📥 새로 설치 중...${NC}"
    curl -sSL https://raw.githubusercontent.com/service0427/v3_hub_agent/main/agent/install.sh | bash
    
    # 백업 복원
    if [ -f "$BACKUP_DIR/.env" ]; then
        cp "$BACKUP_DIR/.env" "$INSTALL_DIR/agent/.env"
        echo -e "${GREEN}✅ .env 파일 복원 완료${NC}"
    fi
    
else
    echo -e "${RED}❌ 잘못된 선택입니다.${NC}"
    exit 1
fi

# 버전 정보 표시
echo ""
echo -e "${GREEN}✅ 업데이트 완료!${NC}"
echo ""

# 최근 커밋 정보 표시
if [ -d "$INSTALL_DIR" ]; then
    cd "$INSTALL_DIR"
    echo -e "${BLUE}📋 최신 버전 정보:${NC}"
    git log --oneline -n 5
fi

echo ""
echo -e "${BLUE}실행 방법:${NC}"
echo "  v3-agent chrome   # Chrome 브라우저로 실행"
echo "  v3-agent firefox  # Firefox 브라우저로 실행"
echo ""

# 백업 디렉토리 정보
if [ -d "$BACKUP_DIR" ]; then
    echo -e "${YELLOW}💾 백업 위치: $BACKUP_DIR${NC}"
fi