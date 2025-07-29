# Scripts 디렉토리 구조

## 🚀 현재 사용 중인 파일들 (4개)

### 크론탭 실행 스크립트
- **sync-keywords.js** - MySQL → PostgreSQL 키워드 동기화 (10분마다)
  - 환경변수 자동 설정 포함
  - 시작/종료 메시지 출력
- **sync-to-mysql.js** - PostgreSQL → MySQL 순위/에러 동기화 (10분마다)
  - crawling_errors retry_count 관리
  - resolved_at 자동 업데이트

### 데이터베이스 초기화 SQL
- **init-db.sql** - V3 기본 테이블 생성
- **create-agent-stats-tables.sql** - 에이전트 통계 테이블 생성

## 📦 아카이브된 파일들 (_archived/)

### 백업 파일
- old-sync-product-info-to-mysql.js.bak - 상품 정보 동기화 (구버전)
- old-sync-ranking-logs-to-mysql.js.bak - 순위 로그 동기화 (구버전)

### 테스트/임시 파일
- test-mysql-connection.js - MySQL 연결 테스트
- check-mysql-data.js - MySQL 데이터 확인 스크립트
- sync-cron.sh - 크론 실행 스크립트 (구버전)
- run-sync.sh - 키워드 동기화 셸 스크립트 (sync-keywords.js로 통합됨)

### 초기 SQL 파일
- v3_keyword_ranking.sql - 초기 테이블 설계
- v3_keyword_ranking_postgresql.sql - PostgreSQL 버전

---

_마지막 업데이트: 2025-07-29_