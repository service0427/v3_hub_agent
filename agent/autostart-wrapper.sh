#!/bin/bash

# V3 Agent 자동 시작 래퍼 스크립트
# 네트워크 연결 확인 후 에이전트 실행

# 색상 코드
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 브라우저 타입
BROWSER="${1:-chrome}"
BROWSER_UPPER=$(echo "$BROWSER" | tr '[:lower:]' '[:upper:]')

# 로그 함수
log() {
    echo -e "[$(date '+%H:%M:%S')] $1"
}

# 네트워크 연결 확인
check_network() {
    local max_attempts=60  # 최대 5분 대기 (5초 * 60)
    local attempt=0
    
    log "${CYAN}🌐 네트워크 연결 확인 중...${NC}"
    
    while [ $attempt -lt $max_attempts ]; do
        if ping -c 1 google.com &>/dev/null || ping -c 1 8.8.8.8 &>/dev/null; then
            log "${GREEN}✅ 네트워크 연결됨${NC}"
            return 0
        fi
        
        attempt=$((attempt + 1))
        echo -ne "\r${YELLOW}⏳ 네트워크 대기 중... ($attempt/$max_attempts)${NC}"
        sleep 5
    done
    
    echo ""
    log "${RED}❌ 네트워크 연결 실패 (5분 초과)${NC}"
    return 1
}

# Git 업데이트 확인
check_updates() {
    log "${BLUE}🔍 업데이트 확인 중...${NC}"
    
    if [ -d ".git" ]; then
        # 로컬 변경사항 확인
        if ! git diff --quiet || ! git diff --cached --quiet; then
            log "${YELLOW}⚠️  로컬 변경사항이 있어 업데이트 스킵${NC}"
            return 0
        fi
        
        # 원격 저장소 확인
        if git fetch origin main --quiet 2>/dev/null; then
            LOCAL_COMMIT=$(git rev-parse HEAD 2>/dev/null)
            REMOTE_COMMIT=$(git rev-parse origin/main 2>/dev/null)
            
            if [ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ]; then
                log "${YELLOW}🆕 새 버전 발견! 업데이트 중...${NC}"
                if git pull origin main --quiet 2>/dev/null; then
                    log "${GREEN}✅ 업데이트 완료${NC}"
                    # npm install은 스킵 (에이전트가 알아서 처리)
                else
                    log "${RED}❌ 업데이트 실패${NC}"
                fi
            else
                log "${GREEN}✓ 최신 버전입니다${NC}"
            fi
        else
            log "${YELLOW}⚠️  업데이트 확인 실패 (네트워크 문제)${NC}"
        fi
    fi
}

# 메인 실행
main() {
    echo -e "${BLUE}╔═══════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║       V3 Agent - $BROWSER_UPPER Autostart        ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════╝${NC}"
    echo ""
    
    # 작업 디렉토리 확인
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    cd "$SCRIPT_DIR"
    log "작업 디렉토리: $SCRIPT_DIR"
    
    # 네트워크 연결 대기
    if ! check_network; then
        log "${RED}네트워크 없이 계속 진행합니다...${NC}"
    fi
    
    # 업데이트 확인
    check_updates
    
    # 실행 스크립트 확인
    if [ ! -f "./run-${BROWSER}.sh" ]; then
        log "${RED}❌ 실행 스크립트를 찾을 수 없습니다: ./run-${BROWSER}.sh${NC}"
        log "${YELLOW}사용 가능한 옵션: chrome, firefox, webkit${NC}"
        exit 1
    fi
    
    # 에이전트 실행
    echo ""
    log "${GREEN}🚀 V3 Agent ($BROWSER_UPPER) 시작...${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════${NC}"
    echo ""
    
    # 실행 (실패해도 터미널은 유지)
    ./run-${BROWSER}.sh || {
        echo ""
        log "${RED}❌ 에이전트가 종료되었습니다 (Exit code: $?)${NC}"
        log "${YELLOW}💡 로그를 확인하고 Enter를 눌러 재시작하세요${NC}"
        read -p "Press Enter to restart..."
        exec "$0" "$@"
    }
}

# 시그널 핸들러
trap 'echo -e "\n${YELLOW}⚠️  중단됨. 터미널은 유지됩니다.${NC}"; exit 0' INT TERM

# 실행
main "$@"