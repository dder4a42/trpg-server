// Type declarations for Express Request augmentation
import type { User } from '@/domain/user/types.js';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      sessionId?: string;
    }
  }
}

export {};
