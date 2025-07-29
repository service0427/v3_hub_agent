# 🔄 MySQL 동기화 시스템 가이드

## 📋 시스템 개요
**PostgreSQL → MySQL 실시간 순위 동기화 시스템**
- 쿠팡 상품 순위 데이터를 10분마다 자동 동기화
- 순위 변동 추적 및 상품 미존재 자동 감지

---

## 🗄️ 데이터베이스 구조

### 📥 소스: PostgreSQL
**`v3_keyword_ranking_checks` 테이블**
```
• keyword          : 검색 키워드
• product_code     : 쿠팡 상품 코드  
• check_1~10       : 10분 간격 순위 (1~300 또는 0)
• check_date       : 체크 날짜
```

**`v3_keyword_list` 테이블**
```
• product_name     : 상품명
• thumbnail_url    : 썸네일 URL
```

### 📤 타겟: MySQL
**`ad_slots` 테이블 업데이트 필드**
```
• rank_check_date  : 순위 체크 날짜
• rank_status      : SUCCESS / FAILED / CHECKING
• price_start_rank : 최초 최악 순위 (예: 100등)
• price_rank       : 현재 최고 순위 (예: 10등)  
• price_rank_diff  : 순위 개선폭
• product_name     : 상품명 (NULL만 업데이트)
• product_thumbnail: 썸네일 (NULL만 업데이트)
```

---

## 📊 처리 로직 상세

### 🎯 데이터 매칭 방식
```sql
WHERE REPLACE(TRIM(main_keyword), ' ', '') = ?
  AND product_url LIKE '%/vp/products/{상품코드}%'
  AND status = 'ACTIVE'
  AND is_active = 1
```

### 📈 순위 계산 예시
```
체크 데이터: [14, 26, 31, 0, 0, 28]
            ↓ (0 제외)
유효 순위: [14, 26, 31, 28]
            ↓
최고 순위: 14 (bestRank)
최악 순위: 31 (worstRank)
```

---

## 💾 처리 케이스별 동작

### ✅ Case 1: 정상 순위
```
[입력 데이터]
키워드: "무선청소기"
상품코드: "8814700563"
순위: 21, 84, 50

[MySQL 업데이트]
• rank_status      = 'SUCCESS'
• price_start_rank = 84 (첫 동기화시만)
• price_rank       = 21
• price_rank_diff  = 63 (개선됨)
```

### ❌ Case 2: 상품 미존재
```
[입력 데이터]
키워드: "무선청소기"
상품코드: "1471908737"
순위: 0, 0, 0 (모두 0)

[MySQL 업데이트]
• rank_status      = 'FAILED'
• price_start_rank = 0 (NULL→0)
• price_rank       = 0
• price_rank_diff  = 0

[crawling_errors 추가]
"상품 미존재 - 키워드: 무선청소기, 
 제품코드: 1471908737 (300등 이내에서 찾을 수 없음)"
```

### ⏭️ Case 3: 미체크 상태
```
[입력 데이터]
모든 체크: null

[처리]
SKIP → rank_status는 'CHECKING' 유지
```

---

## 📊 동기화 통계 (PostgreSQL)

**`v3_mysql_sync_logs` 테이블**
```
• sync_date         : 동기화 날짜
• started_at        : 시작 시간
• completed_at      : 완료 시간
• total_processed   : 총 처리 건수
• rankings_updated  : 순위 업데이트
• product_info_updated : 상품정보 업데이트
• failed_rankings   : FAILED 처리
• error_logs_created: 에러 로그 생성
• status           : SUCCESS/FAILED
```

---

## 🚀 실행 방법

### 수동 실행
```bash
# 실제 실행
node scripts/sync-to-mysql.js

# 테스트 (업데이트 안함)
node scripts/sync-to-mysql.js --dry-run

# 10건만 테스트
node scripts/sync-to-mysql.js --limit 10
```

### 자동 실행 (크론탭)
```
*/10 * * * * cd /home/tech/v3_hub_agent && 
             node scripts/sync-to-mysql.js >> 
             logs/sync-to-mysql-cron.log 2>&1
```

---

## ⚡ 성능 지표
- **실행 주기**: 10분마다
- **처리 시간**: 약 8초 (300건 기준)
- **로그 위치**: `logs/sync-to-mysql-cron.log`

---

## 🔍 주요 특징
1. **효율적 JOIN**: 한 번의 쿼리로 모든 데이터 조회
2. **NULL 체크**: 기존 데이터 보존 (덮어쓰지 않음)
3. **자동 로깅**: 모든 동기화 작업 기록
4. **에러 추적**: 상품 미존재 자동 감지

---

_마지막 업데이트: 2025-07-29_