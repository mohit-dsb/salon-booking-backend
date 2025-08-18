import { logger } from "@/utils/logger";
import { env } from "@/config/environment";
import type { Request, Response, NextFunction } from "express";

// Interface for Mongoose validation errors
interface MongooseValidationError extends Error {
  errors: Record<string, { message: string }>;
}

// Interface for MongoDB duplicate key errors
interface MongoDuplicateKeyError extends Error {
  code: number;
  keyValue: Record<string, unknown>;
}

interface ErrorResponse {
  success: boolean;
  message: string;
  stack?: string;
  error?: Error;
}

// Type guard functions
const isMongooseValidationError = (error: unknown): error is MongooseValidationError => {
  return (
    (error as MongooseValidationError).name === "ValidationError" &&
    (error as MongooseValidationError).errors !== undefined
  );
};

const isMongoDuplicateKeyError = (error: unknown): error is MongoDuplicateKeyError => {
  return (error as MongoDuplicateKeyError).code === 11000;
};

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    // Only call captureStackTrace if it exists (Node.js specific)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export const errorHandler = (err: AppError | Error, req: Request, res: Response, _next: NextFunction) => {
  let error = err as AppError;

  // Mongoose validation error
  if (isMongooseValidationError(err)) {
    const message = Object.values(err.errors)
      .map((val) => val.message)
      .join(", ");
    error = new AppError(message, 400);
  }

  // Mongoose duplicate key error
  if (isMongoDuplicateKeyError(err)) {
    const field = Object.keys(err.keyValue)[0];
    const message = `${field} already exists`;
    error = new AppError(message, 400);
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    error = new AppError("Invalid token", 401);
  }

  if (err.name === "TokenExpiredError") {
    error = new AppError("Token expired", 401);
  }

  // Log error
  logger.error("Error occurred:", {
    message: error.message,
    statusCode: error.statusCode,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
  });

  // Send error response
  const statusCode = error.statusCode || 500;
  const message = error.isOperational ? error.message : "Something went wrong";

  const response: ErrorResponse = {
    success: false,
    message,
    ...(env.NODE_ENV === "development" && {
      stack: error.stack,
      error: err,
    }),
  };

  res.status(statusCode).json(response);
};

// Async error wrapper
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) => {
  return (_req: Request, _res: Response, _next: NextFunction) => {
    Promise.resolve(fn(_req, _res, _next)).catch(_next);
  };
};
