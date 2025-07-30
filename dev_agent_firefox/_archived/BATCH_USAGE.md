# V3 배치 체크 사용법 (개선된 버전)

## 변경 사항

### 자동 체크 번호 할당
- 더 이상 체크 번호를 수동으로 지정하지 않음
- 각 키워드별로 check_1 ~ check_10 중 빈 컬럼을 자동으로 찾아서 저장
- 10개가 모두 차면 해당 키워드는 건너뜀

### 지능적 키워드 선택
```sql
-- is_active=TRUE인 키워드 중
-- check_1 ~ check_10 중 하나라도 NULL인 키워드만 선택
-- priority 순으로 정렬
-- LIMIT로 처리 개수 제한
```

## 사용 방법

### 기본 실행
```bash
# 100개 키워드 처리 (기본값)
node batch-check.js

# 50개만 처리
node batch-check.js 50

# 1000개 처리
node batch-check.js 1000
```

### 실행 예시
```bash
# 오전 6시 - 빈 슬롯이 있는 키워드 500개 체크
node batch-check.js 500

# 오후 2시 - 빈 슬롯이 있는 키워드 300개 체크  
node batch-check.js 300

# 저녁 8시 - 빈 슬롯이 있는 키워드 200개 체크
node batch-check.js 200
```

## 자동화 설정

### crontab 예시
```bash
# 2시간마다 실행
0 */2 * * * cd /home/tech/v3_hub_agent/dev_agent && node batch-check.js 500 >> logs/batch.log
```

### systemd timer 예시
```ini
[Unit]
Description=V3 Keyword Batch Check
[Timer]
OnCalendar=*-*-* 06,08,10,12,14,16,18,20,22:00:00
[Install]
WantedBy=timers.target
```

## 작동 원리

1. **키워드 선택**
   - `v3_keyword_list`에서 `is_active=TRUE`인 키워드 조회
   - 오늘 날짜 기준 `check_1`~`check_10` 중 NULL이 있는 것만 선택
   - `priority` 순으로 정렬, `LIMIT`으로 개수 제한

2. **체크 번호 자동 할당**
   - 각 키워드별로 첫 번째 빈 컬럼 찾기
   - 예: check_1, check_2가 차있으면 check_3에 저장

3. **병렬 처리**
   - BATCH_SIZE(기본 10개)만큼 동시 실행
   - 각 브라우저 인스턴스가 독립적으로 작동

## 모니터링

```sql
-- 오늘 체크 현황
SELECT keyword, product_code,
       check_1, check_2, check_3, check_4, check_5,
       check_6, check_7, check_8, check_9, check_10,
       total_checks, found_count, min_rank, max_rank, avg_rank
FROM v3_keyword_ranking_checks
WHERE check_date = CURRENT_DATE
ORDER BY keyword;

-- 빈 슬롯이 있는 키워드 수
SELECT COUNT(DISTINCT kl.keyword)
FROM v3_keyword_list kl
LEFT JOIN v3_keyword_ranking_checks krc 
  ON kl.keyword = krc.keyword 
  AND kl.product_code = krc.product_code 
  AND krc.check_date = CURRENT_DATE
WHERE kl.is_active = TRUE 
  AND (
    krc.id IS NULL OR
    krc.check_1 IS NULL OR krc.check_2 IS NULL OR
    krc.check_3 IS NULL OR krc.check_4 IS NULL OR
    krc.check_5 IS NULL OR krc.check_6 IS NULL OR
    krc.check_7 IS NULL OR krc.check_8 IS NULL OR
    krc.check_9 IS NULL OR krc.check_10 IS NULL
  );
```

## 장점

1. **유연성**: 체크 시간을 자유롭게 설정 가능
2. **효율성**: 이미 10번 체크한 키워드는 자동으로 제외
3. **단순함**: 파라미터 하나만으로 실행
4. **안정성**: 각 키워드가 최대 10번까지만 체크됨