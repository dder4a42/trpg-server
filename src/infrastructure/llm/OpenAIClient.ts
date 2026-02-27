// Infrastructure layer: OpenAI SDK implementation
// Implements ILLMClient port from domain

import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import type {
  ILLMClient,
  LLMConfig,
  LLMMessage,
  LLMResponse,
  LLMStreamChunk,
  ChatOptions,
  ToolCall,
} from '@/domain/llm/types.js';
import { logLLMCall, logLLMDebug } from '@/utils/logger.js';

export class OpenAIClient implements ILLMClient {
  private client: OpenAI;
  private config: Required<
    Pick<LLMConfig, 'model' | 'temperature' | 'maxTokens' | 'timeoutSeconds'>
  > &
    Pick<LLMConfig, 'baseUrl'>;

  constructor(config: LLMConfig) {
    const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'Missing API key. Set OPENAI_API_KEY or pass apiKey in config'
      );
    }

    this.config = {
      model: config.model,
      baseUrl: config.baseUrl,
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 800,
      timeoutSeconds: config.timeoutSeconds ?? 60,
    };

    this.client = new OpenAI({
      apiKey,
      baseURL: this.config.baseUrl,
      timeout: this.config.timeoutSeconds * 1000,
    });
  }

  async chat(messages: LLMMessage[], options?: ChatOptions): Promise<LLMResponse> {
    const startTime = Date.now();
    const callId = uuidv4();

    logLLMDebug({
      timestamp: new Date().toISOString(),
      callId,
      phase: 'request',
      mode: 'chat',
      model: this.config.model,
      baseUrl: this.config.baseUrl,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
      timeoutSeconds: this.config.timeoutSeconds,
      messages,
      tools: options?.tools,
      toolChoice: options?.toolChoice,
    });

    // Filter out unknown fields (like timestamp) that API doesn't expect
    const cleanMessages = messages.map(({ timestamp, ...rest }) => rest);

    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: cleanMessages as OpenAI.Chat.ChatCompletionMessageParam[],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        ...(options?.tools && {
          tools: options.tools as OpenAI.Chat.ChatCompletionTool[],
          tool_choice: options.toolChoice || 'auto',
        }),
      });

      const endTime = Date.now();
      const responseTimeMs = endTime - startTime;

      const content = response.choices[0]?.message?.content?.trim() ?? '';
      const usage = response.usage;

      // Extract tool calls if present
      const toolCalls: ToolCall[] | undefined = response.choices[0]?.message?.tool_calls?.map(
        (tc) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })
      );

      logLLMDebug({
        timestamp: new Date().toISOString(),
        callId,
        phase: 'response',
        mode: 'chat',
        model: this.config.model,
        baseUrl: this.config.baseUrl,
        response: content,
        toolCalls,
        responseTimeMs,
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
      });

      // Log the API call
      logLLMCall({
        timestamp: new Date().toISOString(),
        model: this.config.model,
        prompt: JSON.stringify(messages),
        response: content,
        responseTimeMs,
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
      });

      return {
        content,
        toolCalls,
        usage: usage
          ? {
              promptTokens: usage.prompt_tokens,
              completionTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens,
            }
          : undefined,
        model: response.model,
        id: response.id,
      };
    } catch (error) {
      const endTime = Date.now();
      const responseTimeMs = endTime - startTime;

      logLLMDebug({
        timestamp: new Date().toISOString(),
        callId,
        phase: 'error',
        mode: 'chat',
        model: this.config.model,
        baseUrl: this.config.baseUrl,
        responseTimeMs,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Log the error
      logLLMCall({
        timestamp: new Date().toISOString(),
        model: this.config.model,
        prompt: JSON.stringify(messages),
        response: '',
        responseTimeMs,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  async *streamChat(messages: LLMMessage[], options?: ChatOptions): AsyncGenerator<LLMStreamChunk> {
    const startTime = Date.now();
    let fullResponse = '';
    let chunkCount = 0;
    const callId = uuidv4();

    logLLMDebug({
      timestamp: new Date().toISOString(),
      callId,
      phase: 'request',
      mode: 'stream',
      model: this.config.model,
      baseUrl: this.config.baseUrl,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
      timeoutSeconds: this.config.timeoutSeconds,
      messages,
      tools: options?.tools,
      toolChoice: options?.toolChoice,
    });

    // Filter out unknown fields (like timestamp) that API doesn't expect
    const cleanMessages = messages.map(({ timestamp, ...rest }) => rest);

    try {
      const stream = await this.client.chat.completions.create({
        model: this.config.model,
        messages: cleanMessages as OpenAI.Chat.ChatCompletionMessageParam[],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        stream: true,
        stream_options: { include_usage: true }, // Include usage information
        // Note: tool calling in streaming mode is complex and deferred
        // For now, tools are only supported in non-streaming chat()
      });

      let usage = null;
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content ?? '';
        if (content) {
          fullResponse += content;
          chunkCount++;
          yield { content, done: false };
        }
        if (chunk.usage) {
          usage = chunk.usage;
        }
      }

      const endTime = Date.now();
      const responseTimeMs = endTime - startTime;

      // Use OpenAI's usage info if available
      let promptTokens, completionTokens, totalTokens;
      if (usage) {
        promptTokens = usage.prompt_tokens;
        completionTokens = usage.completion_tokens;
        totalTokens = usage.total_tokens;
      } else {
        console.log('[OpenAIClient] Usage information missing in stream response');
      }

      // Log the API call
      logLLMCall({
        timestamp: new Date().toISOString(),
        model: this.config.model,
        prompt: JSON.stringify(messages),
        response: fullResponse,
        responseTimeMs,
        promptTokens,
        completionTokens,
        totalTokens,
      });

      logLLMDebug({
        timestamp: new Date().toISOString(),
        callId,
        phase: 'response',
        mode: 'stream',
        model: this.config.model,
        baseUrl: this.config.baseUrl,
        response: fullResponse,
        responseTimeMs,
        promptTokens,
        completionTokens,
        totalTokens,
        chunkCount,
      });

      yield { content: '', done: true };
    } catch (error) {
      const endTime = Date.now();
      const responseTimeMs = endTime - startTime;

      logLLMDebug({
        timestamp: new Date().toISOString(),
        callId,
        phase: 'error',
        mode: 'stream',
        model: this.config.model,
        baseUrl: this.config.baseUrl,
        response: fullResponse,
        responseTimeMs,
        chunkCount,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Log the error
      logLLMCall({
        timestamp: new Date().toISOString(),
        model: this.config.model,
        prompt: JSON.stringify(messages),
        response: fullResponse,
        responseTimeMs,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  getConfig(): Readonly<LLMConfig> {
    return { ...this.config };
  }
}
