# V3 Batch Agent (API Mode)

V3 키워드 순위 체크를 위한 분산 에이전트입니다.

## 설치 방법

1. 압축 해제
```bash
tar -xzf dev_agent_api_v2.tar.gz
cd dev_agent
```

2. 패키지 설치
```bash
npm install
```

3. 환경 설정
```bash
cp .env.example .env
# .env 파일을 편집하여 설정
```

## 환경 설정 (.env)

### 필수 설정
- `HUB_API_URL`: Hub 서버 주소 (기본: https://u24.techb.kr:3331)
- `AGENT_ID`: 에이전트 고유 ID (예: agent-02, agent-03...)

### 선택 설정
- `BATCH_MAX_PAGES`: 최대 검색 페이지 수 (기본: 5)
- `BATCH_SIZE`: 동시 처리 키워드 수 (기본: 10)
- `BATCH_DELAY`: 배치 간 대기 시간 (기본: 5000ms)

## 실행 방법

```bash
# 100개 키워드 처리
./run-batch-api.sh 100

# 또는 직접 실행
node batch-check-api.js 100
```

## 주의사항

1. **GUI 환경 필수**: Windows VM에서는 반드시 GUI 환경에서 실행
2. **고유 ID 사용**: 각 에이전트는 고유한 AGENT_ID를 사용해야 함
3. **브라우저 설치**: Chrome, Firefox, Edge 중 하나 이상 설치 필요

## 시스템 요구사항

- Node.js 14.0 이상
- Windows 또는 Linux (GUI 환경)
- Chrome/Firefox/Edge 브라우저
- 네트워크 연결 (Hub API 접근)
EOF < /dev/null
