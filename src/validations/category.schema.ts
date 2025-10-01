import { z } from "zod";

export const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().min(10).max(300).optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().min(10).max(300).optional(),
});

export const getAllCategoriesSchema = z.object({
  search: z.string().trim().max(30, { message: "Search term must be 30 characters or less" }).optional(),
});

export type GetAllCategoriesQuery = z.infer<typeof getAllCategoriesSchema>;
