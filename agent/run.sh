#!/usr/bin/env bash

# V3 Batch Check Continuous Runner with Statistics
# 누적 통계 기능이 추가된 지속적 배치 실행 스크립트
# Usage: ./run.sh [browser]
# Examples:
#   ./run.sh          # Chrome (기본값)
#   ./run.sh chrome   # Chrome 명시적 지정
#   ./run.sh firefox  # Firefox 사용

# 브라우저 설정
BROWSER="${1:-chrome}"
export BROWSER

# 색상 코드 정의
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# PostgreSQL 연결 정보
PGHOST="mkt.techb.kr"
PGPORT="5432"
PGDATABASE="productparser_db"
PGUSER="techb_pp"
PGPASSWORD="Tech1324!"

# DB 설정 캐시
declare -A config_cache
config_fetch_count=0
config_refresh_interval=10
run_count=0

# DB에서 설정 가져오기 함수
fetch_config_from_db() {
    # 배열이 선언되지 않았다면 다시 선언
    if ! declare -p config_cache &>/dev/null; then
        declare -gA config_cache
    fi
    
    echo -e "${CYAN}📋 DB에서 설정을 가져오는 중...${NC}"
    
    # psql로 설정 조회
    local query="SELECT config_key, config_value FROM v3_agent_config WHERE config_key IS NOT NULL AND config_value IS NOT NULL"
    local result=$(PGPASSWORD=$PGPASSWORD psql -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDATABASE -t -A -F"|" -c "$query" 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        # 설정 파싱 및 저장
        while IFS='|' read -r key value; do
            # 공백 제거 및 유효성 검사
            key=$(echo "$key" | xargs)
            value=$(echo "$value" | xargs)
            
            if [ -n "$key" ] && [ -n "$value" ]; then
                config_cache["$key"]="$value"
            fi
        done <<< "$result"
        
        echo -e "${GREEN}✅ DB 설정 로드 완료${NC}"
        config_fetch_count=0
        return 0
    else
        echo -e "${RED}❌ DB 설정 로드 실패${NC}"
        return 1
    fi
}

# 설정 가져오기 (캐시에서만)
get_config() {
    local key=$1
    local default_value=$2
    
    # 배열 존재 및 키 존재 확인
    if declare -p config_cache &>/dev/null && [ -n "${config_cache[$key]+x}" ]; then
        echo "${config_cache[$key]}"
    else
        echo "$default_value"
    fi
}

# 초기 설정 로드 및 적용
apply_config() {
    KEYWORDS_PER_BATCH=$(get_config "keywords_per_batch" "1")
    SUCCESS_INTERVAL=$(get_config "success_delay" "5")
    BASE_INTERVAL=$(get_config "no_keyword_delay" "60")
    MAX_INTERVAL=$(get_config "no_keyword_delay_max" "605")
    FAIL_BASE_INTERVAL=$(get_config "fail_delay" "60")
    FAIL_MAX_INTERVAL=$(get_config "fail_delay_max" "600")
    BLOCK_BASE_INTERVAL=$(get_config "block_delay" "20")
    BLOCK_MAX_INTERVAL=$(get_config "block_delay_max" "600")
    
    # config_refresh_interval 업데이트
    local refresh_val=$(get_config "config_refresh_interval" "10")
    if [ -n "$refresh_val" ]; then
        config_refresh_interval=$refresh_val
    fi
}

# 초기 설정 로드
run_count=$((run_count + 1))
fetch_config_from_db
apply_config
current_interval=$SUCCESS_INTERVAL
no_keyword_count=0
fail_count=0
block_count=0

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
    run_count=$((run_count + 1))
    
    # 설정 갱신 체크 (10회마다)
    if [ $((run_count % config_refresh_interval)) -eq 0 ]; then
        echo -e "${CYAN}🔄 설정 갱신 중... (매 ${config_refresh_interval}회 실행마다)${NC}"
        fetch_config_from_db
        apply_config
    fi
    
    # 통계 먼저 표시 (오류 무시)
    show_stats 2>/dev/null || echo -e "${YELLOW}⚠️ 통계 표시 중 오류 (무시됨)${NC}"
    
    echo ""
    echo "========================================="
    echo -e "Run #$total_runs - $(date '+%Y-%m-%d %H:%M:%S') - Browser: ${BROWSER^^}"
    echo "========================================="
    
    # 배치 실행 및 출력 캡처 (간결한 버전 사용)
    output=$(node check.js $KEYWORDS_PER_BATCH 2>&1)
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
    
    # 차단 감지 (네트워크 에러 포함) - 우선순위 최상위
    if echo "$output" | grep -q -E "(ERR_HTTP2_PROTOCOL_ERROR|net::ERR_|BLOCKED|blocked|차단|Timeout.*exceeded|waitForSelector.*Timeout|chrome-error://|Network/page error|Page error detected|browserType\.launch:|Target.*closed|Navigation failed|Error page detected|Execution context was destroyed)"; then
        is_blocked=true
        total_blocked=$((total_blocked + 1))
        # 차단 원인 표시
        if echo "$output" | grep -q "ERR_HTTP2_PROTOCOL_ERROR"; then
            block_reason="🔒 ERR_HTTP2_PROTOCOL_ERROR (HTTPS 차단)"
        elif echo "$output" | grep -q "Security Challenge"; then
            block_reason="🛡️ Coupang Security Challenge"
        elif echo "$output" | grep -q "Bot Detection"; then
            block_reason="🤖 Coupang Bot Detection"
        elif echo "$output" | grep -q "Suspicious Response"; then
            block_reason="⚠️ Suspicious Response"
        elif echo "$output" | grep -q "Timeout.*exceeded"; then
            block_reason="⏱️ Timeout exceeded"
        elif echo "$output" | grep -q "net::ERR_"; then
            block_reason="🌐 Network error"
        elif echo "$output" | grep -q -E "(403 Forbidden|HTTP 403|Error 403)"; then
            block_reason="🚫 HTTP 403 Forbidden"
        elif echo "$output" | grep -q "browserType\.launch:"; then
            block_reason="🖥️ Browser launch failed"
        elif echo "$output" | grep -q "Target.*closed"; then
            block_reason="🎯 Target closed error"
        elif echo "$output" | grep -q "Error page detected"; then
            block_reason="🌐 Error page detected (Network blocked)"
        elif echo "$output" | grep -q "Execution context was destroyed"; then
            block_reason="🔄 Page navigation detected (Context destroyed)"
        else
            block_reason="🚨 Unknown Block"
        fi
    # 키워드 없음 감지
    elif echo "$output" | grep -q "No keywords to check"; then
        total_no_keywords=$((total_no_keywords + 1))
        no_keyword_count=$((no_keyword_count + 1))
    # 성공 감지 (Checked 로그가 있고 Failed가 0인 경우)
    elif echo "$output" | grep -q "Checked: [0-9]"; then
        if echo "$output" | grep -q "Failed: 0"; then
            # 실패가 없으면 성공
            total_success=$((total_success + 1))
        else
            # Failed가 0이 아니면 실패
            total_failed=$((total_failed + 1))
        fi
    # 실패 감지 (마지막 우선순위)
    elif [ $exit_code -ne 0 ] || echo "$output" | grep -q "Failed:"; then
        is_failed=true
        total_failed=$((total_failed + 1))
    fi
    
    # 대기 시간 결정
    if [ "$is_blocked" = true ]; then
        # 차단된 경우
        block_count=$((block_count + 1))
        if [ $block_count -eq 1 ]; then
            current_interval=$BLOCK_BASE_INTERVAL
        else
            current_interval=$((current_interval + 60))
            if [ $current_interval -gt $BLOCK_MAX_INTERVAL ]; then
                current_interval=$BLOCK_MAX_INTERVAL
            fi
        fi
        echo ""
        echo -e "${RED}🚫 Blocked detected: ${block_reason} (${block_count} times)${NC}"
        echo -e "⏱️  Next check in ${current_interval}s"
        no_keyword_count=0
        fail_count=0
        
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
        block_count=0
        
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
        block_count=0
        
    else
        # 성공한 경우
        if [ $no_keyword_count -gt 0 ] || [ $fail_count -gt 0 ] || [ $block_count -gt 0 ] || [ $current_interval -ne $SUCCESS_INTERVAL ]; then
            echo ""
            echo -e "${GREEN}✅ Keyword processed successfully! Next check in ${SUCCESS_INTERVAL}s${NC}"
        fi
        current_interval=$SUCCESS_INTERVAL
        no_keyword_count=0
        fail_count=0
        block_count=0
    fi
    
    # 다음 실행까지 카운트다운
    echo ""
    countdown $current_interval "💤 Next run in:"
done

echo ""
echo "=== Batch check continuous mode ended ==="