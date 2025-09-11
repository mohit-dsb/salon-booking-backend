import cors from "cors";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { env } from "@/config/environment";

export const securityMiddlewares = [
  // CORS configuration
  cors({
    origin: ["http://localhost:3000", "http://localhost:3001"],
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),

  // Compression
  compression(),

  // Rate limiting
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX_REQUESTS,
    message: {
      error: "Too many requests from this IP",
      retryAfter: Math.ceil(env.RATE_LIMIT_WINDOW_MS / 1000),
    },
    standardHeaders: true,
    legacyHeaders: false,
  }),
];

// Stricter rate limit for authentication endpoints
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    error: "Too many authentication attempts",
    retryAfter: 900,
  },
  skipSuccessfulRequests: true,
});
