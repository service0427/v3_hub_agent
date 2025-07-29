# sync-keywords.js 가이드

## 📋 개요
MySQL → PostgreSQL(V3) 키워드 동기화 스크립트
- **위치**: `/home/tech/v3_hub_agent/scripts/sync-keywords.js`
- **실행 주기**: 10분마다 (크론탭)
- **주요 기능**: ad_slots에서 활성 키워드를 V3로 동기화

## 🗄️ 데이터베이스 연결 정보

### MySQL (소스)
```javascript
host: '138.2.125.63'
user: 'magic_dev'
password: '!magic00'
database: 'magic_db'
```

### PostgreSQL (타겟)
```javascript
host: process.env.DB_HOST || 'mkt.techb.kr'
port: process.env.DB_PORT || '5432'
database: process.env.DB_NAME || 'productparser_db'
user: process.env.DB_USER || 'techb_pp'
password: process.env.DB_PASSWORD || 'Tech1324!'
```

## 🔄 환경변수 자동 설정
```javascript
// 스크립트 시작 시 자동으로 설정됨
process.env.DB_HOST = 'mkt.techb.kr';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'productparser_db';
process.env.DB_USER = 'techb_pp';
process.env.DB_PASSWORD = 'Tech1324!';
```

## 📊 주요 테이블

### MySQL 테이블
- `ad_slots`: 광고 슬롯 (소스)
  - edit_main_keyword: 키워드
  - product_id: 쿠팡 상품 ID
  - product_name: 상품명
  - product_url: 상품 URL
  - product_thumbnail: 썸네일 URL

### PostgreSQL 테이블
- `v3_keyword_list`: V3 키워드 리스트 (타겟)
  - keyword: 키워드
  - product_code: 상품 코드
  - product_name: 상품명
  - product_url: 상품 URL
  - thumbnail_url: 썸네일 URL
  - is_active: 활성 상태
  - last_sync_at: 마지막 동기화 시간

## 🔄 동기화 프로세스

### 1. MySQL에서 활성 키워드 조회
```sql
SELECT 
  edit_main_keyword, product_id, product_name, 
  product_url, product_thumbnail,
  COUNT(*) as count
FROM ad_slots
WHERE status = 'ACTIVE' 
  AND is_active = 1
  AND (
    (hourly_1 = 1 AND hour_1 = HOUR(NOW())) OR
    (hourly_2 = 1 AND hour_2 = HOUR(NOW())) OR
    (hourly_3 = 1 AND hour_3 = HOUR(NOW())) OR
    ...
  )
GROUP BY edit_main_keyword, product_id
```

### 2. PostgreSQL 기존 데이터 확인
```sql
SELECT keyword, product_code, is_active 
FROM v3_keyword_list
```

### 3. 동기화 작업
- **INSERT**: MySQL에만 있는 새 키워드
- **UPDATE**: 양쪽에 있지만 정보가 변경된 키워드
- **DEACTIVATE**: PostgreSQL에만 있는 키워드 (is_active = FALSE)

### 4. INSERT 쿼리
```sql
INSERT INTO v3_keyword_list 
(keyword, product_code, product_name, product_url, 
 thumbnail_url, is_active, last_sync_at)
VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
ON CONFLICT (keyword, product_code) DO NOTHING
```

### 5. UPDATE 쿼리
```sql
UPDATE v3_keyword_list 
SET product_name = $1,
    product_url = $2,
    thumbnail_url = $3,
    is_active = TRUE,
    last_sync_at = NOW(),
    updated_at = NOW()
WHERE keyword = $4 AND product_code = $5
```

### 6. DEACTIVATE 쿼리
```sql
UPDATE v3_keyword_list 
SET is_active = FALSE, updated_at = NOW()
WHERE keyword = $1 AND product_code = $2 AND is_active = TRUE
```

## 📊 시간대별 체크 로직
ad_slots의 hourly 설정에 따라 현재 시간에 해당하는 키워드만 동기화:
- hourly_1 = 1 AND hour_1 = 현재시간
- hourly_2 = 1 AND hour_2 = 현재시간
- ... (최대 24개 조건)

## 📝 로그 파일
- 일반 로그: `logs/sync-keywords-{날짜}.log`
- 크론 로그: `logs/sync-keywords-cron.log`

## 🚀 실행 방법
```bash
# 직접 실행
cd /home/tech/v3_hub_agent
node scripts/sync-keywords.js

# 환경변수 직접 설정
DB_HOST=mkt.techb.kr DB_PORT=5432 node scripts/sync-keywords.js
```

## 📊 출력 메시지
```
=== V3 Keyword Sync ===
Time: 2025. 7. 29. 오후 2:24:18

[로그 메시지들...]

=== Sync completed ===
```

## 🔧 주요 로직 포인트

### 중복 제거
- MySQL에서 keyword + product_id 조합으로 GROUP BY
- PostgreSQL UNIQUE 제약: (keyword, product_code)

### 비활성화 로직
- MySQL에 없지만 PostgreSQL에 있는 키워드
- is_active = FALSE로 변경 (삭제하지 않음)

### 동기화 시간 추적
- last_sync_at: 마지막 동기화 시간 기록
- 60분 이내 동기화된 키워드만 batch API에서 사용

## ⚠️ 주의사항
- product_id (MySQL) = product_code (PostgreSQL)
- 시간대별 체크 조건이 복잡하므로 수정 시 주의
- 비활성화는 하지만 삭제는 하지 않음 (데이터 보존)

---
_마지막 업데이트: 2025-07-29_