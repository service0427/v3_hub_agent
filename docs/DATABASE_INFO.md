# 데이터베이스 연결 정보

## 🗄️ 운영 PostgreSQL 데이터베이스

### 접속 정보
- **Host**: `mkt.techb.kr`
- **Port**: `5432`
- **Database**: `productparser_db`
- **User**: `techb_pp`
- **Password**: `Tech1324!`

### 접속 방법

#### 1. psql 직접 접속
```bash
psql -h mkt.techb.kr -U techb_pp -d productparser_db
```

#### 2. .pgpass 파일 사용 (권장)
```bash
# .pgpass 파일 생성
echo "mkt.techb.kr:5432:productparser_db:techb_pp:Tech1324!" > ~/.pgpass
chmod 600 ~/.pgpass

# 패스워드 없이 접속
psql -h mkt.techb.kr -U techb_pp -d productparser_db
```

### V3 테이블 초기화

```sql
-- V3 스키마 생성
\i scripts/init-db.sql

-- 테이블 확인
\dt v3_*

-- 테스트 API 키 확인
SELECT * FROM v3_api_keys;
```

## 📊 V3 테이블 구조

### 과금 관련 테이블
```sql
-- 과금용 사용량 (중복 제거)
v3_coupang_billing_usage
├── api_key + keyword + product_code + date (UNIQUE)
├── billing_amount = 30원 고정
└── request_count = 실제 요청 횟수

-- 순위 히스토리 (모든 요청)
v3_coupang_ranking_history
├── 모든 API 요청 기록
├── browser_type (chrome/firefox/edge)
└── 90일 후 자동 삭제

-- 기술 통계 (선택적)
v3_coupang_tech_stats
├── 브라우저별 성능 통계
└── 1년 후 삭제
```

### 주요 쿼리 예시

#### 1. 월별 과금 집계
```sql
SELECT 
    api_key,
    DATE_TRUNC('month', date) as month,
    COUNT(*) as unique_queries,
    SUM(billing_amount) as total_billing,
    SUM(request_count) as total_requests
FROM v3_coupang_billing_usage 
WHERE date >= '2025-01-01'
GROUP BY api_key, DATE_TRUNC('month', date)
ORDER BY month DESC;
```

#### 2. 일일 사용량 확인
```sql
SELECT 
    api_key,
    COUNT(*) as unique_combinations,
    SUM(billing_amount) as daily_billing
FROM v3_coupang_billing_usage 
WHERE date = CURRENT_DATE
GROUP BY api_key;
```

#### 3. 브라우저별 성능 통계
```sql
SELECT 
    browser_type,
    COUNT(*) as total_requests,
    AVG(execution_time_ms) as avg_response_time,
    COUNT(*) FILTER (WHERE success = true) as success_count,
    COUNT(*) FILTER (WHERE success = false) as error_count
FROM v3_coupang_ranking_history 
WHERE created_at >= NOW() - INTERVAL '1 day'
GROUP BY browser_type;
```

## 🔧 연결 설정

### Node.js 환경변수
```env
DB_HOST=mkt.techb.kr
DB_PORT=5432
DB_USER=techb_pp
DB_PASS=Tech1324!
DB_NAME=productparser_db
```

### 연결 풀 설정 (권장)
```javascript
const pool = new Pool({
  host: 'mkt.techb.kr',
  port: 5432,
  database: 'productparser_db',
  user: 'techb_pp',
  password: 'Tech1324!',
  max: 20,          // 최대 연결 수
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

## 🔐 보안 고려사항

### 1. 네트워크 보안
- 허용된 IP에서만 접속 가능
- SSL/TLS 암호화 연결

### 2. 데이터 보호
- 과금 데이터는 영구 보존 (세무/회계 목적)
- 개인정보 포함하지 않음
- 정기적 백업 실시

### 3. 접근 제어
- 읽기/쓰기 권한 분리
- API 키 기반 사용량 추적
- 로그 모니터링

## 🗂️ 기존 V2 테이블과의 관계

### V2 테이블들 (그대로 유지)
- `api_keys` → V3에서는 `v3_api_keys` 사용
- `v2_crawled_products_*` → V3에서는 사용 안함
- `v2_ranking_history` → V3에서는 `v3_coupang_ranking_history` 사용

### 마이그레이션
```sql
-- V2 API 키를 V3로 복사 (필요시)
INSERT INTO v3_api_keys (api_key, name, description, is_active, created_at)
SELECT api_key, name, description, is_active, created_at 
FROM api_keys 
WHERE is_active = true
ON CONFLICT (api_key) DO NOTHING;
```

## 📞 문제 해결

### 연결 문제
1. **방화벽 확인**: 5432 포트 개방 여부
2. **네트워크 확인**: `telnet mkt.techb.kr 5432`
3. **권한 확인**: 사용자 계정 활성화 여부

### 성능 최적화
1. **인덱스 활용**: 쿼리 실행 계획 확인
2. **연결 풀**: 적절한 연결 수 설정
3. **배치 처리**: 대량 INSERT 시 배치 사용

---

**주의**: 패스워드에 특수문자가 포함되어 있어 PGPASSWORD 환경변수 사용 시 문제가 발생할 수 있으므로 .pgpass 파일 사용을 권장합니다.