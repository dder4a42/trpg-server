import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const LOG_FILE = path.join(LOG_DIR, 'llm-api.log');
const DEBUG_LOG_FILE = path.join(LOG_DIR, 'llm-debug.jsonl');

const DEBUG_ENABLED =
  process.env.LLM_DEBUG_LOG === '1' ||
  (process.env.NODE_ENV !== 'production' && process.env.LLM_DEBUG_LOG !== '0');

const MAX_DEBUG_FIELD_CHARS = parseInt(process.env.LLM_DEBUG_MAX_CHARS || '2000000', 10);

export interface LLMCallLog {
  timestamp: string;
  model: string;
  prompt: string;
  response: string;
  responseTimeMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  error?: string;
}

export type LLMDebugPhase = 'request' | 'response' | 'error';

export interface LLMDebugLog {
  timestamp: string;
  callId: string;
  phase: LLMDebugPhase;
  mode: 'chat' | 'stream';
  model: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutSeconds?: number;

  messages?: unknown;
  messagesJson?: string;
  response?: string;

  // Tool calling support
  tools?: unknown;
  toolChoice?: string;
  toolCalls?: unknown;

  responseTimeMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;

  chunkCount?: number;
  error?: string;
  stack?: string;

  truncated?: {
    messages?: boolean;
    response?: boolean;
  };
}

export function logLLMCall(log: LLMCallLog): void {
  const logLine = JSON.stringify(log) + '\n';

  fs.appendFileSync(LOG_FILE, logLine, 'utf8');
}

function truncateString(value: string): { value: string; truncated: boolean } {
  if (value.length <= MAX_DEBUG_FIELD_CHARS) {
    return { value, truncated: false };
  }
  return { value: value.slice(0, MAX_DEBUG_FIELD_CHARS) + `\n... [TRUNCATED ${value.length - MAX_DEBUG_FIELD_CHARS} chars]`, truncated: true };
}

export function logLLMDebug(entry: LLMDebugLog): void {
  if (!DEBUG_ENABLED) return;

  // Defensive copying + truncation to avoid extremely large log lines
  const out: LLMDebugLog = { ...entry, truncated: { ...(entry.truncated || {}) } };

  if (typeof out.response === 'string') {
    const { value, truncated } = truncateString(out.response);
    out.response = value;
    if (truncated) out.truncated = { ...(out.truncated || {}), response: true };
  }

  if (typeof out.messages !== 'undefined') {
    const raw = JSON.stringify(out.messages);
    const { value, truncated } = truncateString(raw);
    if (truncated) {
      out.messagesJson = value;
      out.messages = undefined;
      out.truncated = { ...(out.truncated || {}), messages: true };
    }
  }

  fs.appendFileSync(DEBUG_LOG_FILE, JSON.stringify(out) + '\n', 'utf8');
}

export function getLLMCallLogs(): LLMCallLog[] {
  if (!fs.existsSync(LOG_FILE)) {
    return [];
  }

  const content = fs.readFileSync(LOG_FILE, 'utf8');
  return content
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}