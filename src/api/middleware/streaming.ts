// API layer: Streaming response utilities

import type { Response } from 'express';

export interface StreamOptions {
  contentType?: string;
  keepAlive?: boolean;
  keepAliveInterval?: number;
  isSSE?: boolean; // Whether to format as Server-Sent Events
}

/**
 * Setup response for streaming
 */
export function setupStreaming(
  res: Response,
  options: StreamOptions = {}
): void {
  const {
    contentType = 'text/plain; charset=utf-8',
    keepAlive = true,
    keepAliveInterval = 30000,
    isSSE = true,
  } = options;

  // Set headers for streaming
  res.setHeader('Content-Type', contentType);
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Optional keep-alive
  if (keepAlive) {
    const keepAliveTimer = setInterval(() => {
      if (res.writableEnded) {
        clearInterval(keepAliveTimer);
        return;
      }
      res.write(isSSE ? ':keep-alive\n\n' : '');
    }, keepAliveInterval);

    res.on('close', () => clearInterval(keepAliveTimer));
  }
}

/**
 * Write a chunk to the stream
 */
export function writeChunk(res: Response, chunk: string, isSSE: boolean = true): boolean {
  if (res.writableEnded) return false;

  if (isSSE) {
    // For Server-Sent Events format
    res.write(`data: ${chunk}\n\n`);
  } else {
    // For direct streaming (no SSE formatting)
    res.write(chunk);
  }
  return true;
}

/**
 * End the stream with optional final data
 */
export function endStream(res: Response, finalChunk?: string): void {
  if (finalChunk) {
    writeChunk(res, finalChunk);
  }
  res.end();
}

/**
 * Create an async generator from a stream response
 * This is the reverse - for client-side consumption
 */
export async function* readStream(
  response: Response
): AsyncGenerator<string, void, unknown> {
  // This would be used on client side
  // For server, we use writeChunk instead
  throw new Error('readStream is for client-side use only');
}
