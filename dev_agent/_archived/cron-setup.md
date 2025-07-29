# V3 Batch Check Cron 설정 가이드

## 1. 연속 실행 스크립트 사용법

### 기본 실행 (무한 반복)
```bash
./run-continuous.sh
# 기본값: 10개 키워드, 60초 간격, 무한 반복
```

### 파라미터 지정
```bash
./run-continuous.sh 50 120 100
# 50개 키워드, 120초 간격, 100회 반복
```

### 백그라운드 실행
```bash
nohup ./run-continuous.sh 20 60 > batch.log 2>&1 &
# 백그라운드에서 실행, 로그는 batch.log에 저장
```

## 2. Cron 설정 방법

### Crontab 편집
```bash
crontab -e
```

### 예시 설정

#### 매 5분마다 실행
```cron
*/5 * * * * cd /home/tech/v3_hub_agent/dev_agent && ./run-batch-api.sh 10 >> /home/tech/logs/v3-batch.log 2>&1
```

#### 매시 정각에 100개 처리
```cron
0 * * * * cd /home/tech/v3_hub_agent/dev_agent && ./run-batch-api.sh 100 >> /home/tech/logs/v3-batch.log 2>&1
```

#### 30분마다 50개 처리
```cron
0,30 * * * * cd /home/tech/v3_hub_agent/dev_agent && ./run-batch-api.sh 50 >> /home/tech/logs/v3-batch.log 2>&1
```

#### 업무 시간(9-18시) 동안 10분마다
```cron
*/10 9-18 * * * cd /home/tech/v3_hub_agent/dev_agent && ./run-batch-api.sh 20 >> /home/tech/logs/v3-batch.log 2>&1
```

### Cron 로그 확인
```bash
# 실행 로그 확인
tail -f /home/tech/logs/v3-batch.log

# Cron 데몬 로그
sudo tail -f /var/log/syslog | grep CRON
```

## 3. PM2를 사용한 프로세스 관리

### PM2 설치
```bash
npm install -g pm2
```

### PM2 ecosystem 파일 생성
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'v3-batch-checker',
    script: './batch-check-api.js',
    args: '50',
    instances: 1,
    exec_mode: 'fork',
    cron_restart: '*/10 * * * *', // 10분마다 재시작
    autorestart: false,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
```

### PM2 실행
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # 시스템 재부팅 시 자동 시작
```

## 4. Systemd Service 설정

### Service 파일 생성
```bash
sudo nano /etc/systemd/system/v3-batch-checker.service
```

```ini
[Unit]
Description=V3 Batch Checker Service
After=network.target

[Service]
Type=simple
User=tech
WorkingDirectory=/home/tech/v3_hub_agent/dev_agent
ExecStart=/home/tech/v3_hub_agent/dev_agent/run-continuous.sh 50 300
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Service 시작
```bash
sudo systemctl enable v3-batch-checker.service
sudo systemctl start v3-batch-checker.service
sudo systemctl status v3-batch-checker.service
```

## 5. 모니터링 스크립트

### 상태 확인 스크립트
```bash
#!/bin/bash
# check-batch-status.sh

echo "=== V3 Batch Checker Status ==="
echo ""

# 프로세스 확인
if pgrep -f "batch-check-api.js" > /dev/null; then
    echo "✅ Batch checker is running"
    echo "Process IDs: $(pgrep -f batch-check-api.js)"
else
    echo "❌ Batch checker is NOT running"
fi

echo ""

# 최근 로그 확인
if [ -f logs/batch-check-api-$(date +%Y-%m-%d).log ]; then
    echo "📋 Recent logs:"
    tail -n 20 logs/batch-check-api-$(date +%Y-%m-%d).log | grep -E "(Total checked|Failed|ERROR)"
fi

echo ""

# DB 상태 확인
echo "📊 Today's statistics:"
psql -h mkt.techb.kr -U techb_pp -d productparser_db -c "
SELECT 
    COUNT(DISTINCT CONCAT(keyword, ':', product_code)) as unique_keywords,
    SUM(total_checks) as total_checks,
    SUM(found_count) as total_found,
    AVG(CASE WHEN avg_rank IS NOT NULL THEN avg_rank END)::INTEGER as avg_rank
FROM v3_keyword_ranking_checks
WHERE check_date = CURRENT_DATE;
"
```

## 6. 권장 설정

### 개발/테스트 환경
- 연속 실행 스크립트 사용
- 적은 키워드 수 (10-20개)
- 짧은 간격 (1-2분)

### 운영 환경
- Cron 또는 PM2 사용
- 적절한 키워드 수 (50-100개)
- 충분한 간격 (5-10분)
- 로그 로테이션 설정

### 주의사항
1. 동시에 여러 인스턴스 실행 금지
2. 충분한 간격 두기 (차단 방지)
3. 로그 파일 크기 관리
4. 에러 발생 시 알림 설정