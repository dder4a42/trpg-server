// Domain layer: LLM types and interfaces
// NO external dependencies - pure TypeScript

export type LLMRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LLMMessage {
  role: LLMRole;
  content: string;
  timestamp?: number;
  // For assistant messages with tool calls
  tool_calls?: ToolCall[];
  // For tool result messages
  tool_call_id?: string;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: LLMUsage;
  model?: string;
  id?: string;
}

export interface LLMStreamChunk {
  content: string;
  done: boolean;
}

// Tool calling types
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string to be parsed
  };
}

export interface ChatOptions {
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required';
}

// Port interface - implemented by infrastructure layer
export interface ILLMClient {
  chat(messages: LLMMessage[], options?: ChatOptions): Promise<LLMResponse>;
  streamChat(messages: LLMMessage[], options?: ChatOptions): AsyncGenerator<LLMStreamChunk>;
  getConfig(): Readonly<LLMConfig>;
}

export interface LLMConfig {
  model: string;
  baseUrl?: string;
  apiKey?: string;
  temperature: number;
  maxTokens: number;
  timeoutSeconds: number;
}
