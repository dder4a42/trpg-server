// API layer: Express app configuration
// Composes all middleware and routes

import express, { type Application, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler } from './middleware/errorHandler.js';
import { createAuthRouter } from './routes/auth.js';
import roomRoutes, { setRoomsMap as setRoomsMapForRooms } from './routes/rooms/index.js';
import roomMemberRoutes from './routes/roomMembers.js';
import characterRoutes from './routes/characters.js';
import chatRoutes, { setChatReferences } from './routes/chat.js';
import webRoutes, { getRoomsMap, setAuthModule } from './routes/web.js';
import streamingRoutes, { setRoomsMap, broadcastChatMessage } from './routes/streaming.js';
import saveRoutes, { setRoomsMap as setRoomsMapForSaves } from './routes/saves.js';
import messageRoutes from './routes/messages.js';
import adminRoutes from './routes/admin.js';
import readyRoomRoutes from './routes/ready-room.js';

import type { AuthModule } from './middleware/AuthModule.js';

export interface AppConfig {
  corsOrigins: string[];
  trustProxy: boolean;
  logFormat: string;
  authModule?: AuthModule;
}

export function createApp(config: Partial<AppConfig> = {}): Application {
  const app = express();

  const {
    corsOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'],
    trustProxy = false,
    logFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev',
  } = config;

  // View engine setup
  app.set('view engine', 'pug');
  app.set('views', './views');

  // Trust proxy (for proper client IP behind reverse proxy)
  if (trustProxy) {
    app.set('trust proxy', 1);
  }

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Disable for API-only server
  }));

  // CORS
  app.use(cors({
    origin: corsOrigins,
    credentials: true,
  }));

  // Logging
  app.use(morgan(logFormat));

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Cookie parser for session management
  app.use(cookieParser());

  // Health check (before routes)
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Static files with cache optimization
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    // Development: Disable caching entirely for static files
    app.use((req, res, next) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      next();
    });

    // Serve static files without caching
    app.use('/lib', express.static('public/lib', { cacheControl: false }));
    app.use('/css', express.static('public/css', { cacheControl: false }));
    app.use('/js', express.static('public/js', { cacheControl: false }));
    app.use('/images', express.static('public/images', { cacheControl: false }));
    app.use(express.static('public', { cacheControl: false }));
  } else {
    // Production: Use aggressive caching
    // Third-party libraries (rarely change) - long cache
    app.use('/lib', express.static('public/lib', {
      maxAge: '1y',
      immutable: true,
    }));

    // CSS (may change on updates) - medium cache
    app.use('/css', express.static('public/css', {
      maxAge: '1d',
      etag: true,
    }));

    // Custom scripts (may change on updates) - medium cache
    app.use('/js', express.static('public/js', {
      maxAge: '1d',
      etag: true,
    }));

    // Images - long cache with validation
    app.use('/images', express.static('public/images', {
      maxAge: '30d',
      etag: true,
    }));

    // Fallback for other static files
    app.use(express.static('public', {
      maxAge: '1h',
      etag: true,
    }));
  }

  // Auth routes (must be before protected routes)
  if (config.authModule) {
    // Inject authModule into web routes
    setAuthModule(config.authModule);

    // Create auth router from authModule's authService and tokenService
    const authService = (config.authModule as any)['authService'];
    const tokenService = (config.authModule as any)['tokenService'];
    app.use('/auth', createAuthRouter(authService, tokenService));
  }

  // Web routes (pages) - authModule will be used internally
  app.use('/', webRoutes);

  // Admin routes (apply auth and admin check at app level)
  if (config.authModule) {
    app.use('/admin', config.authModule.requireAuth);
    app.use('/admin', config.authModule.adminOnly);
  }
  app.use('/admin', adminRoutes);

  // All API routes require authentication (applied once to /api prefix)
  if (config.authModule) {
    app.use('/api', config.authModule.validateSession);
  }

  // API routes (all protected by the middleware above)
  app.use('/api/rooms', roomRoutes);
  app.use('/api/rooms', roomMemberRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/stream', streamingRoutes);
  app.use('/api/saves', saveRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/characters', characterRoutes);
  app.use('/api/ready-room', readyRoomRoutes);

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found',
      },
    });
  });

  // Global error handler (must be last)
  app.use(errorHandler);

  // Set up streaming and chat references (after all routes are registered)
  setRoomsMap(getRoomsMap);
  setRoomsMapForRooms(getRoomsMap);
  setRoomsMapForSaves(getRoomsMap);
  setChatReferences(getRoomsMap, broadcastChatMessage);

  return app;
}
