import { z } from "zod";

// Pagination query validation schema
export const paginationQuerySchema = z.object({
  query: z
    .object({
      page: z.string().optional(),
      limit: z.string().optional(),
      sortBy: z.string().optional(),
      sortOrder: z.enum(["asc", "desc"]).optional(),
    })
    .optional(),
});

// Category-specific pagination schema
export const categoryPaginationSchema = z.object({
  query: z
    .object({
      page: z.string().regex(/^\d+$/, "Page must be a positive number").optional(),
      limit: z.string().regex(/^\d+$/, "Limit must be a positive number").optional(),
      sortBy: z.enum(["name", "createdAt", "updatedAt"]).optional(),
      sortOrder: z.enum(["asc", "desc"]).optional(),
    })
    .optional(),
});

// Service-specific pagination schema
export const servicePaginationSchema = z.object({
  query: z
    .object({
      page: z.string().regex(/^\d+$/, "Page must be a positive number").optional(),
      limit: z.string().regex(/^\d+$/, "Limit must be a positive number").optional(),
      sortBy: z.enum(["name", "price", "duration", "createdAt", "updatedAt"]).optional(),
      sortOrder: z.enum(["asc", "desc"]).optional(),
    })
    .optional(),
});
