# V3 키워드 체크 간격 설정 가이드

## 개요
동일한 키워드를 너무 자주 체크하면 쿠팡에서 차단당할 위험이 있습니다. 
이를 방지하기 위해 키워드별로 최소 체크 간격을 설정했습니다.

## 설정 방법

### 1. 환경변수 설정
`hub/.env` 파일에서 설정:
```env
MIN_CHECK_INTERVAL=1800  # 초 단위 (기본 30분)
```

### 2. 동작 원리
- **오늘 첫 체크**: 즉시 처리
- **이후 체크**: 마지막 체크 시간으로부터 설정된 시간 경과 후에만 처리
- 체크 시간은 `check_time_1` ~ `check_time_10` 중 가장 최근 시간 기준

### 3. 권장 설정값
- **개발/테스트**: 600초 (10분)
- **운영 환경**: 1800초 (30분) - 현재 기본값
- **보수적 운영**: 2400초 (40분)

### 4. 쿼리 동작
```sql
-- 오늘 첫 체크이거나
krc.id IS NULL  
OR (
  -- 마지막 체크로부터 30분 이상 경과했고
  EXTRACT(EPOCH FROM (CURRENT_TIME - last_check_time)) >= 1800
  -- 아직 빈 슬롯이 있는 경우
  AND (check_1 IS NULL OR ... OR check_10 IS NULL)
)
```

### 5. 예시 시나리오
1. 09:00:00 - "무선청소기" 첫 체크 (check_1)
2. 09:15:00 - 요청 시 거부 (15분만 경과)
3. 09:30:01 - 요청 시 처리 (30분 경과, check_2)
4. 09:45:00 - 요청 시 거부 (15분만 경과)
5. 10:00:02 - 요청 시 처리 (30분 경과, check_3)

### 6. 주의사항
- 간격을 너무 짧게 설정하면 차단 위험 증가
- 간격을 너무 길게 설정하면 하루 10회 체크가 어려움
- 적절한 밸런스: 30분 간격으로 하루 최대 48회 가능 (실제로는 10회만 저장)

### 7. 모니터링
체크 간격이 제대로 작동하는지 확인:
```sql
SELECT 
  keyword,
  product_code,
  check_time_1,
  check_time_2,
  check_time_3,
  EXTRACT(EPOCH FROM (check_time_2::TIME - check_time_1::TIME)) as interval_1_2,
  EXTRACT(EPOCH FROM (check_time_3::TIME - check_time_2::TIME)) as interval_2_3
FROM v3_keyword_ranking_checks
WHERE check_date = CURRENT_DATE
  AND check_time_2 IS NOT NULL;
```