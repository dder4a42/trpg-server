// API layer: Global error handler middleware

import type { Request, Response, NextFunction } from 'express';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
}

export function createError(
  message: string,
  statusCode: number = 500,
  code?: string,
  details?: unknown
): ApiError {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}

export function errorHandler(
  err: ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500;
  const fallbackCode = err.name === 'GameEngineError'
    ? 'GAME_ENGINE_ERROR'
    : err.name === 'ContextBuildError'
      ? 'CONTEXT_BUILD_ERROR'
      : err.name === 'SaveLoadError'
        ? 'SAVE_LOAD_ERROR'
        : 'INTERNAL_ERROR';
  const code = err.code ?? fallbackCode;

  // Log error details (but not in test environment)
  if (process.env.NODE_ENV !== 'test') {
    console.error(`[Error ${code}] ${err.message}`);
    if (err.stack) {
      console.error(err.stack);
    }
  }

  // Don't leak error details in production
  const isProduction = process.env.NODE_ENV === 'production';
  const message = isProduction && statusCode === 500
    ? 'Internal server error'
    : err.message;

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(err.details && !isProduction ? { details: err.details } : {}),
    },
  });
}

// Async handler wrapper to avoid try-catch in every route
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
