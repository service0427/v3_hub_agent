# V3 배치 시스템 API 모드 가이드

## 개요
batch-check.js가 이제 직접 DB 접근 대신 Hub API를 통해 작동합니다.

## 주요 변경사항

### 1. 아키텍처
```
[Agent 1] ─┐
[Agent 2] ─┼─> [Hub API] ─> [PostgreSQL]
[Agent N] ─┘
```

### 2. API 엔드포인트
- `GET /api/v3/internal/batch/keywords` - 키워드 가져오기 (자동 락)
- `POST /api/v3/internal/batch/result` - 결과 저장 (자동 락 해제)
- `POST /api/v3/internal/batch/failure` - 실패 로깅
- `GET /api/v3/internal/batch/status` - 락 상태 조회

### 3. 동시 호출 방지
- 메모리 기반 락 매니저
- 20초 타임아웃 자동 해제
- 에이전트별 고유 ID 관리

## 사용 방법

### Hub 서버 실행
```bash
cd hub
npm run dev
```

### 에이전트 실행
```bash
cd dev_agent

# 환경 변수 설정 (.env)
HUB_API_URL=http://hub-server:3001
AGENT_ID=agent-01

# 실행
./run-batch-api.sh 100  # 100개 키워드 처리
```

### 여러 에이전트 실행
```bash
# 에이전트 1 (서버 A)
AGENT_ID=agent-01 ./run-batch-api.sh 50

# 에이전트 2 (서버 B)
AGENT_ID=agent-02 ./run-batch-api.sh 50

# 에이전트 3 (서버 C)
AGENT_ID=agent-03 ./run-batch-api.sh 50
```

## 특징

### 1. 자동 분배
- 각 에이전트가 요청한 키워드는 자동으로 락
- 다른 에이전트는 해당 키워드 받지 못함

### 2. 실패 처리
- 20초 내 응답 없으면 자동 락 해제
- 다른 에이전트가 재시도 가능

### 3. 효율성
- 마지막 체크 시간이 오래된 키워드 우선
- 중복 작업 방지

## 모니터링

### 락 상태 확인
```bash
curl http://hub-server:3001/api/v3/internal/batch/status
```

### 로그 확인
```bash
# Hub 서버
tail -f hub/logs/app.log

# 에이전트
tail -f dev_agent/logs/batch-check-api-*.log
```

## 파일 구조
```
hub/
├── src/
│   ├── api/internal/batch.ts    # API 엔드포인트
│   └── services/lockManager.ts  # 락 관리
dev_agent/
├── batch-check-api.js           # API 클라이언트
├── batch-check.js               # 기존 DB 직접 접근 (deprecated)
└── .env                         # 환경 설정
```

## 장점
1. **확장성**: 에이전트 수 제한 없음
2. **안정성**: 중앙 집중식 락 관리
3. **간편함**: DB 설정 불필요
4. **보안**: 에이전트는 DB 접근 못함