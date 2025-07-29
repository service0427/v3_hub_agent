module.exports = {
  apps: [
    {
      // 반복 실행 모드
      name: 'v3-batch-continuous',
      script: './run-continuous.sh',
      args: '50 300', // 50개 키워드, 5분 간격
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      time: true
    },
    {
      // Cron 모드 (10분마다)
      name: 'v3-batch-cron',
      script: './batch-check-api.js',
      args: '100',
      instances: 1,
      exec_mode: 'fork',
      cron_restart: '*/10 * * * *',
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: 'production'
      },
      error_file: 'logs/pm2-cron-error.log',
      out_file: 'logs/pm2-cron-out.log',
      time: true
    }
  ]
};