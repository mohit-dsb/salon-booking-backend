import { AppError } from "@/middlewares/error.middleware";
import { logger } from "./logger";
import { Prisma } from "@prisma/client";

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
 * Standard error response format following industry best practices
 */
interface StandardErrorResponse {
  message: string;
  statusCode: number;
  errorCode?: string;
  details?: unknown;
}

/**
 * Extracts meaningful error messages from Clerk API errors
 */
export function extractClerkErrorMessage(error: ClerkAPIError): StandardErrorResponse {
  const clerkErrors = error?.errors;

  if (clerkErrors && Array.isArray(clerkErrors) && clerkErrors.length > 0) {
    const primaryError = clerkErrors[0];

    if (primaryError?.longMessage) {
      return {
        message: primaryError.longMessage,
        statusCode: error.status === 422 ? 400 : 500,
        errorCode: primaryError.code,
        details: primaryError.meta,
      };
    } else if (primaryError?.message) {
      return {
        message: primaryError.message,
        statusCode: error.status === 422 ? 400 : 500,
        errorCode: primaryError.code,
        details: primaryError.meta,
      };
    }
  }

  // Fallback to main error message if available and meaningful
  if (error?.message && error.message !== "Unprocessable Entity") {
    return {
      message: error.message,
      statusCode: error.status === 422 ? 400 : 500,
      errorCode: "CLERK_API_ERROR",
    };
  }

  return {
    message: "An error occurred with the authentication service",
    statusCode: 500,
    errorCode: "CLERK_UNKNOWN_ERROR",
  };
}

/**
 * Handles Prisma database errors and converts them to meaningful messages
 */
function handlePrismaError(error: Prisma.PrismaClientKnownRequestError): StandardErrorResponse {
  switch (error.code) {
    case "P2002": {
      // Unique constraint violation
      const target = error.meta?.target as string[] | string;
      const field = Array.isArray(target) ? target[0] : target;

      // Extract field name more intelligently
      let fieldName = "field";
      if (field) {
        if (field.includes("_clerkId_")) {
          fieldName = "user account";
        } else if (field.includes("_email_")) {
          fieldName = "email";
        } else if (field.includes("_username_")) {
          fieldName = "username";
        } else {
          // General extraction: remove model prefix and _key suffix
          fieldName = field.replace(/^.*_/, "").replace(/_key$/, "") || "field";
        }
      }

      return {
        message: `A record with this ${fieldName} already exists`,
        statusCode: 409, // Conflict
        errorCode: "DUPLICATE_RECORD",
        details: { field: fieldName, constraint: field },
      };
    }

    case "P2025": {
      // Record not found
      return {
        message: "The requested record was not found",
        statusCode: 404,
        errorCode: "RECORD_NOT_FOUND",
      };
    }

    case "P2003": {
      // Foreign key constraint violation
      return {
        message: "Invalid reference to related record",
        statusCode: 400,
        errorCode: "INVALID_REFERENCE",
        details: error.meta,
      };
    }

    case "P2021": {
      // Table does not exist
      return {
        message: "Database configuration error",
        statusCode: 500,
        errorCode: "DATABASE_ERROR",
      };
    }

    case "P2022": {
      // Column does not exist
      return {
        message: "Invalid field in request",
        statusCode: 400,
        errorCode: "INVALID_FIELD",
        details: error.meta,
      };
    }

    default: {
      return {
        message: "Database operation failed",
        statusCode: 500,
        errorCode: "DATABASE_ERROR",
        details: { code: error.code, meta: error.meta },
      };
    }
  }
}

/**
 * Determines if an error is a Clerk API error
 */
export function isClerkError(error: unknown): error is ClerkAPIError {
  const typedError = error as ClerkAPIError;
  return (
    (typeof typedError?.status === "number" && typedError.status >= 400) ||
    typedError?.name === "ClerkAPIError" ||
    Array.isArray(typedError?.errors)
  );
}

/**
 * Determines if an error is a Prisma error
 */
function isPrismaError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}

/**
 * Universal error handler that properly categorizes and handles different types of errors
 * @param error - The error from any source
 * @param context - Additional context for logging
 * @param fallbackMessage - Default message if error extraction fails
 * @returns Never returns, always throws an AppError
 */
export function handleError(error: unknown, context: string, fallbackMessage = "Operation failed"): never {
  if (error instanceof AppError) {
    throw error;
  }

  let errorResponse: StandardErrorResponse;

  if (isClerkError(error)) {
    errorResponse = extractClerkErrorMessage(error);

    // Log the detailed Clerk error for debugging
    logger.error(`Clerk error in ${context}:`, {
      clerkError: true,
      status: error.status,
      errors: error.errors,
      traceId: error.clerkTraceId,
      context,
    });
  } else if (isPrismaError(error)) {
    errorResponse = handlePrismaError(error);

    // Log the detailed Prisma error for debugging
    logger.error(`Database error in ${context}:`, {
      prismaError: true,
      code: error.code,
      meta: error.meta,
      context,
    });
  } else {
    // Handle unknown errors
    errorResponse = {
      message: fallbackMessage,
      statusCode: 500,
      errorCode: "INTERNAL_ERROR",
    };

    logger.error(`Unknown error in ${context}:`, error);
  }

  throw new AppError(errorResponse.message, errorResponse.statusCode, errorResponse.errorCode, errorResponse.details);
}
