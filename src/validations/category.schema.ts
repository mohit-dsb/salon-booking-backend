import z from "zod";

export const createCategorySchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100),
    description: z.string().min(10).max(500).optional(),
    orgId: z.string().min(1, "Organization ID is required"),
  }),
});
