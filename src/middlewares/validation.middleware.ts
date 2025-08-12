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
        const errorMessages = error.issues.map((issue: z.core.$ZodIssue) => ({
          message: issue.message,
          path: issue.path,
        }));
        next(new AppError(`Validation error: ${JSON.stringify(errorMessages)}`, 400));
      } else {
        next(error);
      }
    }
  };
};
