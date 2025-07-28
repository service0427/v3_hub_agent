# ParserHub V3 API Guide

쿠팡 전용 실시간 제품 순위 조회 API 사용 가이드

## Base URL

```
https://u24.techb.kr/v3/api
```

## 인증

모든 API 요청에는 `key` 파라미터가 필요합니다.

## Endpoints

### 1. 쿠팡 제품 검색

**Endpoint**: `GET /coupang`

**Description**: 쿠팡에서 키워드로 제품을 검색하고 특정 제품의 순위를 확인합니다.

**Parameters**:
- `keyword` (required): 검색 키워드
- `code` (required): 제품 코드 (productId, itemId, vendorItemId 중 하나)
- `pages` (optional): 검색할 페이지 수 (기본값: 1, 최대: 10)
- `key` (required): API 인증 키
- `browser` (optional): 사용할 브라우저 (`chrome`, `firefox`, `firefox-nightly`, `edge`, `auto`)
- `host` (optional): 특정 에이전트 지정 (`ip:port` 형식, 예: `192.168.1.100:3301`)

**Example Request**:
```bash
curl -X GET "https://u24.techb.kr/v3/api/coupang?keyword=노트북&code=83887459648&pages=2&key=test-api-key-123"
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "platform": "coupang",
    "keyword": "노트북",
    "code": "83887459648",
    "rank": 15,
    "realRank": 15,
    "product": {
      "name": "삼성전자 갤럭시북4 NT750XGK-KC51G",
      "price": 1299000,
      "thumbnail": "https://thumbnail.coupang.com/...",
      "url": "https://www.coupang.com/vp/products/83887459648",
      "rating": "4.5",
      "reviewCount": 234
    },
    "browser": "chrome",
    "agentInfo": {
      "agentId": "LINUX-3301",
      "browserVersion": "139.0.7258.5",
      "vmId": "LINUX-3301"
    },
    "executionTime": 3245,
    "pagesSearched": 2
  },
  "timestamp": "2025-07-27T14:00:00.000Z"
}
```

**Error Response**:
```json
{
  "success": false,
  "error": {
    "code": "NO_AVAILABLE_AGENTS",
    "message": "사용 가능한 에이전트가 없습니다. 잠시 후 다시 시도해주세요."
  },
  "timestamp": "2025-07-27T14:00:00.000Z"
}
```

**차단 시 Response**:
```json
{
  "success": true,
  "data": {
    "platform": "coupang",
    "keyword": "노트북",
    "code": "83887459648",
    "rank": null,
    "realRank": null,
    "product": null,
    "blocked": true,
    "blockType": "HTTP2_PROTOCOL_ERROR",
    "message": "네트워크 레벨 차단 (Navigation failed)",
    "browser": "chrome",
    "agentInfo": {
      "agentId": "LINUX-3301",
      "browserVersion": "139.0.7258.5",
      "vmId": "LINUX-3301"
    },
    "executionTime": 1500
  },
  "timestamp": "2025-07-27T14:00:00.000Z"
}
```

**Host 지정 에러 Response**:
```json
{
  "success": false,
  "error": {
    "code": "AGENT_BUSY",
    "message": "에이전트가 이미 작업 중입니다: 192.168.1.100:3301"
  },
  "timestamp": "2025-07-27T14:00:00.000Z"
}
```

### 2. 에이전트 상태 조회

**Endpoint**: `GET /agents/status`

**Description**: 현재 활성화된 에이전트들의 기본 상태를 조회합니다.

**Example Request**:
```bash
curl -X GET "https://u24.techb.kr/v3/api/agents/status"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "totalAgents": 4,
    "browserStats": {
      "chrome": 2,
      "firefox": 1,
      "firefox-nightly": 1,
      "edge": 0
    },
    "statusStats": {
      "idle": 3,
      "busy": 1,
      "error": 0,
      "disconnected": 0
    },
    "queueLength": 0,
    "activeTasks": 1
  },
  "timestamp": "2025-07-27T14:00:00.000Z"
}
```

### 3. 에이전트 롤링 상태 조회

**Endpoint**: `GET /agents/rolling-status`

**Description**: 에이전트 롤링 전략 상태 및 차단 기록을 조회합니다.

**Example Request**:
```bash
curl -X GET "https://u24.techb.kr/v3/api/agents/rolling-status"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "totalAgents": 3,
    "availableAgents": 2,
    "agentDetails": [
      {
        "agentId": "LINUX-3301",
        "browser": "chrome",
        "status": "idle",
        "lastUsed": "2025-07-27T14:00:00.000Z",
        "blockInfo": {
          "blockedAt": "2025-07-27T13:45:00.000Z",
          "reason": "HTTP2_PROTOCOL_ERROR",
          "count": 3
        }
      }
    ]
  },
  "timestamp": "2025-07-27T14:00:00.000Z"
}
```

