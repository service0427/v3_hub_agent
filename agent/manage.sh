#!/bin/bash

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 기본 설정
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
cd "$PROJECT_ROOT"

# logs 디렉토리가 없으면 생성
if [ ! -d "logs" ]; then
    mkdir -p logs
    echo -e "${YELLOW}logs 디렉토리를 생성했습니다.${NC}"
fi

# 브라우저 타입 고정 설정
# 3301: Chrome
# 3302: Firefox
# 3303: Firefox Nightly
BROWSER_3301="chrome"
BROWSER_3302="firefox"
BROWSER_3303="firefox-nightly"

# 함수들
show_header() {
    clear
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}        ParserHub V3 에이전트 관리 도구${NC}"
    echo -e "${YELLOW}        3301(Chrome) | 3302(Firefox) | 3303(Nightly)${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo
}

check_agent_status() {
    local port=$1
    local instance=$port
    
    # PID 파일이 있는지 확인
    if [ -f "logs/agent_${instance}.pid" ]; then
        local pid=$(cat "logs/agent_${instance}.pid")
        if ps -p $pid > /dev/null 2>&1; then
            echo -e "${GREEN}실행중${NC} (PID: $pid)"
            return 0
        fi
    fi
    
    # V3 에이전트 프로세스 찾기
    local pid=$(ps aux | grep -v grep | grep "v3_hub_agent/agent.*node src/index.js" | grep "INSTANCE_ID=$instance" | awk '{print $2}')
    if [ ! -z "$pid" ]; then
        echo -e "${GREEN}실행중${NC} (PID: $pid)"
        echo $pid > "logs/agent_${instance}.pid"
        return 0
    fi
    
    echo -e "${RED}정지됨${NC}"
    return 1
}

get_browser_name() {
    local port=$1
    case $port in
        3301) echo "Chrome" ;;
        3302) echo "Firefox" ;;
        3303) echo "Firefox Nightly" ;;
        *) echo "Unknown" ;;
    esac
}

show_status() {
    show_header
    echo -e "${YELLOW}V3 에이전트 상태:${NC}"
    echo "────────────────────────────────────────"
    
    for port in 3301 3302 3303; do
        local browser_name=$(get_browser_name $port)
        echo -n "포트 $port ($browser_name): "
        check_agent_status $port
    done
    
    echo
    echo -e "${YELLOW}시스템 리소스:${NC}"
    echo "────────────────────────────────────────"
    
    # Memory usage for V3 agents only
    local mem_usage=$(ps aux | grep "v3_hub_agent/agent.*node.*index.js" | grep -v grep | awk '{sum += $6} END {print sum/1024}')
    echo "V3 에이전트 메모리 사용량: ${mem_usage:-0} MB"
    
    # Chrome processes
    local chrome_count=$(pgrep -f "chrome|chromium" | wc -l)
    echo "Chrome 프로세스: $chrome_count"
    
    # Firefox processes
    local firefox_count=$(pgrep -f "firefox" | wc -l)
    echo "Firefox 프로세스: $firefox_count"
    
    # Log sizes
    local log_size=$(du -sh logs 2>/dev/null | cut -f1)
    echo "로그 디렉토리 크기: ${log_size:-0}"
}

start_single_agent() {
    local port=$1
    if [ -z "$port" ]; then
        echo -e "${YELLOW}에이전트 선택:${NC}"
        echo "1) 3301 - Chrome"
        echo "2) 3302 - Firefox"
        echo "3) 3303 - Firefox Nightly"
        read -p "선택하세요 (1-3): " choice
        
        case $choice in
            1) port=3301 ;;
            2) port=3302 ;;
            3) port=3303 ;;
            *) 
                echo -e "${RED}잘못된 선택입니다${NC}"
                return 1
                ;;
        esac
    fi
    
    local browser_type=""
    case $port in
        3301) browser_type="chrome" ;;
        3302) browser_type="firefox" ;;
        3303) browser_type="firefox-nightly" ;;
        *) 
            echo -e "${RED}잘못된 포트입니다${NC}"
            return 1
            ;;
    esac
    
    local browser_name=$(get_browser_name $port)
    echo -e "${YELLOW}V3 에이전트 시작 중 ($port - $browser_name)...${NC}"
    
    # 환경 변수 설정
    export DISPLAY=${DISPLAY:-:0}
    export NODE_ENV=production
    export API_KEY=${API_KEY:-test-api-key-123}
    export HUB_URL=${HUB_URL:-http://u24.techb.kr:8545}
    export AGENT_ID=LINUX-$port
    export INSTANCE_ID=$port
    export BROWSER_TYPE=$browser_type
    export HEADLESS=false
    export LOG_LEVEL=info
    
    # Firefox Nightly 경로 설정
    if [ "$port" = "3303" ] && [ -x "/usr/bin/firefox-nightly" ]; then
        export FIREFOX_NIGHTLY_PATH="/usr/bin/firefox-nightly"
    fi
    
    # GUI 모드로 실행 (nohup 사용하지 않음)
    if [ -n "$DISPLAY" ]; then
        echo "GUI 모드로 에이전트 시작 (DISPLAY=$DISPLAY)"
        node src/index.js > logs/agent_$port.log 2>&1 &
    else
        echo "경고: DISPLAY 환경변수가 설정되지 않았습니다."
        echo "GUI를 표시하려면 다음 명령을 먼저 실행하세요:"
        echo "export DISPLAY=:0"
        nohup node src/index.js > logs/agent_$port.log 2>&1 &
    fi
    local pid=$!
    echo $pid > logs/agent_$port.pid
    sleep 2
    
    if check_agent_status $port > /dev/null; then
        echo -e "${GREEN}✓ V3 에이전트 $port ($browser_name)이 성공적으로 시작되었습니다${NC}"
    else
        echo -e "${RED}✗ V3 에이전트 $port ($browser_name) 시작 실패${NC}"
        echo "자세한 내용은 logs/agent_$port.log를 확인하세요"
    fi
}

