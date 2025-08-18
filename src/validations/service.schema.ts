import z from "zod";

export const createServiceSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().min(10).max(500).optional(),
    price: z.number().positive().min(0.01),
    duration: z.number().int().positive().min(1).max(480), // Max 8 hours in minutes
    categoryId: z.string().min(1, "Category ID is required"),
  }),
});

export const updateServiceSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().min(10).max(500).optional(),
    price: z.number().positive().min(0.01).optional(),
    duration: z.number().int().positive().min(1).max(480).optional(),
    categoryId: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
  }),
});
