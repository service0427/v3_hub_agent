# V3 키워드 순위 배치 체크 시스템 가이드

## 시스템 개요
하루에 10-15회 키워드 순위를 반복 체크하는 배치 처리 시스템입니다.

## 구성 요소

### 1. 데이터베이스 테이블
- **v3_keyword_list**: 키워드 목록 관리
- **v3_keyword_ranking_checks**: 순위 체크 결과 (컬럼 기반)
- **v3_keyword_check_logs**: 체크 실행 로그
- **v3_keyword_check_failures**: 실패 상세 로그

### 2. 스크립트
- **setup-db.js**: 데이터베이스 테이블 생성
- **test-batch-system.js**: 테스트 키워드 관리 및 결과 확인
- **batch-check.js**: 실제 배치 처리 실행

## 사용 방법

### 1단계: 데이터베이스 설정
```bash
node setup-db.js
```

### 2단계: 테스트 데이터 준비
```bash
node test-batch-system.js
# 옵션 1 선택하여 테스트 키워드 5개 추가
```

### 3단계: 배치 체크 실행
```bash
# 첫 번째 체크 (check_1 컬럼에 저장)
node batch-check.js 1

# 두 번째 체크 (check_2 컬럼에 저장)
node batch-check.js 2

# 세 번째 체크 (check_3 컬럼에 저장)
node batch-check.js 3
```

### 4단계: 결과 확인
```bash
node test-batch-system.js
# 옵션 5 선택하여 결과 확인
```

## 배치 체크 파라미터

### 명령줄 인자
```bash
node batch-check.js [체크번호] [최대키워드수]
```
- 체크번호: 1-15 (필수)
- 최대키워드수: 0=전체 (선택, 기본값: 0)

### 환경 변수 (.env)
```env
BATCH_MAX_PAGES=3        # 페이지당 최대 검색 수
BATCH_SIZE=10            # 동시 처리 수
BATCH_DELAY=5000         # 배치 간 대기 시간 (ms)
BATCH_HEADLESS=false     # 헤드리스 모드
```

## 실제 운영 시나리오

### 일일 스케줄 예시
```bash
# crontab 설정
0 6 * * * cd /home/tech/v3_hub_agent/dev_agent && node batch-check.js 1 >> logs/batch.log
0 8 * * * cd /home/tech/v3_hub_agent/dev_agent && node batch-check.js 2 >> logs/batch.log
0 10 * * * cd /home/tech/v3_hub_agent/dev_agent && node batch-check.js 3 >> logs/batch.log
0 12 * * * cd /home/tech/v3_hub_agent/dev_agent && node batch-check.js 4 >> logs/batch.log
0 14 * * * cd /home/tech/v3_hub_agent/dev_agent && node batch-check.js 5 >> logs/batch.log
0 16 * * * cd /home/tech/v3_hub_agent/dev_agent && node batch-check.js 6 >> logs/batch.log
0 18 * * * cd /home/tech/v3_hub_agent/dev_agent && node batch-check.js 7 >> logs/batch.log
0 20 * * * cd /home/tech/v3_hub_agent/dev_agent && node batch-check.js 8 >> logs/batch.log
0 22 * * * cd /home/tech/v3_hub_agent/dev_agent && node batch-check.js 9 >> logs/batch.log
```

### 대량 키워드 추가
```sql
-- 직접 SQL로 키워드 추가
INSERT INTO v3_keyword_list (keyword, product_code, product_name, category, priority)
VALUES 
  ('키워드1', '상품코드1', '상품명1', '카테고리1', 1),
  ('키워드2', '상품코드2', '상품명2', '카테고리2', 2),
  ...
```

## 모니터링

### 체크 상태 확인
```sql
-- 오늘 체크 현황
SELECT * FROM v3_keyword_check_logs 
WHERE check_date = CURRENT_DATE 
ORDER BY check_number;

-- 키워드별 순위 변화
SELECT * FROM v3_keyword_ranking_checks 
WHERE check_date = CURRENT_DATE
AND keyword = '무선청소기';

-- 일별 통계
SELECT * FROM v3_keyword_daily_stats
ORDER BY check_date DESC
LIMIT 7;
```

### 실패 분석
```sql
-- 오늘 실패 현황
SELECT error_type, COUNT(*) as count
FROM v3_keyword_check_failures
WHERE check_date = CURRENT_DATE
GROUP BY error_type;
```

## 성능 고려사항

### 1만개 키워드 처리 시
- 배치 크기 10개 = 1,000개 배치
- 배치당 5초 대기 = 총 83분
- 페이지당 3페이지 검색 = 최대 30,000번 페이지 로드

### 권장 설정
- BATCH_SIZE=20 (동시 20개 처리)
- BATCH_DELAY=3000 (3초 대기)
- MAX_PAGES=2 (2페이지만 검색)

## 주의사항
1. 너무 빠른 속도로 체크하면 차단될 수 있음
2. GUI 모드로 실행하면 리소스 소비가 큼
3. 실패한 키워드는 재시도하지 않음 (수동 확인 필요)

## 트러블슈팅

### PostgreSQL 연결 실패
```bash
# .env 파일에 DB 정보 확인
DB_HOST=mkt.techb.kr
DB_PORT=5432
DB_NAME=productparser_db
DB_USER=techb_pp
DB_PASSWORD=Tech1324!
```

### 메모리 부족
```bash
# Node.js 메모리 증가
node --max-old-space-size=4096 batch-check.js 1
```