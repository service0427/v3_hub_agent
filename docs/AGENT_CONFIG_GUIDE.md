# V3 Agent 설정 가이드

## 📋 v3_agent_config 테이블 설정 목록

### Hub API 설정 (config.js에서 사용)

| 설정키 | 기본값 | 설명 | 사용처 |
|--------|--------|------|--------|
| hub_api_url | http://u24.techb.kr:3331 | Hub API URL | 에이전트 → Hub 통신 |
| max_pages | 5 | 최대 검색 페이지 수 | 쿠팡 검색 시 |
| batch_size | 10 | 동시 처리 배치 크기 | 병렬 처리 |
| batch_delay | 5000 | 배치 간 대기 시간(ms) | 배치 처리 |
| log_level | info | 로그 레벨 (debug/info/warn/error) | 로깅 |
| api_timeout | 20000 | API 타임아웃(ms) | API 통신 |
| headless | false | Headless 모드 (항상 false) | 브라우저 실행 |
| browser_close_delay | 1000 | 브라우저 닫기 지연(ms) | 디버깅용 |

### 실행 제어 설정 (run.sh에서 사용)

| 설정키 | 기본값 | 설명 | 사용처 |
|--------|--------|------|--------|
| keywords_per_batch | 1 | 배치당 키워드 수 | 한 번에 처리할 키워드 |
| success_delay | 5 | 성공 후 대기 시간(초) | 정상 처리 후 |
| no_keyword_delay | 60 | 키워드 없을 때 기본 대기(초) | 처리할 키워드 없음 |
| no_keyword_delay_max | 605 | 키워드 없을 때 최대 대기(초) | 점진적 증가 |
| fail_delay | 30 | 실패 후 기본 대기 시간(초) | 처리 실패 시 |
| fail_delay_max | 600 | 실패 후 최대 대기 시간(초) | 점진적 증가 |
| block_delay | 20 | 차단 후 기본 대기 시간(초) | 네트워크 차단 시 |
| block_delay_max | 600 | 차단 후 최대 대기 시간(초) | 점진적 증가 |
| config_refresh_interval | 10 | 설정 갱신 주기(실행 횟수) | DB 설정 재로드 |

## 🔧 설정 변경 방법

### 1. DB에서 직접 수정
```sql
-- 설정 확인
SELECT * FROM v3_agent_config ORDER BY config_key;

-- 설정 변경 예시
UPDATE v3_agent_config 
SET config_value = '2' 
WHERE config_key = 'keywords_per_batch';

-- 대기 시간 늘리기 (차단이 자주 발생할 때)
UPDATE v3_agent_config 
SET config_value = '60' 
WHERE config_key = 'block_delay';
```

### 2. 설정 반영
- **config.js 설정**: 에이전트 재시작 필요
- **run.sh 설정**: `config_refresh_interval` 주기로 자동 반영

## 📊 권장 설정값

### 일반 운영
```sql
-- 안정적인 운영을 위한 기본값
UPDATE v3_agent_config SET config_value = '1' WHERE config_key = 'keywords_per_batch';
UPDATE v3_agent_config SET config_value = '5' WHERE config_key = 'success_delay';
UPDATE v3_agent_config SET config_value = '20' WHERE config_key = 'block_delay';
```

### 대량 처리 (차단 위험)
```sql
-- 빠른 처리가 필요할 때 (차단 주의)
UPDATE v3_agent_config SET config_value = '3' WHERE config_key = 'keywords_per_batch';
UPDATE v3_agent_config SET config_value = '3' WHERE config_key = 'success_delay';
UPDATE v3_agent_config SET config_value = '60' WHERE config_key = 'block_delay';
```

### 안전 모드 (차단 회피)
```sql
-- 차단이 자주 발생할 때
UPDATE v3_agent_config SET config_value = '1' WHERE config_key = 'keywords_per_batch';
UPDATE v3_agent_config SET config_value = '10' WHERE config_key = 'success_delay';
UPDATE v3_agent_config SET config_value = '120' WHERE config_key = 'block_delay';
UPDATE v3_agent_config SET config_value = '1200' WHERE config_key = 'block_delay_max';
```

## ⚠️ 주의사항

1. **browser_close_delay**: 
   - 0: 즉시 닫기 (빠른 처리)
   - 1000: 1초 대기 (기본값)
   - 5000: 5초 대기 (디버깅용)

2. **대기 시간 설정**:
   - `*_delay`: 첫 번째 발생 시 대기 시간
   - `*_delay_max`: 최대 대기 시간 (점진적 증가)

3. **headless**: 
   - 항상 `false`로 유지 (GUI 필수)
   - 변경해도 무시됨

## 🗑️ 제거된 설정들

다음 설정들은 더 이상 사용되지 않습니다:
- `browser_type` - Chrome만 사용
- `browser_rotate_enabled` - 브라우저 전환 기능 제거
- `auto_ip_rotate_threshold` - IP 자동 변경 미지원
- `window_width`, `window_height` - 창 크기 고정
- `default_timeout` - 코드에 하드코딩
- `block_patterns` - 코드에 하드코딩