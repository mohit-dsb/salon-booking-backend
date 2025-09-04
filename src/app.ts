import routesV1 from "@/routes/v1";
import { redisClient } from "@/config/redis";
import { clerkMiddleware } from "@clerk/express";
import { morganMiddleware } from "@/utils/logger";
import { errorHandler } from "@/middlewares/error.middleware";
import express, { Application, Request, Response } from "express";
import { securityMiddlewares } from "@/middlewares/security.middleware";
import { syncClerkUser } from "@/controllers/member.controller";

const app: Application = express();

// Middleware: Security, compression, CORS, rate limiting
securityMiddlewares.forEach((middleware) => app.use(middleware));

// Middleware: HTTP logging
app.use(morganMiddleware);

// Webhook routes (before body parsing)
app.post("/api/v1/sync-clerk-user", express.raw({ type: "application/json" }), syncClerkUser);

// Middleware: Body parsers
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Middleware: Clerk Auth
app.use(clerkMiddleware());

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  const isRedisConnected = redisClient.ping();
  res.status(200).json({ status: "ok", uptime: process.uptime(), isRedisConnected });
});

// API Routes (versioned)
app.use("/api/v1", routesV1);

// 404 Handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: "API endpoint not found" });
});

// Error Handling Middleware
app.use(errorHandler);

export { app };
