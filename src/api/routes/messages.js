// API layer: Message rendering endpoints
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '@/api/middleware/errorHandler.js';
import { MessageRenderer } from '@/application/messages/MessageRenderer.js';
const router = Router();
const renderer = new MessageRenderer();
const MarkdownSchema = z.object({
    content: z.string(),
});
router.post('/markdown', asyncHandler(async (req, res) => {
    const { content } = MarkdownSchema.parse(req.body);
    const html = await renderer.finalizeStreamingContent(content);
    res.json({ html });
}));
export default router;
