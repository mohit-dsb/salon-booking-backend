/// <reference types="@clerk/express/env" />

import { AuthObject } from "@clerk/express";

declare global {
  namespace Express {
    interface Request {
      auth: AuthObject & {
        orgId?: string;
        [key: string]: unknown;
      };
      parsedBody?: unknown; // Parsed and validated body
      parsedQuery?: unknown; // Parsed and validated query
    }
  }
}

export {};
