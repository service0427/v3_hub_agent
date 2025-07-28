require('dotenv').config();
const { io } = require('socket.io-client');
const winston = require('winston');
const os = require('os');
const path = require('path');
const fs = require('fs').promises;
const BrowserManager = require('./browser/manager');
const WorkflowExecutor = require('./workflows/executor');

// Configuration
const config = {
  hubUrl: process.env.HUB_URL || 'http://u24.techb.kr:8545',
  apiKey: process.env.API_KEY || 'test-api-key-123',
  agentId: process.env.AGENT_ID || `agent-${os.hostname()}-${process.pid}`,
  instanceId: parseInt(process.env.INSTANCE_ID || '1'),
  browserType: process.env.BROWSER_TYPE || 'chrome',
  headless: process.env.HEADLESS !== 'false',
  logLevel: process.env.LOG_LEVEL || 'info',
  userDataDir: process.env.USER_DATA_DIR || './data/users',
  firefoxNightlyPath: process.env.FIREFOX_NIGHTLY_PATH,
};

// Logger setup
const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.printf(({ timestamp, level, message, ...rest }) => {
      const restStr = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
      return `${timestamp} [${level.toUpperCase()}] ${message}${restStr}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ 
      filename: `logs/agent_${config.instanceId}.log`,
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    })
  ]
});

// Create necessary directories
async function ensureDirectories() {
  const dirs = ['logs', 'data', 'data/users', 'data/firefox-users'];
  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }
}

// Get host IP
function getHostIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

class Agent {
  constructor() {
    this.socket = null;
    this.browserManager = null;
    this.workflowExecutor = null;
    this.currentTask = null;
    this.status = 'idle';
  }

  async initialize() {
    logger.info('Initializing ParserHub V3 Agent', {
      agentId: config.agentId,
      instanceId: config.instanceId,
      browserType: config.browserType,
      hubUrl: config.hubUrl,
    });

    // Ensure directories exist
    await ensureDirectories();

    // Initialize browser manager
    this.browserManager = new BrowserManager(config, logger);
    const browserInitialized = await this.browserManager.initialize();
    
    if (!browserInitialized) {
      throw new Error('Failed to initialize browser');
    }

    // Initialize workflow executor
    this.workflowExecutor = new WorkflowExecutor(this.browserManager, logger);

    // Connect to hub
    await this.connectToHub();
  }

  async connectToHub() {
    logger.info(`Connecting to hub at ${config.hubUrl}`);
    
    this.socket = io(config.hubUrl, {
      auth: {
        apiKey: config.apiKey
      },
      reconnection: true,
      reconnectionDelay: 5000,
      reconnectionAttempts: Infinity,
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      logger.info('Connected to hub');
      this.registerAgent();
    });

    this.socket.on('disconnect', (reason) => {
      logger.warn('Disconnected from hub', { reason });
      this.status = 'disconnected';
    });

    this.socket.on('connect_error', (error) => {
      logger.error('Connection error', { error: error.message });
    });

    this.socket.on('registered', (data) => {
      logger.info('Agent registered successfully', data);
      this.status = 'idle';
    });

    this.socket.on('task', async (task) => {
      logger.info('Received task', { 
        taskId: task.id, 
        type: task.type,
        keyword: task.params?.keyword 
      });
      await this.executeTask(task);
    });

    this.socket.on('ping', () => {
      logger.debug('Received ping from hub');
      this.socket.emit('pong', { 
        agentId: config.agentId,
        status: this.status 
      });
    });
  }

  registerAgent() {
    const browserInfo = this.browserManager.getBrowserInfo();
    const agentInfo = {
      id: config.agentId,
      name: `${browserInfo.name} Agent ${config.instanceId}`,
      hostIp: getHostIp(),
      instanceId: config.instanceId,
      platform: 'coupang',
      browserType: browserInfo.type,
      browserVersion: browserInfo.version,
      status: 'idle',
      capabilities: ['coupang-search'],
      metadata: {
        os: os.platform(),
        osVersion: os.release(),
        nodeVersion: process.version,
        memoryTotal: os.totalmem(),
        memoryFree: os.freemem(),
      }
    };

    logger.info('Registering agent', agentInfo);
    this.socket.emit('register', agentInfo);
  }

  async executeTask(task) {
    if (this.status === 'busy') {
      logger.warn('Agent is busy, rejecting task', { taskId: task.id });
      this.socket.emit('task-rejected', {
        taskId: task.id,
        reason: 'Agent is busy'
      });
      return;
    }

    this.status = 'busy';
    this.currentTask = task;
    const startTime = Date.now();

    try {
      logger.info('Starting task execution', { 
        taskId: task.id, 
        type: task.type 
      });

      // Execute workflow
      const result = await this.workflowExecutor.execute(task.type, task.params);

      const executionTime = Date.now() - startTime;
      
      logger.info('Task completed successfully', {
        taskId: task.id,
        executionTime,
        resultRank: result.rank
      });

      // Send success response
      this.socket.emit('task-complete', {
        taskId: task.id,
        success: true,
        result: result,
        executionTime: executionTime,
        agentInfo: {
          id: config.agentId,
          browserType: this.browserManager.getBrowserInfo().type,
        }
      });

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      logger.error('Task execution failed', {
        taskId: task.id,
        error: error.message,
        stack: error.stack,
        executionTime
      });

      // Send error response
      this.socket.emit('task-complete', {
        taskId: task.id,
        success: false,
        error: error.message,
        executionTime: executionTime,
        agentInfo: {
          id: config.agentId,
          browserType: this.browserManager.getBrowserInfo().type,
        }
      });
    } finally {
      this.status = 'idle';
      this.currentTask = null;
    }
  }

  async shutdown() {
    logger.info('Shutting down agent');
    
    if (this.socket) {
      this.socket.disconnect();
    }
    
    if (this.browserManager) {
      await this.browserManager.close();
    }
    
    logger.info('Agent shutdown complete');
  }
}

// Main execution
async function main() {
  const agent = new Agent();
  
  try {
    await agent.initialize();
    logger.info('Agent started successfully');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully');
      await agent.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully');
      await agent.shutdown();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start agent', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Start agent
main();