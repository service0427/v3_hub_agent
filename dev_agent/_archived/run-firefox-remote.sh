#!/bin/bash

echo "🦊 Starting Firefox in remote debugging mode..."
echo "Please manually navigate to the site after Firefox opens"
echo ""

# Firefox를 디버깅 모드로 실행
firefox --new-instance --profile /tmp/firefox-remote-profile --remote-debugging-port 9222 &

echo "Firefox started with remote debugging on port 9222"
echo "You can now connect to it programmatically"
echo ""
echo "Press Ctrl+C to stop"

wait