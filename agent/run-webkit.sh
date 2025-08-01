#!/bin/bash
# WebKit 브라우저로 실행

# 색상 코드
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Linux에서 WebKit 의존성 체크
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # libwpe 체크 (WebKit의 핵심 의존성)
    if ! ldconfig -p | grep -q "libwpe-1.0.so"; then
        echo -e "${YELLOW}⚠️  WebKit 시스템 의존성이 없습니다.${NC}"
        echo -e "${YELLOW}   다음 명령어로 설치하세요:${NC}"
        echo -e "${YELLOW}   sudo npx playwright install-deps webkit${NC}"
        echo ""
        echo -e "${RED}WebKit이 제대로 작동하지 않을 수 있습니다.${NC}"
        echo "계속하시겠습니까? (y/N)"
        read -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
fi

export BROWSER=webkit
exec ./run.sh webkit