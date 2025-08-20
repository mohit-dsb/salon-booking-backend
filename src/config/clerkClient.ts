import { env } from "./environment";
import { createClerkClient } from "@clerk/express";

export const clerkClient = createClerkClient({
  publishableKey: env.CLERK_PUBLISHABLE_KEY,
  secretKey: env.CLERK_SECRET_KEY,
});
