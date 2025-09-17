import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MONGODB_URI: z.string(),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  // Clerk configuration
  CLERK_PUBLISHABLE_KEY: z.string(),
  CLERK_SECRET_KEY: z.string(),
  CLERK_WEBHOOK_SECRET: z.string().default(""),
  // Redis configuration
  REDIS_URL: z.string().default("redis://localhost:6379"),
  CACHE_TTL: z.coerce.number().default(3600), // 1 hour
});

export const env = envSchema.parse(process.env);
