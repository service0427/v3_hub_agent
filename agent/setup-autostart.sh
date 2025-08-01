#!/bin/bash

# V3 Agent 자동 시작 설정 스크립트
# VMware 및 일반 Linux 시스템 모두 지원

# 색상 코드
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 스크립트 디렉토리
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTOSTART_DIR="$HOME/.config/autostart"

# 터미널 에뮬레이터 감지
detect_terminal() {
    if command -v gnome-terminal &> /dev/null; then
        echo "gnome-terminal"
    elif command -v konsole &> /dev/null; then
        echo "konsole"
    elif command -v xfce4-terminal &> /dev/null; then
        echo "xfce4-terminal"
    elif command -v mate-terminal &> /dev/null; then
        echo "mate-terminal"
    elif command -v xterm &> /dev/null; then
        echo "xterm"
    else
        echo "none"
    fi
}

# Desktop Entry 생성 함수
create_desktop_entry() {
    local browser=$1
    local position=$2
    local terminal=$(detect_terminal)
    local desktop_file="$AUTOSTART_DIR/v3-agent-${browser}.desktop"
    
    # 터미널별 실행 명령 설정
    case $terminal in
        "gnome-terminal")
            local exec_cmd="gnome-terminal --window --title=\"V3 Agent - ${browser^}\" --geometry=100x30${position} -- bash -c \"cd $SCRIPT_DIR && ./autostart-wrapper.sh $browser; exec bash\""
            ;;
        "konsole")
            local exec_cmd="konsole --title \"V3 Agent - ${browser^}\" --geometry 100x30${position} -e bash -c \"cd $SCRIPT_DIR && ./autostart-wrapper.sh $browser; exec bash\""
            ;;
        "xfce4-terminal")
            local exec_cmd="xfce4-terminal --title=\"V3 Agent - ${browser^}\" --geometry=100x30${position} -x bash -c \"cd $SCRIPT_DIR && ./autostart-wrapper.sh $browser; exec bash\""
            ;;
        "mate-terminal")
            local exec_cmd="mate-terminal --title=\"V3 Agent - ${browser^}\" --geometry=100x30${position} -x bash -c \"cd $SCRIPT_DIR && ./autostart-wrapper.sh $browser; exec bash\""
            ;;
        "xterm")
            local exec_cmd="xterm -title \"V3 Agent - ${browser^}\" -geometry 100x30${position} -e bash -c \"cd $SCRIPT_DIR && ./autostart-wrapper.sh $browser; exec bash\""
            ;;
        *)
            echo -e "${RED}❌ 지원되는 터미널을 찾을 수 없습니다${NC}"
            return 1
            ;;
    esac
    
    # Desktop Entry 파일 생성
    cat > "$desktop_file" << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=V3 Agent - ${browser^}
Comment=V3 Agent ${browser^} browser automation
Exec=$exec_cmd
Icon=utilities-terminal
Terminal=false
Categories=Development;
StartupNotify=true
X-GNOME-Autostart-enabled=true
EOF
    
    chmod +x "$desktop_file"
    echo -e "${GREEN}✅ ${browser^} 자동 시작 설정 완료: $desktop_file${NC}"
}

# 메인 함수
main() {
    echo -e "${BLUE}=== V3 Agent 자동 시작 설정 ===${NC}"
    echo ""
    
    # 터미널 감지
    TERMINAL=$(detect_terminal)
    if [ "$TERMINAL" = "none" ]; then
        echo -e "${RED}❌ 지원되는 터미널 에뮬레이터를 찾을 수 없습니다${NC}"
        echo "지원 터미널: gnome-terminal, konsole, xfce4-terminal, mate-terminal, xterm"
        exit 1
    fi
    
    echo -e "${GREEN}✓ 감지된 터미널: $TERMINAL${NC}"
    
    # autostart 디렉토리 생성
    mkdir -p "$AUTOSTART_DIR"
    
    # autostart-wrapper.sh 파일 확인
    if [ ! -f "$SCRIPT_DIR/autostart-wrapper.sh" ]; then
        echo -e "${YELLOW}⚠️  autostart-wrapper.sh 파일이 없습니다. 생성합니다...${NC}"
        # autostart-wrapper.sh는 별도로 생성됨
    fi
    
    # 설정 옵션 선택
    echo ""
    echo "자동 시작 설정 옵션:"
    echo "1) 모든 브라우저 (Chrome, Firefox, WebKit)"
    echo "2) Chrome만"
    echo "3) Firefox만"
    echo "4) WebKit만"
    echo "5) 사용자 지정 선택"
    echo ""
    read -p "옵션 선택 [1-5]: " choice
    
    case $choice in
        1)
            create_desktop_entry "chrome" "+920+0"
            create_desktop_entry "firefox" "+920+360"
            create_desktop_entry "webkit" "+920+720"
            ;;
        2)
            create_desktop_entry "chrome" "+920+0"
            ;;
        3)
            create_desktop_entry "firefox" "+920+0"
            ;;
        4)
            create_desktop_entry "webkit" "+920+0"
            ;;
        5)
            echo ""
            read -p "Chrome 설정하시겠습니까? [y/N]: " chrome_choice
            if [[ $chrome_choice =~ ^[Yy]$ ]]; then
                create_desktop_entry "chrome" "+920+0"
            fi
            
            read -p "Firefox 설정하시겠습니까? [y/N]: " firefox_choice
            if [[ $firefox_choice =~ ^[Yy]$ ]]; then
                create_desktop_entry "firefox" "+920+360"
            fi
            
            read -p "WebKit 설정하시겠습니까? [y/N]: " webkit_choice
            if [[ $webkit_choice =~ ^[Yy]$ ]]; then
                create_desktop_entry "webkit" "+920+720"
            fi
            ;;
        *)
            echo -e "${RED}❌ 잘못된 선택입니다${NC}"
            exit 1
            ;;
    esac
    
    echo ""
    echo -e "${GREEN}✅ 자동 시작 설정이 완료되었습니다!${NC}"
    echo ""
    echo "다음 재부팅 시 자동으로 실행됩니다."
    echo "설정을 제거하려면: ./remove-autostart.sh"
    echo ""
    echo -e "${YELLOW}💡 팁: 지금 테스트하려면 다음 명령을 실행하세요:${NC}"
    echo "   ~/.config/autostart/v3-agent-chrome.desktop"
}

# 실행
main