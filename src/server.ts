// Server entry point
// Bootstrap and start the HTTP server

import 'dotenv/config';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { createApp } from '@/api/app.js';
import { buildAppConfig, validateConfig } from '@/utils/config.js';
import { initDatabaseService, DatabaseService } from '@/infrastructure/database/DatabaseService.js';
import { AuthService } from '@/application/auth/AuthService.js';
import { createTokenService } from '@/application/auth/TokenService.js';
import { createAuthModule } from '@/api/middleware/AuthModule.js';

const __filename = fileURLToPath(import.meta.url);
dirname(__filename);
async function main(): Promise<void> {
  // Build configuration from environment
  const config = buildAppConfig(process.env);

  // Validate configuration
  const errors = validateConfig(config);
  if (errors.length > 0) {
    console.error('Configuration errors:');
    errors.forEach((err) => console.error(`  - ${err}`));
    process.exit(1);
  }

  // Ensure data directory exists
  const dbPath = process.env.DB_PATH || './data/trpg.db';
  const dbDir = dirname(dbPath);
  try {
    mkdirSync(dbDir, { recursive: true });
  } catch {
    // Directory might already exist, that's fine
  }

  // Initialize database (now async with LowDB)
  console.log('Initializing database...');
  let dbService: DatabaseService;
  try {
    dbService = await initDatabaseService(dbPath);
    const stats = dbService.getStats();
    console.log(`  Users: ${stats.users.totalUsers} (${stats.users.activeUsers} active)`);
    console.log(`  Rooms: ${stats.rooms.totalRooms} (${stats.rooms.activeRooms} active)`);
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }

  // Initialize auth service
  console.log('Initializing auth service...');
  const authService = new AuthService(
    dbService.users,
    dbService.userSessions,
    { sessionTimeoutHours: 24, bcryptRounds: 10 }
  );

  // Initialize token service for JWT support (optional)
  let tokenService: ReturnType<typeof createTokenService> | undefined;
  if (process.env.JWT_SECRET || process.env.AUTH_SECRET) {
    console.log('Initializing token service (JWT support enabled)...');
    tokenService = createTokenService();
    authService.setTokenService(tokenService);
  } else {
    console.log('JWT secret not configured - session-based auth only');
  }

  // Create auth module with token service
  const authModule = createAuthModule(authService, tokenService, { webLoginPath: '/login' });

  // Log startup info
  console.log('========================================');
  console.log('  TRPG Server Starting...');
  console.log('========================================');
  console.log(`  Node Env: ${config.server.nodeEnv}`);
  console.log(`  Port: ${config.server.port}`);
  console.log(`  LLM Model: ${config.llm.model}`);
  console.log('========================================');

  // Create Express app
  const app = createApp({
    authModule,
    corsOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    trustProxy: config.server.nodeEnv === 'production',
    logFormat: config.server.nodeEnv === 'production' ? 'combined' : 'dev',
  });

  // Start server
  const server = app.listen(config.server.port, config.server.host, () => {
    console.log(`✓ Server running at http://${config.server.host}:${config.server.port}`);
    console.log(`✓ Health check: http://${config.server.host}:${config.server.port}/health`);
    console.log('========================================');
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    console.log(`\n${signal} received. Starting graceful shutdown...`);
    server.close(async () => {
      console.log('✓ Server closed');
      await DatabaseService.close();
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('✗ Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });
}

// Run main
main().catch((error) => {
  console.error('Fatal error during startup:', error);
  process.exit(1);
});
