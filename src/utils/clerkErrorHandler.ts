import { logger } from "./logger";
import { AppError } from "@/middlewares/error.middleware";

/**
 * Interface for Clerk error structure
 */
interface ClerkErrorDetails {
  code?: string;
  message?: string;
  longMessage?: string;
  meta?: Record<string, unknown>;
}

interface ClerkAPIError {
  status?: number;
  name?: string;
  message?: string;
  errors?: ClerkErrorDetails[];
  clerkTraceId?: string;
}

/**
 * Extracts meaningful error messages from Clerk API errors
 * @param error - The error object from Clerk API
 * @returns Processed error message
 */
function extractClerkErrorMessage(error: ClerkAPIError): string {
  const clerkErrors = error?.errors;

  if (clerkErrors && Array.isArray(clerkErrors) && clerkErrors.length > 0) {
    // Extract the most relevant error message
    const primaryError = clerkErrors[0];

    if (primaryError?.longMessage) {
      return primaryError.longMessage;
    } else if (primaryError?.message) {
      return primaryError.message;
    }
  }

  // Fallback to main error message if available and meaningful
  if (error?.message && error.message !== "Unprocessable Entity") {
    return error.message;
  }

  return "An error occurred with the authentication service";
}

/**
 * Determines if an error is a Clerk API error
 * @param error - The error to check
 * @returns True if it's a Clerk error
 */
function isClerkError(error: unknown): error is ClerkAPIError {
  const typedError = error as ClerkAPIError;
  return (
    (typeof typedError?.status === "number" && typedError.status >= 400) ||
    typedError?.name === "ClerkAPIError" ||
    Array.isArray(typedError?.errors)
  );
}

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

    throw new AppError(errorMessage, statusCode);
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
