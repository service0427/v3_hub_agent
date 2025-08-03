#!/usr/bin/env bash

# V3 Batch Check Continuous Runner with Statistics
# 누적 통계 기능이 추가된 지속적 배치 실행 스크립트
# Usage: ./run.sh [browser]
# Examples:
#   ./run.sh          # Chrome (기본값)
#   ./run.sh chrome   # Chrome 명시적 지정
#   ./run.sh firefox  # Firefox 사용

# 브라우저 설정 (환경변수가 이미 설정되어 있으면 유지)
if [ -z "$BROWSER" ]; then
    BROWSER="${1:-chrome}"
fi
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

# ========== 자동 업데이트 설정 ==========
# 안전한 임시 디렉토리 설정
get_safe_temp_dir() {
    # 우선순위: 에이전트 디렉토리 > HOME > /tmp
    if [ -w "$HOME/v3-agent" ]; then
        echo "$HOME/v3-agent/.update"
    elif [ -w "$HOME" ]; then
        echo "$HOME/.v3-agent-update"
    elif [ -w "/tmp" ]; then
        echo "/tmp/v3-agent-update"
    else
        echo "/var/tmp/v3-agent-update"
    fi
}

# 디렉토리 생성 및 권한 설정
TEMP_DIR=$(get_safe_temp_dir)
mkdir -p "$TEMP_DIR" 2>/dev/null || {
    echo "⚠️ 임시 디렉토리 생성 실패: $TEMP_DIR"
    TEMP_DIR="."  # 현재 디렉토리 사용
}

UPDATE_LOCK="$TEMP_DIR/update.lock"
UPDATE_CHECK="$TEMP_DIR/last-check"
UPDATE_PID="$TEMP_DIR/update.pid"
UPDATE_INTERVAL=600  # 10분 (600초)

# Stale lock 정리 함수
cleanup_stale_locks() {
    if [ -f "$UPDATE_PID" ]; then
        OLD_PID=$(cat "$UPDATE_PID" 2>/dev/null)
        
        # PID가 존재하는지 확인
        if [ -n "$OLD_PID" ] && ! kill -0 "$OLD_PID" 2>/dev/null; then
            echo "🧹 오래된 Lock 정리 (PID: $OLD_PID)"
            rm -f "$UPDATE_LOCK" "$UPDATE_PID"
        fi
    fi
}

# flock 대체 함수 (flock이 없는 경우)
acquire_lock() {
    local max_wait=10
    local waited=0
    
    while [ $waited -lt $max_wait ]; do
        # 원자적 디렉토리 생성 시도
        if mkdir "$UPDATE_LOCK" 2>/dev/null; then
            echo $$ > "$UPDATE_PID"
            return 0
        fi
        
        # 1초 대기
        sleep 1
        waited=$((waited + 1))
        
        # 5초 후 stale lock 체크
        if [ $waited -eq 5 ]; then
            cleanup_stale_locks
        fi
    done
    
    return 1  # Lock 획득 실패
}

release_lock() {
    rm -rf "$UPDATE_LOCK" "$UPDATE_PID" 2>/dev/null
}

