#!/bin/bash

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 스크립트 디렉토리
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 헤더 표시
show_header() {
    clear
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}        ParserHub V3 개발용 에이전트 테스트${NC}"
    echo -e "${YELLOW}        GUI 표시 확인 및 브라우저 테스트${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo
}

# 환경 확인
check_environment() {
    echo -e "${YELLOW}환경 확인 중...${NC}"
    echo "────────────────────────────────────────"
    
    # Display 확인
    if [ -n "$DISPLAY" ]; then
        echo -e "DISPLAY: ${GREEN}$DISPLAY${NC}"
    else
        echo -e "DISPLAY: ${RED}설정되지 않음${NC}"
        echo -e "${YELLOW}GUI를 표시하려면 다음 명령을 실행하세요:${NC}"
        echo "export DISPLAY=:0"
    fi
    
    # Node.js 확인
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v)
        echo -e "Node.js: ${GREEN}$NODE_VERSION${NC}"
    else
        echo -e "Node.js: ${RED}설치되지 않음${NC}"
        exit 1
    fi
    
    # 브라우저 확인
    echo -e "\n${YELLOW}설치된 브라우저:${NC}"
    
    if command -v google-chrome &> /dev/null; then
        CHROME_VERSION=$(google-chrome --version)
        echo -e "Chrome: ${GREEN}$CHROME_VERSION${NC}"
    else
        echo -e "Chrome: ${RED}설치되지 않음${NC}"
    fi
    
    if command -v chromium-browser &> /dev/null || command -v chromium &> /dev/null; then
        if command -v chromium-browser &> /dev/null; then
            CHROMIUM_VERSION=$(chromium-browser --version)
        else
            CHROMIUM_VERSION=$(chromium --version)
        fi
        echo -e "Chromium: ${GREEN}$CHROMIUM_VERSION${NC}"
    else
        echo -e "Chromium: ${YELLOW}Playwright 내장 버전 사용${NC}"
    fi
    
    if command -v firefox &> /dev/null; then
        FIREFOX_VERSION=$(firefox --version)
        echo -e "Firefox: ${GREEN}$FIREFOX_VERSION${NC}"
    else
        echo -e "Firefox: ${RED}설치되지 않음${NC}"
    fi
    
    if command -v firefox-nightly &> /dev/null || [ -x "/usr/bin/firefox-nightly" ]; then
        if [ -x "/usr/bin/firefox-nightly" ]; then
            NIGHTLY_VERSION=$(/usr/bin/firefox-nightly --version 2>/dev/null)
            echo -e "Firefox Nightly: ${GREEN}$NIGHTLY_VERSION${NC}"
        else
            echo -e "Firefox Nightly: ${GREEN}설치됨${NC}"
        fi
    else
        echo -e "Firefox Nightly: ${YELLOW}설치되지 않음${NC}"
    fi
    
    # OS 확인 후 Edge 표시
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo -e "Edge: ${YELLOW}Linux에서는 지원하지 않음${NC}"
    elif command -v microsoft-edge &> /dev/null; then
        EDGE_VERSION=$(microsoft-edge --version)
        echo -e "Edge: ${GREEN}$EDGE_VERSION${NC}"
    else
        echo -e "Edge: ${RED}설치되지 않음${NC}"
    fi
    
    echo
}

# npm 설치 확인
check_npm_install() {
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}npm 패키지 설치 중...${NC}"
        npm install
        echo -e "${GREEN}✅ npm 패키지 설치 완료${NC}"
    fi
}

# 브라우저 선택 메뉴
select_browser() {
    echo -e "${YELLOW}테스트할 브라우저를 선택하세요:${NC}"
    echo "────────────────────────────────────────"
    echo "1) Chrome"
    echo "2) Chromium"
    echo "3) Firefox"
    
    # OS에 따라 Edge 옵션 표시
    if [[ "$OSTYPE" != "linux-gnu"* ]]; then
        echo "4) Edge (Windows)"
    fi
    
    echo "0) 종료"
    echo
    read -p "선택 (기본값: 1): " choice
    
    # 엔터만 누르면 기본값 1 (Chrome) 사용
    if [ -z "$choice" ]; then
        choice="1"
    fi
    
    case $choice in
        1) BROWSER_TYPE="chrome" ;;
        2) BROWSER_TYPE="chromium" ;;
        3) BROWSER_TYPE="firefox" ;;
        4) 
            if [[ "$OSTYPE" == "linux-gnu"* ]]; then
                echo -e "${RED}Edge는 Linux에서 지원되지 않습니다${NC}"
                exit 1
            fi
            BROWSER_TYPE="edge" 
            ;;
        0) exit 0 ;;
        *) 
            echo -e "${RED}잘못된 선택입니다${NC}"
            exit 1
            ;;
    esac
}

# 테스트 실행
run_test() {
    local browser=$1
    
    echo -e "\n${YELLOW}$browser 브라우저 테스트 시작...${NC}"
    echo "────────────────────────────────────────"
    
    # 환경 변수 설정
    export DISPLAY=${DISPLAY:-:0}
    export BROWSER_TYPE=$browser
    export HEADLESS=false
    
    # 로그 디렉토리 생성
    mkdir -p logs
    
    # 브라우저 실행
    echo -e "${GREEN}브라우저를 실행합니다...${NC}"
    echo -e "${YELLOW}종료하려면 Ctrl+C를 누르세요${NC}\n"
    
    node src/index.js
}

# 메인 실행
main() {
    show_header
    check_environment
    check_npm_install
    select_browser
    run_test $BROWSER_TYPE
}

# 실행
main