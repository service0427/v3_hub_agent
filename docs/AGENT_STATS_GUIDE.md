# 📊 에이전트 통계 시스템 가이드

## 🎯 개요
ParserHub V3 에이전트의 성능과 상태를 실시간으로 모니터링하기 위한 통계 시스템입니다.

## 📂 통계 테이블 구조

### 1. **v3_agent_stats** - 일일 통계
```sql
• agent_id           : 에이전트 고유 ID
• agent_ip           : 에이전트 IP 주소
• browser            : 브라우저 종류 (chrome/firefox/edge)
• stat_date          : 통계 날짜
• total_requests     : 총 요청 수
• successful_searches: 성공한 검색 수
• failed_searches    : 실패한 검색 수
• blocked_count      : 차단된 횟수
• ranks_found        : 순위를 찾은 횟수
• products_not_found : 상품 미발견 횟수 (순위 0)
```

### 2. **v3_agent_errors** - 에러 로그
```sql
• agent_id      : 에이전트 고유 ID
• agent_ip      : 에이전트 IP
• browser       : 브라우저 종류
• error_time    : 에러 발생 시간
• error_type    : 에러 타입
  - BLOCKED     : 차단 감지
  - TIMEOUT     : 시간 초과
  - NETWORK     : 네트워크 에러
  - HTTP2_ERROR : HTTP2 프로토콜 에러
  - SEARCH_ERROR: 일반 검색 에러
• error_message : 상세 에러 메시지
• keyword       : 검색 키워드
• product_code  : 상품 코드
```

### 3. **v3_agent_health** - 실시간 상태
```sql
• agent_id               : 에이전트 고유 ID
• status                 : 상태
  - ACTIVE  : 정상 작동
  - WARNING : 경고 (연속 에러 5회)
  - BLOCKED : 차단됨 (연속 차단 3회)
  - INACTIVE: 비활성
• consecutive_errors     : 연속 에러 횟수
• consecutive_blocks     : 연속 차단 횟수
• total_lifetime_requests: 전체 누적 요청
• total_lifetime_blocks  : 전체 누적 차단
```

---

## 🔄 통계 수집 방식

### 성공 시 (순위 발견)
```
1. v3_agent_stats: 
   - total_requests +1
   - successful_searches +1
   - ranks_found +1 (순위 > 0인 경우)
   - products_not_found +1 (순위 = 0인 경우)

2. v3_agent_health:
   - last_success_at 업데이트
   - consecutive_errors = 0
   - consecutive_blocks = 0
   - status = ACTIVE
```

### 실패 시
```
1. v3_agent_stats:
   - total_requests +1
   - failed_searches +1
   - blocked_count +1 (차단인 경우)

2. v3_agent_errors:
   - 에러 로그 추가

3. v3_agent_health:
   - last_error_at 업데이트
   - consecutive_errors +1
   - consecutive_blocks +1 (차단인 경우)
   - status 업데이트
```

---

## 📊 유용한 쿼리

### 오늘의 에이전트별 성능
```sql
SELECT 
  agent_id,
  browser,
  total_requests,
  successful_searches,
  ROUND(successful_searches::decimal / total_requests * 100, 2) as success_rate,
  blocked_count,
  ranks_found,
  products_not_found
FROM v3_agent_stats
WHERE stat_date = CURRENT_DATE
ORDER BY total_requests DESC;
```

### 최근 차단된 에이전트
```sql
SELECT 
  agent_id,
  agent_ip,
  browser,
  status,
  consecutive_blocks,
  last_error_at
FROM v3_agent_health
WHERE status = 'BLOCKED'
ORDER BY last_error_at DESC;
```

### 에러 타입별 통계
```sql
SELECT 
  error_type,
  COUNT(*) as count,
  COUNT(DISTINCT agent_id) as affected_agents
FROM v3_agent_errors
WHERE error_time >= NOW() - INTERVAL '1 hour'
GROUP BY error_type
ORDER BY count DESC;
```

### 브라우저별 성공률
```sql
SELECT 
  browser,
  SUM(total_requests) as total,
  SUM(successful_searches) as success,
  ROUND(SUM(successful_searches)::decimal / SUM(total_requests) * 100, 2) as success_rate
FROM v3_agent_stats
WHERE stat_date = CURRENT_DATE
GROUP BY browser;
```

---

## 🚨 알림 조건

### 즉시 알림이 필요한 경우
- 에이전트 status가 'BLOCKED'로 변경
- 특정 브라우저의 성공률이 50% 미만
- 1시간 내 동일 에러가 100회 이상 발생

### 주의가 필요한 경우
- consecutive_errors가 3회 이상
- 특정 에이전트의 성공률이 70% 미만
- products_not_found 비율이 30% 초과

---

## 🔧 관리 작업

### 차단된 에이전트 리셋
```sql
UPDATE v3_agent_health
SET status = 'ACTIVE',
    consecutive_errors = 0,
    consecutive_blocks = 0
WHERE agent_id = 'AGENT_ID';
```

### 오래된 통계 정리 (30일 이상)
```sql
DELETE FROM v3_agent_stats 
WHERE stat_date < CURRENT_DATE - INTERVAL '30 days';

DELETE FROM v3_agent_errors 
WHERE error_time < NOW() - INTERVAL '30 days';
```

---

_마지막 업데이트: 2025-07-29_