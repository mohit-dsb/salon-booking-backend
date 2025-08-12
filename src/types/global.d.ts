// Global type declarations for Node.js environment
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'test' | 'production';
      PORT?: string;
      MONGODB_URI: string;
      LOG_LEVEL?: 'error' | 'warn' | 'info' | 'debug';
      CLERK_PUBLISHABLE_KEY: string;
      CLERK_SECRET_KEY: string;
      RATE_LIMIT_WINDOW_MS?: string;
      RATE_LIMIT_MAX_REQUESTS?: string;
    }
  }
}

export {};
