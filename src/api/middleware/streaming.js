// API layer: Streaming response utilities
/**
 * Setup response for streaming
 */
export function setupStreaming(res, options = {}) {
    const { contentType = 'text/plain; charset=utf-8', keepAlive = true, keepAliveInterval = 30000, isSSE = true, } = options;
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
export function writeChunk(res, chunk, isSSE = true) {
    if (res.writableEnded)
        return false;
    if (isSSE) {
        // For Server-Sent Events format
        res.write(`data: ${chunk}\n\n`);
    }
    else {
        // For direct streaming (no SSE formatting)
        res.write(chunk);
    }
    return true;
}
/**
 * End the stream with optional final data
 */
export function endStream(res, finalChunk) {
    if (finalChunk) {
        writeChunk(res, finalChunk);
    }
    res.end();
}
/**
 * Create an async generator from a stream response
 * This is the reverse - for client-side consumption
 */
export async function* readStream(response) {
    // This would be used on client side
    // For server, we use writeChunk instead
    throw new Error('readStream is for client-side use only');
}
