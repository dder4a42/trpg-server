// Utilities: Custom error types

export class GameEngineError extends Error {
  statusCode = 400;
  code = 'GAME_ENGINE_ERROR';
  details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.details = details;
  }
}

export class ContextBuildError extends Error {
  statusCode = 500;
  code = 'CONTEXT_BUILD_ERROR';
  details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.details = details;
  }
}

export class SaveLoadError extends Error {
  statusCode = 500;
  code = 'SAVE_LOAD_ERROR';
  details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.details = details;
  }
}
