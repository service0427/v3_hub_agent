#!/bin/bash
# WebKit 브라우저로 실행

# 색상 코드
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Linux에서 WebKit 의존성 체크 및 자동 설치
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # WebKit 관련 패키지 체크 (dpkg가 더 정확함)
    if ! dpkg -l | grep -q "libwebkit2gtk"; then
        echo -e "${YELLOW}🔧 WebKit 시스템 의존성을 자동 설치합니다...${NC}"
        sudo npx playwright install-deps webkit || {
            echo -e "${RED}❌ 의존성 설치 실패${NC}"
            exit 1
        }
    fi
fi

export BROWSER=webkit
exec ./run.sh webkit