# 안전한 업데이트 체크 함수
safe_update_check() {
    local current_time=$(date +%s)
    local last_check=0
    
    # 1. 마지막 체크 시간 확인
    if [ -f "$UPDATE_CHECK" ] && [ -r "$UPDATE_CHECK" ]; then
        last_check=$(cat "$UPDATE_CHECK" 2>/dev/null || echo 0)
        
        # 숫자 검증
        if ! [[ "$last_check" =~ ^[0-9]+$ ]]; then
            last_check=0
        fi
        
        if [ $((current_time - last_check)) -lt $UPDATE_INTERVAL ]; then
            return 0
        fi
    fi
    
    # 2. Lock 획득
    if ! acquire_lock; then
        echo "[$(date '+%H:%M:%S')] 다른 프로세스가 업데이트 체크 중..."
        return 0
    fi
    
    # trap으로 비정상 종료 시에도 lock 해제
    trap 'release_lock' EXIT INT TERM
    
    # 3. Lock 획득 후 다시 시간 체크
    if [ -f "$UPDATE_CHECK" ]; then
        last_check=$(cat "$UPDATE_CHECK" 2>/dev/null || echo 0)
        if [ $((current_time - last_check)) -lt $UPDATE_INTERVAL ]; then
            release_lock
            trap - EXIT INT TERM
            return 0
        fi
    fi
    
    # 4. 체크 시간 기록
    echo "$current_time" > "$UPDATE_CHECK" || {
        echo "⚠️ 체크 시간 기록 실패"
    }
    
    # 5. Git 상태 확인
    if ! git status >/dev/null 2>&1; then
        echo "❌ Git 저장소가 아닙니다"
        release_lock
        trap - EXIT INT TERM
        return 1
    fi
    
    # 6. 로컬 변경사항 체크
    if ! git diff --quiet || ! git diff --cached --quiet; then
        echo "⚠️ 로컬 변경사항이 있어 업데이트 스킵"
        release_lock
        trap - EXIT INT TERM
        return 0
    fi
    
    # 7. 업데이트 체크 (네트워크 오류 처리)
    echo "[$(date '+%H:%M:%S')] 🔍 업데이트 확인 중... ($BROWSER)"
    
    if ! git fetch origin main --quiet 2>/dev/null; then
        echo "[$(date '+%H:%M:%S')] ⚠️ 네트워크 연결 실패"
        release_lock
        trap - EXIT INT TERM
        return 0
    fi
    
    LOCAL_COMMIT=$(git rev-parse HEAD 2>/dev/null)
    REMOTE_COMMIT=$(git rev-parse origin/main 2>/dev/null)
    
    if [ -z "$LOCAL_COMMIT" ] || [ -z "$REMOTE_COMMIT" ]; then
        echo "[$(date '+%H:%M:%S')] ⚠️ 커밋 정보 확인 실패"
        release_lock
        trap - EXIT INT TERM
        return 0
    fi
    
    if [ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ]; then
        echo "[$(date '+%H:%M:%S')] 🆕 새 버전 발견!"
        echo "  현재: ${LOCAL_COMMIT:0:7}"
        echo "  최신: ${REMOTE_COMMIT:0:7}"
        
        # 백업 생성 (선택사항)
        BACKUP_DIR="$HOME/v3-agent-backup-$(date +%Y%m%d-%H%M%S)"
        cp -r "$HOME/v3-agent" "$BACKUP_DIR" 2>/dev/null && {
            echo "[$(date '+%H:%M:%S')] 💾 백업 생성: $BACKUP_DIR"
        }
        
        # 업데이트 수행
        if git pull origin main --quiet 2>/dev/null; then
            echo "[$(date '+%H:%M:%S')] ✅ 코드 업데이트 성공"
            
            # npm 업데이트 (에러 무시)
            npm install --quiet 2>/dev/null || {
                echo "[$(date '+%H:%M:%S')] ⚠️ npm install 경고 (계속 진행)"
            }
            
            # 재시작 플래그
            touch "$TEMP_DIR/restart-required"
            echo "[$(date '+%H:%M:%S')] 🔄 재시작 필요"
        else
            echo "[$(date '+%H:%M:%S')] ❌ Git pull 실패"
            
            # 롤백 (백업이 있으면)
            if [ -d "$BACKUP_DIR" ]; then
                echo "[$(date '+%H:%M:%S')] 🔙 이전 버전으로 롤백..."
                rm -rf "$HOME/v3-agent"
                mv "$BACKUP_DIR" "$HOME/v3-agent"
            fi
        fi
    else
        echo "[$(date '+%H:%M:%S')] ✓ 최신 버전입니다"
    fi
    
    # 8. 정리
    release_lock
    trap - EXIT INT TERM
    
    return 0
}

