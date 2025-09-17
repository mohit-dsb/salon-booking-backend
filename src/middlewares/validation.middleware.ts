import { z, ZodError } from "zod";
import { AppError } from "./error.middleware";
import type { Request, Response, NextFunction } from "express";

// Generic validation function for different types
export const validate = (schema: z.ZodSchema) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      // For most schemas, we validate the body. For query schemas, we validate the query.
      // Determine what to validate based on the request method and content
      let dataToValidate;

      if (req.method === "GET") {
        dataToValidate = req.query;
      } else {
        dataToValidate = req.body;
      }

      const parsedData = schema.parse(dataToValidate);

      // Attach the parsed data to the request for use in controllers
      if (req.method === "GET") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (req as any).parsedQuery = parsedData;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (req as any).parsedBody = parsedData;
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Get the first error only
        const firstIssue = error.issues[0];
        const fieldPath = firstIssue.path.join(".");
        const fieldName = fieldPath || "field";

        // Customize error message based on error type and message content
        const originalMessage = firstIssue.message.toLowerCase();
        let message: string;

        if (firstIssue.code === "invalid_type") {
          message = `${fieldName} is required`;
        } else if (firstIssue.code === "too_small") {
          if (originalMessage.includes("string")) {
            message = `${fieldName} must be at least ${firstIssue.minimum} characters long`;
          } else {
            message = `${fieldName} must be at least ${firstIssue.minimum}`;
          }
        } else if (firstIssue.code === "too_big") {
          if (originalMessage.includes("string")) {
            message = `${fieldName} must be no more than ${firstIssue.maximum} characters long`;
          } else {
            message = `${fieldName} must be no more than ${firstIssue.maximum}`;
          }
        } else if (originalMessage.includes("url")) {
          message = `${fieldName} must be a valid URL`;
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
