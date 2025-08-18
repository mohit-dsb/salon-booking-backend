import z from "zod";

export const createCategorySchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().min(10).max(300).optional(),
  }),
});

export const updateCategorySchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().min(10).max(300).optional(),
  }),
});
