import { getAuth } from "@clerk/express";
import { AppError } from "@/middlewares/error.middleware";
import type { Request, Response, NextFunction } from "express";

// Type for extended auth object
interface AuthWithOrgId {
  orgId: string;
  [key: string]: unknown;
}

// Extract orgId from different sources based on your needs
export const requireAuthWithOrgId = (req: Request, _res: Response, next: NextFunction) => {
  const auth = getAuth(req);

  if (!auth.isAuthenticated) {
    return next(new AppError("Authentication required", 401));
  }

  // Method 1: From environment (single tenant):TODO REMOVE THIS VARIABLE IN PRODUCTION
  let orgId = process.env.ORG_ID || null;

  // Method 2: From request header (if frontend sends it)
  if (!orgId) {
    orgId = req.headers["x-org-id"] as string;
  }

  // Method 3: From Clerk session claims
  if (!orgId) {
    orgId = auth.sessionClaims?.org_id as string;
  }

  // Method 4: From user's default organization (if you store it in your DB)
  // You could also query your Member model here to get the user's orgId

  if (!orgId) {
    return next(new AppError("Organization ID is required. Please ensure you're part of an organization.", 401));
  }

  // Extend the auth object with orgId
  (req.auth as unknown as AuthWithOrgId) = {
    ...auth,
    orgId,
  };

  next();
};

// Helper function to get auth with orgId safely
export const getAuthWithOrgId = (req: Request): AuthWithOrgId & { userId: string } => {
  const auth = req.auth as unknown as AuthWithOrgId & { userId: string };
  if (!auth?.orgId) {
    throw new AppError("Organization ID is required", 401);
  }
  if (!auth.userId) {
    throw new AppError("User Authentication is required", 401);
  }
  return auth;
};
