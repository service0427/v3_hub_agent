import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

export const config = {
  // Node environment
  env: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV === 'development',
  isProd: process.env.NODE_ENV === 'production',

  // Server configuration
  server: {
    port: parseInt(process.env.PORT || '8445', 10),
    socketPort: parseInt(process.env.SOCKET_PORT || '8446', 10),
  },

  // Database configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'password',
    database: process.env.DB_NAME || 'parserhub_v3',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
    idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '2000', 10),
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    dir: process.env.LOG_DIR || path.join(__dirname, '../../logs'),
  },

  // API configuration
  api: {
    defaultApiKey: process.env.DEFAULT_API_KEY || 'test-api-key-123',
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  // Agent configuration
  agent: {
    timeout: parseInt(process.env.AGENT_TIMEOUT_MS || '30000', 10),
    maxConcurrentTasks: parseInt(process.env.MAX_CONCURRENT_TASKS || '10', 10),
    maxAgentsPerBrowser: parseInt(process.env.MAX_AGENTS_PER_BROWSER || '5', 10),
  },

  // Browser support configuration
  browser: {
    // Parse supported browsers from environment variable
    supported: (process.env.SUPPORTED_BROWSERS || 'chrome,firefox').split(',').map(b => b.trim()),
  },

  // Billing configuration
  billing: {
    amountPerQuery: parseInt(process.env.BILLING_AMOUNT_PER_QUERY || '30', 10),
  },

  // CORS configuration
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },
} as const;

// Validate required configuration
export function validateConfig(): void {
  const requiredEnvVars = [
    'DB_HOST',
    'DB_USER',
    'DB_PASS',
    'DB_NAME',
  ];

  const missing = requiredEnvVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Validate browser support
  const validBrowsers = ['chrome', 'firefox', 'edge'];
  const invalidBrowsers = config.browser.supported.filter(b => !validBrowsers.includes(b));
  
  if (invalidBrowsers.length > 0) {
    throw new Error(`Invalid browsers in SUPPORTED_BROWSERS: ${invalidBrowsers.join(', ')}`);
  }
}