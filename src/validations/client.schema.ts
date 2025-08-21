import { z } from "zod";
import { paginationQuerySchema } from "./pagination.schema";

// Client validation schemas
export const createClientSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(50, "First name must be less than 50 characters").trim(),
  lastName: z.string().min(1, "Last name is required").max(50, "Last name must be less than 50 characters").trim(),
  email: z.email("Invalid email format").toLowerCase(),
  phone: z.string().max(20, "Phone must be less than 20 characters").optional(),
  dateOfBirth: z.iso.datetime().optional(),
  address: z
    .object({
      street: z.string().max(100, "Street must be less than 100 characters").optional(),
      city: z.string().max(50, "City must be less than 50 characters").optional(),
      state: z.string().max(50, "State must be less than 50 characters").optional(),
      zipCode: z.string().max(20, "Zip code must be less than 20 characters").optional(),
      country: z.string().max(50, "Country must be less than 50 characters").optional(),
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
