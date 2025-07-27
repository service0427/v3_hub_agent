import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { config } from '../config/index';

// Ensure log directory exists
const logDir = config.logging.dir;
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

// Create logger instance
export const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: { service: 'parserhub-v3-hub' },
  transports: [
    // Write all logs to combined.log
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
    }),
    // Write error logs to error.log
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
    }),
  ],
});

// Add console transport in development
if (config.isDev) {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
  }));
}

// Create child loggers for specific modules
export function createLogger(module: string) {
  return logger.child({ module });
}

// Log unhandled errors
process.on('unhandledRejection', (error: Error) => {
  logger.error('Unhandled Promise Rejection', error);
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', error);
  process.exit(1);
});

// Export convenience methods
export default {
  info: (message: string, metadata?: any) => logger.info(message, metadata),
  warn: (message: string, metadata?: any) => logger.warn(message, metadata),
  error: (message: string, error?: Error | any) => {
    if (error instanceof Error) {
      logger.error(message, { error: error.message, stack: error.stack });
    } else {
      logger.error(message, error);
    }
  },
  debug: (message: string, metadata?: any) => logger.debug(message, metadata),
  http: (message: string, metadata?: any) => logger.http(message, metadata),
};