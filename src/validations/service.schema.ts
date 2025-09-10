import z from "zod";

export const createServiceSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().min(10).max(500).optional(),
  price: z.number().positive().min(0.01),
  duration: z.number().int().positive().min(1).max(480), // Max 8 hours in minutes
  categoryId: z.string().min(1, "Category ID is required"),
  isActive: z.boolean().optional(),
});

export const updateServiceSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().min(10).max(500).optional(),
  price: z.number().positive().min(0.01).optional(),
  duration: z.number().int().positive().min(1).max(480).optional(),
  categoryId: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

export type CreateServiceData = z.infer<typeof createServiceSchema>;
export type UpdateServiceData = z.infer<typeof updateServiceSchema>;
