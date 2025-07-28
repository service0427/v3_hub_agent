#!/bin/bash

# V3 Keyword Sync Runner
# MySQL에서 PostgreSQL로 키워드 동기화

echo "=== V3 Keyword Sync ==="
echo "Time: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# 환경변수 설정
export DB_HOST=mkt.techb.kr
export DB_PORT=5432
export DB_NAME=productparser_db
export DB_USER=techb_pp
export DB_PASSWORD=Tech1324!

# 동기화 실행
node /home/tech/v3_hub_agent/scripts/sync-keywords.js

echo ""
echo "=== Sync completed ==="