### 4. 서버 헬스 체크

**Endpoint**: `GET /health`

**Description**: V3 허브 서버의 상태를 확인합니다.

**Example Request**:
```bash
curl -X GET "https://u24.techb.kr/v3/health"
```

**Response**:
```json
{
  "success": true,
  "service": "parserhub-v3-hub",
  "version": "3.0.0",
  "uptime": 2964.779937125,
  "timestamp": "2025-07-27T15:33:23.593Z"
}
```

### 5. 에이전트 헬스 체크

**Endpoint**: `GET /agents/health`

**Description**: 각 에이전트의 상세한 헬스 상태를 조회합니다.

**Example Request**:
```bash
curl -X GET "https://u24.techb.kr/v3/api/agents/health"
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "LINUX-3301",
      "vmId": "LINUX-3301",
      "browser": "chrome",
      "status": "idle",
      "health": {
        "healthy": true,
        "lastHeartbeat": "2025-07-27T14:00:00.000Z",
        "timeSinceLastHeartbeat": 5000
      },
      "tasksCompleted": 25,
      "lastActivity": "2025-07-27T13:55:00.000Z"
    }
  ],
  "timestamp": "2025-07-27T14:00:00.000Z"
}
```

## Error Codes

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | 필수 파라미터 누락 또는 잘못된 형식 |
| `UNAUTHORIZED` | 유효하지 않은 API 키 |
| `NO_AVAILABLE_AGENTS` | 사용 가능한 에이전트가 없음 |
| `AGENT_NOT_FOUND` | 지정된 host의 에이전트를 찾을 수 없음 |
| `AGENT_BUSY` | 지정된 에이전트가 이미 작업 중 |
| `AGENT_UNHEALTHY` | 지정된 에이전트가 응답하지 않음 |
| `TIMEOUT` | 검색 시간 초과 (30초) |
| `INTERNAL_ERROR` | 서버 내부 오류 |

## Block Types (차단 유형)

| Type | Description |
|------|-------------|
| `HTTP_403_FORBIDDEN` | HTTP 403 응답 |
| `HTTP_429_TOO_MANY_REQUESTS` | HTTP 429 응답 (요청 제한) |
| `HTTP2_PROTOCOL_ERROR` | HTTP/2 프로토콜 오류 |
| `NETWORK_LEVEL_BLOCK` | 네트워크 레벨 차단 |
| `NAVIGATION_FAILED` | 페이지 로드 실패 |
| `NO_PRODUCTS_FOUND` | 제품을 찾을 수 없음 (차단 의심) |

## Rate Limiting

- 기본 제한: 분당 100회 요청
- API 키별로 적용
- 초과 시 HTTP 429 응답

## 과금 정보

- keyword + code 조합당 일일 30원
- 하루에 같은 조합은 여러 번 요청해도 1회만 과금
- 과금은 API 키별로 계산
- 월말 정산

## 주의사항

1. **브라우저 선택**: 특정 브라우저가 차단된 경우 다른 브라우저를 선택하세요
2. **타임아웃**: API 응답 시간은 최대 30초입니다
3. **에이전트 가용성**: 피크 시간에는 에이전트가 부족할 수 있습니다
4. **차단 대응**: 차단 시 자동으로 다른 브라우저로 재시도하지 않으므로 클라이언트에서 처리 필요

## 예제 코드

### cURL 예제

```bash
# 기본 요청
curl -X GET "https://u24.techb.kr/v3/api/coupang?keyword=노트북&code=83887459648&pages=2&key=test-api-key-123"

# JSON 포맷으로 보기
curl -X GET "https://u24.techb.kr/v3/api/coupang?keyword=노트북&code=83887459648&pages=2&key=test-api-key-123" | jq

# 특정 브라우저 지정
curl -X GET "https://u24.techb.kr/v3/api/coupang?keyword=노트북&code=83887459648&pages=2&key=test-api-key-123&browser=firefox"

# Firefox Nightly 사용
curl -X GET "https://u24.techb.kr/v3/api/coupang?keyword=노트북&code=83887459648&pages=2&key=test-api-key-123&browser=firefox-nightly"

# 특정 에이전트 지정 (테스트/디버깅용)
curl -X GET "https://u24.techb.kr/v3/api/coupang?keyword=노트북&code=83887459648&key=test-api-key-123&host=192.168.1.100:3301"

# 타임아웃 설정
curl -X GET --max-time 60 "https://u24.techb.kr/v3/api/coupang?keyword=노트북&code=83887459648&pages=2&key=test-api-key-123"
```