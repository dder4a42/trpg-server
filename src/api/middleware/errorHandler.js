// API layer: Global error handler middleware
export function createError(message, statusCode = 500, code, details) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    error.details = details;
    return error;
}
export function errorHandler(err, _req, res, _next) {
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
export function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
