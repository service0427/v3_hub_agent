# V3 Agent Config 사용 분석

## 🟢 실제 사용되는 설정

1. **hub_api_url** ✅
   - config.js에서 읽음
   - API 서버 주소로 사용

2. **max_pages** ✅
   - crawler.js에서 사용
   - 최대 검색 페이지 수

3. **browser_close_delay** ✅
   - batch-processor.js:82-84에서 사용
   - 브라우저 닫기 전 대기 시간

4. **keywords_per_batch** ✅
   - run.sh:85에서 사용
   - check.js 실행 시 인자로 전달

5. **success_delay** ✅
   - run.sh:86에서 사용
   - 성공 후 대기 시간

6. **fail_delay, fail_delay_max** ✅
   - run.sh:89-90에서 사용
   - 실패 시 대기 시간 (점진적 증가)

7. **block_delay, block_delay_max** ✅
   - run.sh:91-92에서 사용
   - 차단 시 대기 시간 (점진적 증가)

8. **no_keyword_delay, no_keyword_delay_max** ✅
   - run.sh:87-88에서 사용
   - 키워드 없을 때 대기 시간

9. **config_refresh_interval** ✅
   - run.sh:95, config.js:73에서 사용
   - DB 설정 갱신 주기

## 🔴 사용되지 않는 설정

1. **batch_size** ❌
   - config.js에서 읽기만 하고 사용 안함
   - 병렬 처리 미구현

2. **batch_delay** ❌
   - config.js에서 읽기만 하고 사용 안함
   - 대신 success_delay 등 사용

3. **log_level** ❌
   - config.js에서 읽기만 함
   - logger.js는 process.env.DEBUG만 확인

4. **api_timeout** ❌
   - config.js에서 읽기만 하고 사용 안함
   - API 타임아웃 설정 미적용

## 결론
- 16개 설정 중 4개가 사용되지 않음
- batch_size, batch_delay, log_level, api_timeout 제거 필요