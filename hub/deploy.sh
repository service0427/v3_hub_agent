#!/bin/bash

# ParserHub V3 Hub Server Deploy Script

echo "🚀 ParserHub V3 Hub Server 배포 스크립트"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
  echo -e "${RED}root 권한으로 실행하지 마세요${NC}"
  exit 1
fi

# Build TypeScript
echo "📦 TypeScript 빌드 중..."
npm run build

if [ $? -ne 0 ]; then
  echo -e "${RED}빌드 실패${NC}"
  exit 1
fi

echo -e "${GREEN}빌드 완료${NC}"

# Check if .env exists
if [ ! -f .env ]; then
  echo -e "${RED}.env 파일이 없습니다. .env.example을 복사하여 설정하세요.${NC}"
  exit 1
fi

# Update .env for production
echo "🔧 Production 환경 설정 중..."
sed -i 's/NODE_ENV=development/NODE_ENV=production/g' .env
sed -i 's/LOG_LEVEL=debug/LOG_LEVEL=info/g' .env

# Install production dependencies only
echo "📦 Production 의존성 설치 중..."
npm ci --only=production

# Create logs directory
mkdir -p logs

# Kill existing process if running
echo "🔄 기존 프로세스 확인 중..."
PID=$(lsof -t -i:8545)
if [ ! -z "$PID" ]; then
  echo "기존 프로세스 종료 중... (PID: $PID)"
  kill -9 $PID
  sleep 2
fi

# Start server with PM2
echo "🚀 PM2로 서버 시작 중..."
if ! command -v pm2 &> /dev/null; then
  echo "PM2 설치 중..."
  npm install -g pm2
fi

# Start with PM2
pm2 delete parserhub-v3 2>/dev/null
pm2 start dist/index.js --name parserhub-v3 \
  --error ./logs/pm2-error.log \
  --output ./logs/pm2-out.log \
  --merge-logs \
  --time

# Save PM2 process list
pm2 save

# Setup PM2 startup
pm2 startup systemd -u $USER --hp $HOME

echo -e "${GREEN}✅ 배포 완료!${NC}"
echo ""
echo "📊 서버 상태 확인:"
echo "  pm2 status"
echo "  pm2 logs parserhub-v3"
echo ""
echo "🌐 접속 URL:"
echo "  http://u24.techb.kr:8545/health"
echo "  http://u24.techb.kr:8545/api/v3/agents/status"
echo ""
echo "🔧 서버 관리:"
echo "  pm2 restart parserhub-v3"
echo "  pm2 stop parserhub-v3"
echo "  pm2 delete parserhub-v3"