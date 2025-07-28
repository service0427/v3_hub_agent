#!/bin/bash

# V3 Batch Check Continuous Runner
# 지속적으로 배치를 실행하는 스크립트

echo "=== V3 Batch Check Continuous Mode ==="
echo ""

# 고정값 설정
KEYWORDS_PER_BATCH=1
SUCCESS_INTERVAL=5      # 성공 시 5초 대기
BASE_INTERVAL=60        # 키워드 없을 때 기본 60초
MAX_INTERVAL=605        # 최대 605초
current_interval=$SUCCESS_INTERVAL
no_keyword_count=0

echo "Configuration:"
echo "- Keywords per batch: $KEYWORDS_PER_BATCH"
echo "- Success interval: ${SUCCESS_INTERVAL}s"
echo "- No keyword base interval: ${BASE_INTERVAL}s"
echo "- Max interval: ${MAX_INTERVAL}s"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# 실행 카운터
run_count=0

# 카운트다운 표시 함수
countdown() {
    local seconds=$1
    local message=$2
    
    echo -ne "\r$message"
    
    while [ $seconds -gt 0 ]; do
        local mins=$((seconds / 60))
        local secs=$((seconds % 60))
        echo -ne "\r$message $(printf "%02d:%02d" $mins $secs) "
        sleep 1
        ((seconds--))
    done
    echo -ne "\r                                                              \r"
}

# 메인 루프
while true; do
    run_count=$((run_count + 1))
    
    echo "========================================="
    echo "Run #$run_count - $(date '+%Y-%m-%d %H:%M:%S')"
    echo "========================================="
    
    # 배치 실행 및 출력 캡처
    output=$(node batch-check-api.js $KEYWORDS_PER_BATCH 2>&1)
    exit_code=$?
    
    # 출력 표시
    echo "$output"
    
    # 종료 코드 확인
    if [ $exit_code -ne 0 ]; then
        echo "⚠️  Batch check failed with exit code: $exit_code"
    fi
    
    # "No keywords to check" 확인
    if echo "$output" | grep -q "No keywords to check"; then
        no_keyword_count=$((no_keyword_count + 1))
        
        # 첫 번째 "No keywords"일 때 BASE_INTERVAL로 설정
        if [ $no_keyword_count -eq 1 ]; then
            current_interval=$BASE_INTERVAL
        else
            # 이후부터 60초씩 증가 (최대 605초까지)
            current_interval=$((current_interval + 60))
            if [ $current_interval -gt $MAX_INTERVAL ]; then
                current_interval=$MAX_INTERVAL
            fi
        fi
        
        echo ""
        echo "📊 No keywords found (${no_keyword_count} times)"
        echo "⏱️  Next check in ${current_interval}s"
    else
        # 키워드가 있으면 5초로 설정
        if [ $no_keyword_count -gt 0 ] || [ $current_interval -ne $SUCCESS_INTERVAL ]; then
            echo ""
            echo "✅ Keyword processed! Next check in ${SUCCESS_INTERVAL}s"
        fi
        current_interval=$SUCCESS_INTERVAL
        no_keyword_count=0
    fi
    
    # 다음 실행까지 카운트다운
    echo ""
    countdown $current_interval "💤 Next run in:"
done

echo ""
echo "=== Batch check continuous mode ended ==="