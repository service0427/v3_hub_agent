const winston = require('winston');

// Simple Logger - 간결한 로그만 출력
const logger = winston.createLogger({
  level: process.env.DEBUG ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => {
      return message;
    })
  ),
  transports: [
    new winston.transports.Console()
  ]
});

module.exports = logger;