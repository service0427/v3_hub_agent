#!/bin/bash

# V3 Agent Quick Deploy Script
# 여러 서버에 동시 배포를 위한 스크립트

set -e

# 색상 정의
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 배포 대상 서버 목록 (수정 필요)
SERVERS=(
    # "user@server1.example.com"
    # "user@server2.example.com"
)

# 설치 스크립트 URL
INSTALL_URL="https://raw.githubusercontent.com/service0427/v3_hub_agent/main/dev_agent/install.sh"

echo -e "${BLUE}=== V3 Agent Multi-Server Deploy ===${NC}"
echo ""

# 서버 목록 확인
if [ ${#SERVERS[@]} -eq 0 ]; then
    echo -e "${YELLOW}⚠️  배포할 서버가 설정되지 않았습니다.${NC}"
    echo "deploy.sh 파일을 편집하여 SERVERS 배열에 서버를 추가하세요."
    echo ""
    echo "예시:"
    echo 'SERVERS=('
    echo '    "user@server1.example.com"'
    echo '    "user@server2.example.com"'
    echo ')'
    exit 1
fi

echo "배포 대상 서버: ${#SERVERS[@]}개"
for server in "${SERVERS[@]}"; do
    echo "  - $server"
done
echo ""

# 확인
read -p "위 서버들에 V3 Agent를 배포하시겠습니까? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "배포가 취소되었습니다."
    exit 0
fi

# 각 서버에 배포
for server in "${SERVERS[@]}"; do
    echo ""
    echo -e "${BLUE}🚀 배포 중: $server${NC}"
    
    # SSH 연결 테스트
    if ! ssh -o ConnectTimeout=5 "$server" "echo '✅ SSH 연결 성공'" 2>/dev/null; then
        echo -e "${RED}❌ $server: SSH 연결 실패${NC}"
        continue
    fi
    
    # 원격 설치 실행
    ssh "$server" "curl -sSL $INSTALL_URL | bash" || {
        echo -e "${RED}❌ $server: 설치 실패${NC}"
        continue
    }
    
    echo -e "${GREEN}✅ $server: 설치 완료${NC}"
done

echo ""
echo -e "${GREEN}=== 배포 완료 ===${NC}"
echo ""
echo "각 서버에서 다음 명령으로 에이전트를 시작하세요:"
echo "  v3-agent start"
echo ""
echo "또는 SSH로 원격 시작:"
for server in "${SERVERS[@]}"; do
    echo "  ssh $server 'v3-agent start'"
done