start_all_agents() {
    echo -e "${YELLOW}모든 V3 에이전트 시작 중...${NC}"
    
    for port in 3301 3302 3303; do
        start_single_agent $port
        sleep 1
    done
}

stop_single_agent() {
    local port=$1
    if [ -z "$port" ]; then
        echo -e "${YELLOW}중지할 에이전트 선택:${NC}"
        echo "1) 3301 - Chrome"
        echo "2) 3302 - Firefox"
        echo "3) 3303 - Firefox Nightly"
        read -p "선택하세요 (1-3): " choice
        
        case $choice in
            1) port=3301 ;;
            2) port=3302 ;;
            3) port=3303 ;;
            *) 
                echo -e "${RED}잘못된 선택입니다${NC}"
                return 1
                ;;
        esac
    fi
    
    local browser_name=$(get_browser_name $port)
    echo -e "${YELLOW}V3 에이전트 $port ($browser_name) 정지 중...${NC}"
    
    # PID 파일에서 프로세스 종료
    if [ -f "logs/agent_${port}.pid" ]; then
        local pid=$(cat "logs/agent_${port}.pid")
        if ps -p $pid > /dev/null 2>&1; then
            kill $pid 2>/dev/null
            echo -e "${GREEN}✓ V3 에이전트 $port (PID: $pid) 종료${NC}"
        fi
        rm -f "logs/agent_${port}.pid"
    fi
    
    # 프로세스 추가 확인
    local pid=$(ps aux | grep -v grep | grep "v3_hub_agent/agent.*node src/index.js" | grep "INSTANCE_ID=$port" | awk '{print $2}')
    if [ ! -z "$pid" ]; then
        kill $pid 2>/dev/null
    fi
}

stop_all_agents() {
    echo -e "${YELLOW}모든 V3 에이전트 정지 중...${NC}"
    
    for port in 3301 3302 3303; do
        stop_single_agent $port
    done
    
    sleep 1
    echo -e "${GREEN}✓ 모든 V3 에이전트가 정지되었습니다${NC}"
}

view_logs() {
    echo -e "${YELLOW}로그 보기 선택:${NC}"
    echo "1) 모든 V3 로그 (실시간)"
    echo "2) 에이전트 3301 (Chrome) 로그"
    echo "3) 에이전트 3302 (Firefox) 로그"
    echo "4) 에이전트 3303 (Nightly) 로그"
    echo "5) 모든 V3 로그 삭제"
    echo "0) 메인 메뉴로 돌아가기"
    
    read -p "선택하세요: " log_choice
    
    case $log_choice in
        1) tail -f logs/agent_330*.log ;;
        2) tail -f logs/agent_3301.log ;;
        3) tail -f logs/agent_3302.log ;;
        4) tail -f logs/agent_3303.log ;;
        5) 
            read -p "정말로 모든 V3 로그를 삭제하시겠습니까? (y/N): " confirm
            if [ "$confirm" = "y" ]; then
                rm -f logs/agent_330*.log
                echo -e "${GREEN}✓ V3 로그가 삭제되었습니다${NC}"
            fi
            ;;
        0) return ;;
        *) echo -e "${RED}잘못된 선택입니다${NC}" ;;
    esac
}

configure_agent() {
    echo -e "${YELLOW}V3 에이전트 설정:${NC}"
    echo "────────────────────────────────────────"
    
    if [ -f .env ]; then
        echo -e "${GREEN}현재 설정:${NC}"
        echo "허브 URL: $(grep HUB_URL .env | cut -d'=' -f2)"
        echo "API Key: $(grep API_KEY .env | cut -d'=' -f2)"
        echo "Headless: $(grep HEADLESS .env | cut -d'=' -f2)"
        echo
        echo ".env 파일을 편집하여 설정을 변경하세요"
        read -p "Enter키를 눌러 편집기를 열거나 Ctrl+C로 취소: "
        nano .env
        echo -e "${GREEN}✓ 설정이 업데이트되었습니다${NC}"
    else
        echo -e "${RED}.env 파일을 찾을 수 없습니다!${NC}"
    fi
}

show_menu() {
    echo
    echo -e "${YELLOW}메인 메뉴:${NC}"
    echo "────────────────────────────────────────"
    echo "1) 상태 보기"
    echo "2) 단일 에이전트 시작"
    echo "3) 모든 에이전트 시작"
    echo "4) 단일 에이전트 정지"
    echo "5) 모든 에이전트 정지"
    echo "6) 모든 에이전트 재시작"
    echo "7) 로그 보기"
    echo "8) 설정 변경"
    echo "0) 종료"
    echo
    read -p "선택하세요: " choice
}

# Main loop
main() {
    while true; do
        show_header
        show_status
        show_menu
        
        case $choice in
            1) ;; # Status already shown
            2) start_single_agent ;;
            3) start_all_agents ;;
            4) stop_single_agent ;;
            5) stop_all_agents ;;
            6) 
                stop_all_agents
                sleep 2
                start_all_agents
                ;;
            7) view_logs ;;
            8) configure_agent ;;
            0) 
                echo "안녕히가세요!"
                exit 0
                ;;
            *)
                echo -e "${RED}잘못된 선택입니다${NC}"
                ;;
        esac
        
        if [ "$choice" != "0" ]; then
            echo
            read -p "계속하려면 Enter를 누르세요..."
        fi
    done
}

# Run main function
main