# 재시작 체크 함수
check_restart_required() {
    if [ -f "$TEMP_DIR/restart-required" ]; then
        echo "[$(date '+%H:%M:%S')] 🔄 업데이트로 인한 재시작..."
        rm -f "$TEMP_DIR/restart-required"
        
        # 정리 작업
        rm -f "$UPDATE_LOCK" "$UPDATE_PID"
        
        # 새 프로세스로 재시작
        exec "$0" "$@"
    fi
}

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

# 실행 중인 버전 기록
RUNNING_VERSION_FILE="$HOME/v3-agent/.running-version-$BROWSER"
mkdir -p "$(dirname "$RUNNING_VERSION_FILE")"
echo $(git rev-parse HEAD 2>/dev/null) > "$RUNNING_VERSION_FILE"

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

# 코드 버전 체크 함수
check_code_version() {
    if [ -f "$RUNNING_VERSION_FILE" ]; then
        RUNNING_VERSION=$(cat "$RUNNING_VERSION_FILE" 2>/dev/null)
        CURRENT_VERSION=$(git rev-parse HEAD 2>/dev/null)
        
        if [ -n "$RUNNING_VERSION" ] && [ -n "$CURRENT_VERSION" ] && [ "$RUNNING_VERSION" != "$CURRENT_VERSION" ]; then
            echo "[$(date '+%H:%M:%S')] 🔄 코드가 변경되었습니다. 재시작..."
            echo "  실행 중: ${RUNNING_VERSION:0:7}"
            echo "  현재 코드: ${CURRENT_VERSION:0:7}"
            
            # 새 버전 기록
            echo "$CURRENT_VERSION" > "$RUNNING_VERSION_FILE"
            
            # 재시작
            exec "$0" "$@"
        fi
    fi
}

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
    
    # 자동 업데이트 체크 (매 사이클마다, 10분 간격)
    safe_update_check
    
    # 재시작 필요 여부 확인
    check_restart_required
    
    # 코드 버전 체크 (다른 브라우저가 업데이트했을 수 있음)
    check_code_version
    
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
    
    # 차단 감지 (실제 네트워크 차단만) - 우선순위 최상위
    if echo "$output" | grep -q -E "(ERR_HTTP2_PROTOCOL_ERROR|ERR_CONNECTION_CLOSED|NS_ERROR_NET_INTERRUPT|HTTP/2 Error: INTERNAL_ERROR|net::ERR_FAILED|403 Forbidden|BLOCKED|blocked|차단|Bot Detection|Security Challenge|chrome-error://|Error page detected|WebKit search navigation failed|infinite loading suspected)"; then
        is_blocked=true
        total_blocked=$((total_blocked + 1))
        # 차단 원인 표시
        if echo "$output" | grep -q "ERR_HTTP2_PROTOCOL_ERROR"; then
            block_reason="🔒 ERR_HTTP2_PROTOCOL_ERROR (HTTPS 차단)"
        elif echo "$output" | grep -q "NS_ERROR_NET_INTERRUPT"; then
            block_reason="🔒 NS_ERROR_NET_INTERRUPT (Firefox 네트워크 차단)"
        elif echo "$output" | grep -q "HTTP/2 Error: INTERNAL_ERROR"; then
            block_reason="🔒 HTTP/2 Error: INTERNAL_ERROR (WebKit 네트워크 차단)"
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
        elif echo "$output" | grep -q -E "(WebKit search navigation failed|infinite loading suspected)"; then
            block_reason="🔄 WebKit 무한 로딩 (검색 페이지 전환 실패)"
        else
            block_reason="🚨 Unknown Block"
        fi
    # 타임아웃 감지 (차단이 아님)
    elif echo "$output" | grep -q -E "(Timeout.*exceeded|waitForSelector.*Timeout|waitForFunction.*Timeout)"; then
        total_failed=$((total_failed + 1))
        echo ""
        echo -e "${YELLOW}⏱️ Timeout occurred - retrying immediately${NC}"
        current_interval=$SUCCESS_INTERVAL  # 5초만 대기
        no_keyword_count=0
        fail_count=0
        block_count=0
        
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