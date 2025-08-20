import dotenv from "dotenv";
import { cleanEnv, str, port, num } from "envalid";

dotenv.config();

export const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ["development", "test", "production"] }),
  PORT: port({ default: 3000 }),
  MONGODB_URI: str(),
  LOG_LEVEL: str({
    default: "info",
    choices: ["error", "warn", "info", "debug"],
  }),
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: num({ default: 15 * 60 * 1000 }),
  RATE_LIMIT_MAX_REQUESTS: num({ default: 100 }),
  // Clerk configuration
  CLERK_PUBLISHABLE_KEY: str(),
  CLERK_SECRET_KEY: str(),
  CLERK_WEBHOOK_SECRET: str({ default: "" }),
  // Redis configuration
  REDIS_URL: str({ default: "redis://localhost:6379" }),
  CACHE_TTL: num({ default: 3600 }), // 1 hour
});
