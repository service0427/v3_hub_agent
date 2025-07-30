#!/bin/bash

# V3 Batch Check Continuous Runner with Statistics
# 누적 통계 기능이 추가된 지속적 배치 실행 스크립트

# 색상 코드 정의
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 고정값 설정
KEYWORDS_PER_BATCH=1
SUCCESS_INTERVAL=5      # 성공 시 5초 대기
BASE_INTERVAL=60        # 키워드 없을 때 기본 60초
MAX_INTERVAL=605        # 최대 605초
FAIL_BASE_INTERVAL=60   # 실패 시 기본 60초
FAIL_MAX_INTERVAL=600   # 실패 시 최대 600초
current_interval=$SUCCESS_INTERVAL
no_keyword_count=0
fail_count=0

# 누적 통계 변수
total_runs=0
total_success=0
total_failed=0
total_no_keywords=0
total_blocked=0
session_start_time=$(date '+%Y-%m-%d %H:%M:%S')
session_start_seconds=$(date +%s)

# 세션 경과 시간 계산
calculate_duration() {
    local now=$(date +%s)
    local diff=$((now - session_start_seconds))
    local hours=$((diff / 3600))
    local minutes=$(((diff % 3600) / 60))
    local seconds=$((diff % 60))
    printf "%02d:%02d:%02d" $hours $minutes $seconds
}

# 성공률 계산
calculate_success_rate() {
    local total_attempts=$((total_success + total_failed + total_blocked))
    if [ $total_attempts -eq 0 ]; then
        echo "0"
    else
        echo "scale=1; $total_success * 100 / $total_attempts" | bc
    fi
}

# 통계 표시 함수
show_stats() {
    echo -e "\n${BLUE}📊 ============== 세션 누적 통계 ==============${NC}"
    echo -e "🕐 시작 시간: $session_start_time"
    echo -e "⏱️  경과 시간: $(calculate_duration)"
    echo -e "🔄 전체 실행: ${CYAN}$total_runs${NC}회"
    echo ""
    echo -e "✅ ${GREEN}성공: $total_success${NC}"
    echo -e "❌ ${RED}실패: $total_failed${NC}"
    echo -e "🚫 ${RED}차단: $total_blocked${NC}"
    echo -e "📭 ${YELLOW}키워드 없음: $total_no_keywords${NC}"
    echo ""
    local success_rate=$(calculate_success_rate)
    echo -e "📈 성공률: ${GREEN}${success_rate}%${NC}"
    local total_attempts=$((total_success + total_failed + total_blocked))
    echo -e "🔍 전체 시도: $total_attempts"
    echo -e "${BLUE}=============================================${NC}"
}

# 초기 화면 표시
clear
echo -e "${CYAN}=== V3 Batch Check Continuous Mode (with Stats) ===${NC}"
echo ""
echo "Configuration:"
echo "- Keywords per batch: $KEYWORDS_PER_BATCH"
echo "- Success interval: ${SUCCESS_INTERVAL}s"
echo "- No keyword base interval: ${BASE_INTERVAL}s"
echo "- No keyword max interval: ${MAX_INTERVAL}s"
echo "- Fail base interval: ${FAIL_BASE_INTERVAL}s"
echo "- Fail max interval: ${FAIL_MAX_INTERVAL}s"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
echo ""

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
    total_runs=$((total_runs + 1))
    
    # 통계 먼저 표시
    show_stats
    
    echo ""
    echo "========================================="
    echo -e "Run #$total_runs - $(date '+%Y-%m-%d %H:%M:%S')"
    echo "========================================="
    
    # 배치 실행 및 출력 캡처 (간결한 버전 사용)
    output=$(node batch-check-api-simple.js $KEYWORDS_PER_BATCH 2>&1)
    exit_code=$?
    
    # 출력 표시
    echo "$output"
    
    # 종료 코드 확인
    if [ $exit_code -ne 0 ]; then
        echo -e "${YELLOW}⚠️  Batch check failed with exit code: $exit_code${NC}"
    fi
    
    # 결과 분석 및 통계 업데이트
    is_failed=false
    is_blocked=false
    
    # 차단 감지 (네트워크 에러 포함)
    if echo "$output" | grep -q -E "(BLOCKED|blocked|차단|Timeout exceeded|403|chrome-error://|Network/page error|Page error detected|ERR_HTTP2_PROTOCOL_ERROR)"; then
        is_blocked=true
        total_blocked=$((total_blocked + 1))
    # 실패 감지
    elif [ $exit_code -ne 0 ] || echo "$output" | grep -q "Failed:"; then
        is_failed=true
        total_failed=$((total_failed + 1))
    # 키워드 없음 감지
    elif echo "$output" | grep -q "No keywords to check"; then
        total_no_keywords=$((total_no_keywords + 1))
        no_keyword_count=$((no_keyword_count + 1))
    # 성공
    elif echo "$output" | grep -q -E "(Found at rank|✅|Success)"; then
        total_success=$((total_success + 1))
    fi
    
    # 대기 시간 결정
    if [ "$is_blocked" = true ]; then
        # 차단된 경우
        fail_count=$((fail_count + 1))
        if [ $fail_count -eq 1 ]; then
            current_interval=$FAIL_BASE_INTERVAL
        else
            current_interval=$((current_interval + 60))
            if [ $current_interval -gt $FAIL_MAX_INTERVAL ]; then
                current_interval=$FAIL_MAX_INTERVAL
            fi
        fi
        echo ""
        echo -e "${RED}🚫 Blocked detected (${fail_count} times)${NC}"
        echo -e "⏱️  Next check in ${current_interval}s"
        no_keyword_count=0
        
    elif echo "$output" | grep -q "No keywords to check"; then
        # 키워드 없는 경우
        if [ $no_keyword_count -eq 1 ]; then
            current_interval=$BASE_INTERVAL
        else
            current_interval=$((current_interval + 60))
            if [ $current_interval -gt $MAX_INTERVAL ]; then
                current_interval=$MAX_INTERVAL
            fi
        fi
        echo ""
        echo -e "${YELLOW}📊 No keywords found (${no_keyword_count} times)${NC}"
        echo -e "⏱️  Next check in ${current_interval}s"
        fail_count=0
        
    elif [ "$is_failed" = true ]; then
        # 실패한 경우
        fail_count=$((fail_count + 1))
        if [ $fail_count -eq 1 ]; then
            current_interval=$FAIL_BASE_INTERVAL
        else
            current_interval=$((current_interval + 60))
            if [ $current_interval -gt $FAIL_MAX_INTERVAL ]; then
                current_interval=$FAIL_MAX_INTERVAL
            fi
        fi
        echo ""
        echo -e "${RED}❌ Batch failed (${fail_count} times)${NC}"
        echo -e "⏱️  Next check in ${current_interval}s"
        no_keyword_count=0
        
    else
        # 성공한 경우
        if [ $no_keyword_count -gt 0 ] || [ $fail_count -gt 0 ] || [ $current_interval -ne $SUCCESS_INTERVAL ]; then
            echo ""
            echo -e "${GREEN}✅ Keyword processed successfully! Next check in ${SUCCESS_INTERVAL}s${NC}"
        fi
        current_interval=$SUCCESS_INTERVAL
        no_keyword_count=0
        fail_count=0
    fi
    
    # 다음 실행까지 카운트다운
    echo ""
    countdown $current_interval "💤 Next run in:"
done

echo ""
echo "=== Batch check continuous mode ended ==="