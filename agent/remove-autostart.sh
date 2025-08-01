#!/bin/bash

# V3 Agent 자동 시작 설정 제거 스크립트

# 색상 코드
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

AUTOSTART_DIR="$HOME/.config/autostart"

echo -e "${BLUE}=== V3 Agent 자동 시작 설정 제거 ===${NC}"
echo ""

# 제거할 파일 목록
FILES=(
    "$AUTOSTART_DIR/v3-agent-chrome.desktop"
    "$AUTOSTART_DIR/v3-agent-firefox.desktop"
    "$AUTOSTART_DIR/v3-agent-webkit.desktop"
)

# 현재 설정된 항목 확인
found=0
echo "현재 설정된 자동 시작 항목:"
for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        browser=$(basename "$file" | sed 's/v3-agent-//;s/.desktop//')
        echo -e "  ${GREEN}✓${NC} ${browser^}"
        found=1
    fi
done

if [ $found -eq 0 ]; then
    echo -e "${YELLOW}  자동 시작 설정이 없습니다.${NC}"
    exit 0
fi

echo ""
read -p "정말 제거하시겠습니까? [y/N]: " confirm

if [[ ! $confirm =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}취소되었습니다.${NC}"
    exit 0
fi

# 파일 제거
echo ""
removed=0
for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        rm -f "$file"
        browser=$(basename "$file" | sed 's/v3-agent-//;s/.desktop//')
        echo -e "${GREEN}✅ ${browser^} 자동 시작 제거됨${NC}"
        removed=$((removed + 1))
    fi
done

echo ""
if [ $removed -gt 0 ]; then
    echo -e "${GREEN}✅ 총 ${removed}개의 자동 시작 설정이 제거되었습니다.${NC}"
    echo "다음 재부팅부터 자동으로 실행되지 않습니다."
else
    echo -e "${YELLOW}제거할 항목이 없습니다.${NC}"
fi

echo ""
echo -e "${BLUE}💡 다시 설정하려면: ./setup-autostart.sh${NC}"