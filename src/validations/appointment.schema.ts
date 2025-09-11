import { z } from "zod";
import { paginationQuerySchema } from "./pagination.schema";

// Appointment validation schema - clientId is optional for walk-in appointments
export const createAppointmentSchema = z
  .object({
    clientId: z.string().min(1, "Client ID is required").optional(), // Optional for walk-in
    memberId: z.string().min(1, "Member ID is required"),
    serviceId: z.string().min(1, "Service ID is required"),
    startTime: z.iso.datetime("Invalid start time format"),
    notes: z.string().max(500, "Notes must be less than 500 characters").optional(),
    internalNotes: z.string().max(500, "Internal notes must be less than 500 characters").optional(),

    // Walk-in client fields (used when clientId is not provided)
    walkInClientName: z
      .string()
      .min(1, "Walk-in client name is required")
      .max(100, "Walk-in client name must be less than 100 characters")
      .optional(),
    walkInClientPhone: z.string().max(20, "Phone must be less than 20 characters").optional(),
  })
  .refine(
    (data) => {
      // Either clientId should be provided OR walkInClientName should be provided
      return data.clientId || data.walkInClientName;
    },
    {
      message: "Either clientId or walkInClientName must be provided",
      path: ["clientId"],
    },
  );

export const updateAppointmentSchema = z.object({
  startTime: z.iso.datetime("Invalid start time format").optional(),
  status: z.enum(["SCHEDULED", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional(),
  notes: z.string().max(500, "Notes must be less than 500 characters").optional(),
  internalNotes: z.string().max(500, "Internal notes must be less than 500 characters").optional(),
  cancellationReason: z.string().max(200, "Cancellation reason must be less than 200 characters").optional(),
});

export const appointmentQuerySchema = z.object({
  clientId: z.string().optional(),
  memberId: z.string().optional(),
  serviceId: z.string().optional(),
  status: z.enum(["SCHEDULED", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional(),
  startDate: z.iso.datetime().optional(),
  endDate: z.iso.datetime().optional(),
  search: z.string().optional(), // Search by client name or notes
  isWalkIn: z.enum(["true", "false"]).optional(), // Filter by walk-in status
  ...paginationQuerySchema,
});

// Convert walk-in appointment to regular appointment with client
export const convertWalkInAppointmentSchema = z.object({
  clientId: z.string().min(1, "Client ID is required"),
});

export const rescheduleAppointmentSchema = z.object({
  startTime: z.iso.datetime("Invalid start time format"),
  notes: z.string().max(500, "Notes must be less than 500 characters").optional(),
});

export const cancelAppointmentSchema = z.object({
  cancellationReason: z
    .string()
    .min(1, "Cancellation reason is required")
    .max(200, "Cancellation reason must be less than 200 characters"),
});

// Availability check schema
export const checkAvailabilitySchema = z.object({
  memberId: z.string().min(1, "Member ID is required"),
  serviceId: z.string().min(1, "Service ID is required"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
});

export type CreateAppointmentData = z.infer<typeof createAppointmentSchema>;
export type ConvertWalkInAppointmentData = z.infer<typeof convertWalkInAppointmentSchema>;
export type UpdateAppointmentData = z.infer<typeof updateAppointmentSchema>;
export type AppointmentQueryParams = z.infer<typeof appointmentQuerySchema>;
export type RescheduleAppointmentData = z.infer<typeof rescheduleAppointmentSchema>;
export type CancelAppointmentData = z.infer<typeof cancelAppointmentSchema>;
export type CheckAvailabilityData = z.infer<typeof checkAvailabilitySchema>;

// Analytics and Reporting Schemas

// Base analytics query schema with common filtering options
export const analyticsBaseSchema = z.object({
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be in YYYY-MM-DD format")
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be in YYYY-MM-DD format")
    .optional(),
  memberId: z.string().optional(),
  serviceId: z.string().optional(),
  categoryId: z.string().optional(),
  period: z
    .enum([
      "today",
      "yesterday",
      "this_week",
      "last_week",
      "this_month",
      "last_month",
      "this_year",
      "last_year",
      "custom",
    ])
    .optional(),
  timezone: z.string().optional(), // e.g., "America/New_York"
});

// Appointment summary analytics schema
export const appointmentSummarySchema = analyticsBaseSchema.extend({
  groupBy: z.enum(["day", "week", "month", "member", "service", "status"]).optional().default("day"),
  includeMetrics: z
    .array(z.enum(["revenue", "utilization", "cancellation_rate", "no_show_rate", "conversion_rate"]))
    .optional(),
});

// Type for appointment list parameters after transformation
export type AppointmentListParams = Omit<
  z.infer<typeof appointmentListBaseSchema>,
  "includeFields" | "excludeFields"
> & {
  includeFields?: string[];
  excludeFields?: string[];
};

// Base appointment list schema without transformation
const appointmentListBaseSchema = analyticsBaseSchema.extend({
  status: z
    .union([
      z.array(z.enum(["SCHEDULED", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"])),
      z
        .string()
        .transform((val) =>
          val
            .split(",")
            .map((s) => s.trim() as "SCHEDULED" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW"),
        ),
    ])
    .optional(),
  isWalkIn: z.enum(["true", "false"]).optional(),
  sortBy: z.enum(["startTime", "createdAt", "revenue", "member", "service"]).optional().default("startTime"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  includeDetails: z.array(z.enum(["revenue"])).optional(),
  search: z.string().optional(), // Search by client name, member name, or service name
  includeFields: z.string().optional(), // Comma-separated list of fields to include
  excludeFields: z.string().optional(), // Comma-separated list of fields to exclude
  ...paginationQuerySchema,
});

// Appointment list analytics schema with transformation
export const appointmentListSchema = appointmentListBaseSchema.transform((data): AppointmentListParams => {
  // Transform comma-separated strings to arrays
  const transformed: AppointmentListParams = {
    ...data,
    includeFields: undefined,
    excludeFields: undefined,
  };

  if (data.includeFields) {
    transformed.includeFields = data.includeFields.split(",").map((field) => field.trim());
  }

  if (data.excludeFields) {
    transformed.excludeFields = data.excludeFields.split(",").map((field) => field.trim());
  }

  return transformed;
});

// Cancellations and no-shows analytics schema
export const cancellationNoShowSchema = analyticsBaseSchema.extend({
  analysisType: z.enum(["cancellations", "no_shows", "both"]).optional().default("both"),
  groupBy: z.enum(["day", "week", "month", "member", "service", "reason"]).optional().default("day"),
  includeReasons: z.boolean().optional().default(true),
  minCancellationRate: z.number().min(0).max(100).optional(), // Filter members/services with high cancellation rates
});

// Export types for the analytics schemas
export type AppointmentSummaryParams = z.infer<typeof appointmentSummarySchema>;
export type CancellationNoShowParams = z.infer<typeof cancellationNoShowSchema>;
