import { z } from "zod";
import { paginationQuerySchema } from "./pagination.schema";

// Client validation schemas
export const createClientSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(50, "First name must be less than 50 characters"),
  lastName: z.string().min(1, "Last name is required").max(50, "Last name must be less than 50 characters"),
  email: z.email("Invalid email format"),
  phone: z.string().optional(),
  dateOfBirth: z.iso.datetime().optional(),
  address: z
    .object({
      street: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
  notes: z.string().max(500, "Notes must be less than 500 characters").optional(),
  preferences: z
    .object({
      communicationMethod: z.enum(["EMAIL", "PHONE", "SMS"]).optional(),
      reminders: z.boolean().optional(),
      newsletter: z.boolean().optional(),
    })
    .optional(),
});

export const updateClientSchema = createClientSchema.partial();

export const clientQuerySchema = z.object({
  search: z.string().optional(),
  isActive: z.enum(["true", "false"]).optional(),
  ...paginationQuerySchema.shape,
});

export type CreateClientData = z.infer<typeof createClientSchema>;
export type UpdateClientData = z.infer<typeof updateClientSchema>;
export type ClientQueryParams = z.infer<typeof clientQuerySchema>;
