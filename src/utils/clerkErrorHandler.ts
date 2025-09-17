import { extractClerkErrorMessage, isClerkError } from "./errorHandler";
import { logger } from "./logger";
import { AppError } from "@/middlewares/error.middleware";

/**
 * Handles Clerk API errors and converts them to appropriate AppErrors
 * @param error - The error from Clerk API
 * @param context - Additional context for logging
 * @param fallbackMessage - Default message if error extraction fails
 * @returns Never returns, always throws an AppError
 */
export function handleClerkError(error: unknown, context: string, fallbackMessage = "Operation failed"): never {
  if (error instanceof AppError) {
    throw error;
  }

  if (isClerkError(error)) {
    const errorMessage = extractClerkErrorMessage(error);

    // Log the detailed Clerk error for debugging
    logger.error(`Clerk error in ${context}:`, {
      clerkError: true,
      status: error.status,
      errors: error.errors,
      traceId: error.clerkTraceId,
      message: errorMessage,
      originalError: error.message,
      context,
    });

    // Determine appropriate HTTP status code
    let statusCode = 500;
    if (error.status === 422 || error.status === 400) {
      statusCode = 400; // Bad request for validation errors
    } else if (error.status === 401) {
      statusCode = 401; // Unauthorized
    } else if (error.status === 403) {
      statusCode = 403; // Forbidden
    } else if (error.status === 404) {
      statusCode = 404; // Not found
    }

    throw new AppError(errorMessage.message, statusCode);
  }

  // Handle non-Clerk errors
  logger.error(`Error in ${context}:`, error);
  throw new AppError(fallbackMessage, 500);
}

/**
 * Wrapper function for Clerk API calls with automatic error handling
 * @param operation - The Clerk API operation to execute
 * @param context - Context description for error logging
 * @param fallbackMessage - Fallback error message
 * @returns The result of the operation
 */
export async function executeClerkOperation<T>(
  operation: () => Promise<T>,
  context: string,
  fallbackMessage = "Operation failed",
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    handleClerkError(error, context, fallbackMessage);
  }
}
