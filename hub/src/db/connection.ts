import { Pool } from 'pg';
import { config } from '../config/index';
import { createLogger } from '../utils/logger';

const logger = createLogger('database');

// Create PostgreSQL connection pool
export const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.database,
  user: config.database.user,
  password: config.database.password,
  max: config.database.maxConnections,
  idleTimeoutMillis: config.database.idleTimeout,
  connectionTimeoutMillis: config.database.connectionTimeout,
});

// Test database connection
export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    
    logger.info('Database connection successful', {
      timestamp: result.rows[0].now,
      host: config.database.host,
      database: config.database.database,
    });
    
    return true;
  } catch (error) {
    logger.error('Database connection failed', error);
    return false;
  }
}

// Verify V3 tables exist
export async function verifyV3Tables(): Promise<boolean> {
  try {
    const tables = [
      'v3_api_keys',
      'v3_coupang_billing_usage',
      'v3_coupang_ranking_history',
      'v3_coupang_tech_stats',
    ];

    for (const table of tables) {
      const result = await pool.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )`,
        [table]
      );

      if (!result.rows[0].exists) {
        logger.error(`Table ${table} does not exist`);
        return false;
      }
    }

    logger.info('All V3 tables verified successfully');
    return true;
  } catch (error) {
    logger.error('Failed to verify V3 tables', error);
    return false;
  }
}

// Graceful shutdown
export async function closePool(): Promise<void> {
  await pool.end();
  logger.info('Database connection pool closed');
}