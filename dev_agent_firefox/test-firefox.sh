#!/bin/bash

# Firefox 전용 테스트 스크립트
echo "🦊 Firefox 에이전트 테스트 시작..."
echo ""

# 환경 변수 설정
export NODE_ENV=development
export HUB_API_URL=http://u24.techb.kr:3331
export LOG_LEVEL=debug

# 한 건 체크 실행
echo "키워드 한 건 체크 중..."
node check.js 1

echo ""
echo "테스트 완료!"
echo "정상 작동 시 ./run.sh로 연속 실행 가능"