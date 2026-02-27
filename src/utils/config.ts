// Utilities: Configuration management
// Pure functions, no external dependencies

export interface ServerConfig {
  port: number;
  host: string;
  nodeEnv: 'development' | 'production' | 'test';
}

export interface LLMConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutSeconds: number;
}

export interface RoomDefaults {
  maxPlayers: number;
  maxHistoryTurns: number;
  maxShortTermMemory: number;
  maxLongTermMemory: number;
}

export interface AppConfig {
  server: ServerConfig;
  llm: LLMConfig;
  room: RoomDefaults;
  saveDirectory: string;
}

// Default configurations
// Configuration builders
export function buildServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const nodeEnv = (env.NODE_ENV as ServerConfig['nodeEnv']) || 'development';

  return {
    port: parseInt(env.PORT || '3000', 10),
    host: env.HOST || 'localhost',
    nodeEnv,
  };
}

export function buildLLMConfig(env: NodeJS.ProcessEnv = process.env): LLMConfig {
  const apiKey = env.OPENAI_API_KEY || '';

  return {
    apiKey,
    baseUrl: env.OPENAI_BASE_URL,
    model: env.LLM_MODEL || 'gpt-4',
    temperature: parseFloat(env.LLM_TEMPERATURE || '0.7'),
    maxTokens: parseInt(env.LLM_MAX_TOKENS || '800', 10),
    timeoutSeconds: parseInt(env.LLM_TIMEOUT_SECONDS || '60', 10),
  };
}

export function buildRoomDefaults(env: NodeJS.ProcessEnv = process.env): RoomDefaults {
  return {
    maxPlayers: parseInt(env.ROOM_MAX_PLAYERS || '4', 10),
    maxHistoryTurns: parseInt(env.ROOM_MAX_HISTORY_TURNS || '10', 10),
    maxShortTermMemory: parseInt(env.ROOM_MAX_SHORT_TERM || '12', 10),
    maxLongTermMemory: parseInt(env.ROOM_MAX_LONG_TERM || '50', 10),
  };
}

export function buildAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    server: buildServerConfig(env),
    llm: buildLLMConfig(env),
    room: buildRoomDefaults(env),
    saveDirectory: env.SAVE_DIRECTORY || './saves',
  };
}

// Validation
export function validateConfig(config: AppConfig): string[] {
  const errors: string[] = [];

  if (!config.llm.apiKey) {
    errors.push('LLM API key is required (OPENAI_API_KEY)');
  }

  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push('Invalid port number');
  }

  if (config.llm.temperature < 0 || config.llm.temperature > 2) {
    errors.push('Temperature must be between 0 and 2');
  }

  return errors;
}
