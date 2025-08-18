/// <reference types="@clerk/express/env" />

import { AuthObject } from "@clerk/express";

declare global {
  namespace Express {
    interface Request {
      auth: AuthObject & {
        orgId?: string;
        [key: string]: unknown;
      };
    }
  }
}

export {};
