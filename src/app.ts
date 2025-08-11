import routesV1 from "@/routes/v1";
import { setupSwagger } from "@/config/swagger";
import { clerkMiddleware } from "@clerk/express";
import { morganMiddleware } from "@/utils/logger";
import { errorHandler } from "@/middlewares/error.middleware";
import express, { Application, Request, Response } from "express";
import { securityMiddlewares } from "@/middlewares/security.middleware";

const app: Application = express();

// Middleware: Security, compression, CORS, rate limiting
securityMiddlewares.forEach((middleware) => app.use(middleware));

// Middleware: HTTP logging
app.use(morganMiddleware);

// Middleware: Body parsers
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Middleware: Clerk Auth
app.use(clerkMiddleware());

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

// API Routes (versioned)
app.use("/api/v1", routesV1);

// API Docs (Swagger)
setupSwagger(app);

// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ success: false, message: "API endpoint not found" });
});

// Error Handling Middleware
app.use(errorHandler);

export { app };
