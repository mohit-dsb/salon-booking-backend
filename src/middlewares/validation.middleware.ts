import { Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";
import { AppError } from "./error.middleware";

export const validate = (schema: z.ZodObject<any, any>) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Get the first error only
        const firstIssue = error.issues[0];
        const fieldPath = firstIssue.path.filter((p) => p !== "body" && p !== "query" && p !== "params").join(".");
        const fieldName = fieldPath || "field";

        // Customize error message based on error type and message content
        const originalMessage = firstIssue.message.toLowerCase();
        let message: string;

        if (firstIssue.code === "invalid_type") {
          message = `${fieldName} is required`;
        } else if (firstIssue.code === "too_small") {
          if (originalMessage.includes("string")) {
            message = `${fieldName} must be at least ${(firstIssue as any).minimum} characters long`;
          } else {
            message = `${fieldName} must be at least ${(firstIssue as any).minimum}`;
          }
        } else if (firstIssue.code === "too_big") {
          if (originalMessage.includes("string")) {
            message = `${fieldName} must be no more than ${(firstIssue as any).maximum} characters long`;
          } else {
            message = `${fieldName} must be no more than ${(firstIssue as any).maximum}`;
          }
        } else if (originalMessage.includes("email")) {
          message = `${fieldName} must be a valid email address`;
        } else if (originalMessage.includes("url")) {
          message = `${fieldName} must be a valid URL`;
        } else if (originalMessage.includes("uuid")) {
          message = `${fieldName} must be a valid UUID`;
        } else if (firstIssue.code === "custom") {
          message = firstIssue.message;
        } else {
          // Capitalize first letter and add field name if not present
          const formattedMessage = firstIssue.message.charAt(0).toUpperCase() + firstIssue.message.slice(1);
          message = formattedMessage.includes(fieldName) ? formattedMessage : `${fieldName}: ${formattedMessage}`;
        }

        next(new AppError(message, 400));
      } else {
        next(error);
      }
    }
  };
};
