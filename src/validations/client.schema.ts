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

// Client Summary Analytics Schema
export const clientSummarySchema = analyticsBaseSchema.extend({
  groupBy: z.enum(["day", "week", "month"]).default("day"),
  includeMetrics: z.array(z.enum(["revenue", "averageValue", "retention", "growth"])).default([]),
  includeSegmentation: z.boolean().default(false),
  compareWithPrevious: z.boolean().default(false),
});

// Client List Analytics Schema
export const clientListAnalyticsSchema = z.object({
  ...paginationQuerySchema.shape,
  ...analyticsBaseSchema.shape,
  clientType: z.enum(["new", "returning", "walk_in", "all"]).default("all"),
  sortBy: z.enum(["name", "email", "totalSpent", "lastVisit", "appointmentCount", "registrationDate"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
  includeDetails: z.array(z.enum(["appointments", "services", "spending", "preferences", "demographics"])).default([]),
  minAppointments: z.number().int().min(0).optional(),
  maxAppointments: z.number().int().min(0).optional(),
  minSpent: z.number().min(0).optional(),
  maxSpent: z.number().min(0).optional(),
  registrationDateFrom: z.iso.datetime().optional(),
  registrationDateTo: z.iso.datetime().optional(),
  lastVisitFrom: z.iso.datetime().optional(),
  lastVisitTo: z.iso.datetime().optional(),
  ageFrom: z.number().int().min(0).max(150).optional(),
  ageTo: z.number().int().min(0).max(150).optional(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  communicationPreference: z.enum(["EMAIL", "PHONE", "SMS"]).optional(),
  isActive: z.boolean().optional(),
  search: z.string().optional(),
});

// Client Insights Schema
export const clientInsightsSchema = z.object({
  includeAppointmentHistory: z.boolean().default(true),
  includeSpendingAnalysis: z.boolean().default(true),
  includeServicePreferences: z.boolean().default(true),
  includeMemberPreferences: z.boolean().default(true),
  includeBehaviorPatterns: z.boolean().default(true),
  includeRecommendations: z.boolean().default(false),
  historyMonths: z.number().int().min(1).max(60).default(12),
  compareWithAverage: z.boolean().default(false),
});

export type CreateClientData = z.infer<typeof createClientSchema>;
export type UpdateClientData = z.infer<typeof updateClientSchema>;
export type ClientQueryParams = z.infer<typeof clientQuerySchema>;

// Analytics types
export type ClientSummaryParams = z.infer<typeof clientSummarySchema>;
export type ClientListAnalyticsParams = z.infer<typeof clientListAnalyticsSchema>;
export type ClientInsightsParams = z.infer<typeof clientInsightsSchema>;
