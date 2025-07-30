#!/bin/bash

# Firefox Nightly Test Runner
# 서비스에 영향 없는 독립적인 테스트

echo "🔥 === Firefox Test Runner ==="
echo ""

# Firefox 설치 확인
if ! command -v firefox &> /dev/null; then
    echo "❌ Firefox is not installed or not in PATH"
    echo "Please install Firefox first:"
    echo "  - Ubuntu: sudo apt install firefox"
    echo "  - Or install Firefox Nightly from: https://www.mozilla.org/firefox/channel/desktop/#nightly"
    exit 1
fi

echo "✅ Firefox found: $(firefox --version 2>/dev/null || echo 'Version check failed')"

# 환경변수 설정
export AGENT_ID="firefox-nightly-test"
export LOG_LEVEL="info"

echo "🚀 Starting Firefox Test (FAST BLOCK DETECTION)..."
echo "Agent ID: $AGENT_ID"
echo "Log Level: $LOG_LEVEL"
echo "⚠️  Will EXIT IMMEDIATELY if blocking detected!"
echo ""

# Node.js로 테스트 실행
node test-nightly.js

exit_code=$?

echo ""
if [ $exit_code -eq 0 ]; then
    echo "🎉 Firefox test completed successfully - NO BLOCKING DETECTED!"
elif [ $exit_code -eq 1 ]; then
    echo "🚨 BLOCKING DETECTED - Test terminated immediately!"
    echo "🛡️  Need to implement anti-blocking measures"
else
    echo "❌ Firefox test failed with exit code: $exit_code"
fi

echo ""
echo "📋 Check logs in: logs/nightly-test-$(date +%Y-%m-%d).log"
echo ""

exit $exit_code