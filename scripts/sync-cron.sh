#!/bin/bash

# Cron 설정 스크립트
# 10분마다 동기화 실행

echo "=== V3 Keyword Sync Cron Setup ==="
echo ""

# 현재 crontab 백업
crontab -l > /tmp/current_cron 2>/dev/null || true

# 기존 sync 항목 제거
grep -v "v3_hub_agent/scripts/run-sync.sh" /tmp/current_cron > /tmp/new_cron || true

# 새로운 cron 항목 추가
echo "# V3 Keyword Sync - Every 10 minutes" >> /tmp/new_cron
echo "*/10 * * * * /home/tech/v3_hub_agent/scripts/run-sync.sh >> /home/tech/v3_hub_agent/logs/sync-cron.log 2>&1" >> /tmp/new_cron

# 새로운 crontab 설치
crontab /tmp/new_cron

echo "✅ Cron job installed successfully"
echo ""
echo "Current crontab:"
crontab -l | grep v3_hub_agent || echo "No V3 jobs found"

echo ""
echo "To check sync logs:"
echo "tail -f /home/tech/v3_hub_agent/logs/sync-cron.log"