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
  ...paginationQuerySchema.shape,
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
