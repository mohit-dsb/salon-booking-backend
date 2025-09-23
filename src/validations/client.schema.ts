import { z } from "zod";
import { paginationQuerySchema } from "./pagination.schema";

// Address validation schema
const addressSchema = z.object({
  street: z.string().optional(),
  district: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postcode: z.string().optional(),
  country: z.string().optional(),
  addressType: z.string().optional(), // e.g., Home, Work
});

// Client validation schemas
export const createClientSchema = z.object({
  // PROFILE INFO
  firstName: z.string().min(1, "First name is required").max(50, "First name must be less than 50 characters").trim(),
  lastName: z.string().min(1, "Last name is required").max(50, "Last name must be less than 50 characters").trim(),
  email: z.email("Invalid email format").toLowerCase().trim(),
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number")
    .optional(),
  dateOfBirth: z.iso.datetime().optional(),
  gender: z.enum(["Male", "Female", "Other"]),
  // ADDITIONAL INFO
  // Client source: How the client heard about the business
  clientSource: z.enum(["Walk-in"]).default("Walk-in"), // Extendable for future sources
  // Which client referred this client, if any
  referredBy: z.string().optional(),
  preferredLanguage: z.string().max(20, "Preferred language must be less than 20 characters").optional(),
  occupation: z.string().max(30, "Occupation must be less than 30 characters").optional(),
  country: z.string().max(50, "Country must be less than 50 characters").optional(),
  // ADDITIONAL DETAILS
  additionalEmail: z.email("Invalid email format").toLowerCase().trim().optional(),
  additionalPhone: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number")
    .optional(),
  addresses: z.array(addressSchema).optional(),
  // NOTIFICATION PREFERENCES
  notifyByEmail: z.boolean().default(true),
  notifyBySMS: z.boolean().default(false),
  notifyByWhatsapp: z.boolean().default(false),
  // MARKETING PREFERENCES
  allowEmailMarketing: z.boolean().default(false),
  allowSMSMarketing: z.boolean().default(false),
  allowWhatsappMarketing: z.boolean().default(false),
});

export const updateClientSchema = createClientSchema.partial();

export const getAllClientsSchema = z.object({
  ...paginationQuerySchema.shape,
  search: z.string().max(100).optional(),
  isActive: z.boolean().optional(),
  sortBy: z.enum(["firstName", "lastName", "createdAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

// Analytics validation schemas
const analyticsBaseSchema = z.object({
  startDate: z.iso.datetime().optional(),
  endDate: z.iso.datetime().optional(),
  period: z
    .enum(["today", "yesterday", "this_week", "last_week", "this_month", "last_month", "this_year", "last_year"])
    .optional(),
  memberId: z.string().optional(),
  serviceId: z.string().optional(),
  categoryId: z.string().optional(),
});

// Client List Analytics Schema
export const clientListAnalyticsSchema = z.object({
  ...paginationQuerySchema.shape,
  ...analyticsBaseSchema.shape,
  sortBy: z.enum(["name", "email", "totalSpent", "lastVisit", "appointmentCount", "registrationDate"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
  gender: z.enum(["Male", "Female", "Other"]).optional(),
});

export type CreateClientData = z.infer<typeof createClientSchema>;
export type UpdateClientData = z.infer<typeof updateClientSchema>;
export type GetAllClientsParams = z.infer<typeof getAllClientsSchema>;

// Analytics types
export type ClientListAnalyticsParams = z.infer<typeof clientListAnalyticsSchema>;
