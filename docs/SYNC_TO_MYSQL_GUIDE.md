# sync-to-mysql.js 가이드

## 📋 개요
PostgreSQL(V3) → MySQL 데이터 동기화 스크립트
- **위치**: `/home/tech/v3_hub_agent/scripts/sync-to-mysql.js`
- **실행 주기**: 10분마다 (크론탭)
- **주요 기능**: 순위 데이터 동기화, crawling_errors 관리

## 🗄️ 데이터베이스 연결 정보

### PostgreSQL (소스)
```javascript
host: 'mkt.techb.kr'
port: 5432
database: 'productparser_db'
user: 'techb_pp'
password: 'Tech1324!'
```

### MySQL (타겟)
```javascript
host: '138.2.125.63'
user: 'magic_dev'
password: '!magic00'
database: 'magic_db'
```

## 📊 주요 테이블

### PostgreSQL 테이블
- `v3_keyword_ranking_checks`: 순위 체크 데이터
  - check_1~10: 10분 간격 순위 (0 = 상품 없음)
  - last_synced_check: 마지막 동기화 체크 번호
  - is_completed: 완료 여부
- `v3_keyword_list`: 키워드 리스트 및 상품 정보
- `v3_mysql_sync_logs`: 동기화 로그

### MySQL 테이블
- `ad_slots`: 광고 슬롯 (업데이트 대상)
  - rank_status: SUCCESS/FAILED/CHECKING
  - price_start_rank: 최악 순위 (높은 숫자)
  - price_rank: 최고 순위 (낮은 숫자)
  - price_rank_diff: 순위 개선폭
- `crawling_errors`: 에러 로그

## 🔄 동기화 로직

### 1. 데이터 조회
```sql
SELECT ... FROM v3_keyword_ranking_checks krc
LEFT JOIN v3_keyword_list kl ON ...
WHERE krc.check_date = CURRENT_DATE
  AND krc.total_checks > COALESCE(krc.last_synced_check, 0)
```

### 2. 순위 계산
```javascript
// 0을 제외한 유효 순위만 계산
const validRanks = checks.filter(r => r !== null && r > 0);
const bestRank = Math.min(...validRanks);   // 최고 순위 (낮은 값)
const worstRank = Math.max(...validRanks);  // 최악 순위 (높은 값)
```

### 3. 상품 없음 처리 (allZeros)
```javascript
// 모든 체크가 0인 경우
if (allZeros) {
  // 1) rank_status = 'FAILED' 업데이트
  // 2) crawling_errors 처리
  //    - 오늘 기존 에러 확인
  //    - resolved_at이 있으면 스킵
  //    - retry_count < 3이면 +1
  //    - retry_count >= 3이면 스킵
  //    - 없으면 새로 INSERT (retry_count = 1)
}
```

### 4. 정상 순위 처리
```javascript
// 순위가 발견된 경우
if (bestRank && worstRank) {
  // 1) ad_slots 업데이트
  //    - rank_status = 'SUCCESS'
  //    - price_start_rank = worstRank (NULL일 때만)
  //    - price_rank = bestRank (항상)
  //    - price_rank_diff 계산
  
  // 2) crawling_errors resolved_at 업데이트
  //    - 오늘 날짜의 미해결 에러를 resolved_at = NOW()로 설정
}
```

### 5. last_synced_check 업데이트
```sql
UPDATE v3_keyword_ranking_checks 
SET last_synced_check = ? 
WHERE id = ?
```

## ⚠️ 중요 로직

### crawling_errors retry_count 관리
- **첫 실패**: INSERT with retry_count = 1
- **재실패**: UPDATE retry_count + 1 (최대 3)
- **최대 도달**: 더 이상 업데이트 안함
- **해결됨**: resolved_at = NOW()
- **해결 후 재실패**: 스킵 (하루 1회만)

### 매칭 조건
```sql
-- MySQL ad_slots 찾기
WHERE REPLACE(TRIM(main_keyword), ' ', '') = ? 
  AND product_url LIKE CONCAT('%/vp/products/', ?, '%')
  AND status = 'ACTIVE'
  AND is_active = 1
```

## 📝 로그 파일
- 일반 로그: `logs/sync-to-mysql-{날짜}.log`
- 크론 로그: `logs/sync-to-mysql-cron.log`

## 🚀 실행 방법
```bash
# 수동 실행
node scripts/sync-to-mysql.js

# 테스트 (업데이트 안함)
node scripts/sync-to-mysql.js --dry-run

# 제한된 수 테스트
node scripts/sync-to-mysql.js --limit 10
```

## 🔧 주요 함수

### calculateRanks(row)
- 순위 계산 및 스킵 여부 판단
- bestRank, worstRank, allZeros 반환

### createSyncLog() / updateSyncLog()
- PostgreSQL v3_mysql_sync_logs 테이블에 로그 기록

## 📊 통계 객체
```javascript
stats = {
  totalProcessed: 0,      // 총 처리 건수
  rankingsUpdated: 0,     // 순위 업데이트
  productInfoUpdated: 0,  // 상품정보 업데이트
  failedRankings: 0,      // FAILED 처리
  crawlingErrorsCreated: 0, // 새 에러 생성
  skipped: 0,            // 스킵된 건수
  failed: 0              // 처리 실패
}
```

---
_마지막 업데이트: 2025-07-29_