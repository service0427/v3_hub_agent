import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { config, validateConfig } from './config/index';
import { logBrowserConfiguration } from './config/browser';
import logger from './utils/logger';
import { requestLogger } from './middleware/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

// Validate configuration on startup
try {
  validateConfig();
} catch (error) {
  logger.error('Configuration validation failed', error);
  process.exit(1);
}

// Create Express app
const app = express();
const httpServer = createServer(app);

// Create Socket.IO server for agent connections
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*', // Allow agents from any origin
    methods: ['GET', 'POST'],
  },
});

// Basic middleware
app.use(helmet());
app.use(cors({
  origin: config.cors.origin,
  credentials: true,
}));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLogger);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'parserhub-v3-hub',
    version: '3.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// API routes
import coupangRouter from './api/coupang';
import agentsRouter from './api/agents';
app.use('/api/v3/coupang', coupangRouter);
app.use('/api/v3/agents', agentsRouter);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Socket.IO connection handling for agents
import { AgentManager } from './agent/manager';

io.on('connection', (socket) => {
  logger.info('New agent connected', { socketId: socket.id });

  socket.on('register', (agentInfo) => {
    logger.info('Agent registration request', { 
      socketId: socket.id, 
      agentInfo 
    });
    
    // Register agent
    const agent = AgentManager.registerAgent(socket, agentInfo);
    socket.emit('registered', { agentId: agent.id });
  });

  socket.on('task-complete', (data) => {
    logger.info('Task completed by agent', { 
      socketId: socket.id,
      taskId: data.taskId,
      success: data.success 
    });
    
    // Broadcast task completion
    io.emit('task-complete', data);
  });

  socket.on('disconnect', () => {
    logger.info('Agent disconnected', { socketId: socket.id });
    AgentManager.removeAgent(socket.id);
  });

  socket.on('error', (error) => {
    logger.error('Socket error', { socketId: socket.id, error });
  });
});

// Start servers
const startServers = async () => {
  try {
    // Test database connection
    const { testConnection, verifyV3Tables } = await import('./db/connection');
    const dbConnected = await testConnection();
    if (!dbConnected) {
      logger.warn('Database connection failed - continuing without DB');
      // throw new Error('Database connection failed');
    } else {
      const tablesVerified = await verifyV3Tables();
      if (!tablesVerified) {
        logger.warn('V3 tables not found in database - API will have limited functionality');
        // throw new Error('V3 tables not found in database');
      }
    }

    // Log browser configuration
    logBrowserConfiguration();

    // Start HTTP server
    httpServer.listen(config.server.port, '0.0.0.0', () => {
      logger.info(`HTTP server listening on port ${config.server.port}`);
    });

    // Socket.IO shares the same port as HTTP server
    logger.info(`Socket.IO server ready on port ${config.server.port}`);

    // Log startup information
    logger.info('ParserHub V3 Hub Server started', {
      environment: config.env,
      port: config.server.port,
      supportedBrowsers: config.browser.supported,
      publicUrl: `http://u24.techb.kr:${config.server.port}`,
    });

  } catch (error) {
    logger.error('Failed to start servers', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  httpServer.close(() => {
    logger.info('HTTP server closed');
    
    io.close(() => {
      logger.info('Socket.IO server closed');
      process.exit(0);
    });
  });
});

// Start the application
startServers();

export { app, io };