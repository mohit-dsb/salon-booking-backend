import { z } from "zod";

// Base time validation regex (HH:MM format)
const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

// Date validation (YYYY-MM-DD format)
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

// Color validation (hex color)
const colorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

// Break period schema
export const breakPeriodSchema = z
  .object({
    startTime: z.string().regex(timeRegex, "Invalid time format. Use HH:MM"),
    endTime: z.string().regex(timeRegex, "Invalid time format. Use HH:MM"),
    title: z.string().min(1).max(50).optional(),
  })
  .refine(
    (data) => {
      const start = new Date(`1970-01-01T${data.startTime}:00`);
      const end = new Date(`1970-01-01T${data.endTime}:00`);
      return start < end;
    },
    {
      message: "End time must be after start time",
      path: ["endTime"],
    },
  );

// Shift status enum
export const shiftStatusSchema = z.enum(["SCHEDULED", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"]);

// Recurrence pattern enum
export const recurrencePatternSchema = z.enum(["DAILY", "WEEKLY", "BI_WEEKLY", "MONTHLY", "CUSTOM"]);

// Create shift schema
export const createShiftSchema = z
  .object({
    memberId: z.string().min(1, "Member ID is required"),
    date: z.string().regex(dateRegex, "Invalid date format. Use YYYY-MM-DD"),
    startTime: z.string().regex(timeRegex, "Invalid time format. Use HH:MM"),
    endTime: z.string().regex(timeRegex, "Invalid time format. Use HH:MM"),
    title: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    color: z.string().regex(colorRegex, "Invalid color format. Use hex color").optional(),
    breaks: z.array(breakPeriodSchema).max(5, "Maximum 5 breaks allowed").optional(),
    isRecurring: z.boolean().optional().default(false),
    recurrencePattern: recurrencePatternSchema.optional(),
    parentShiftId: z.string().optional(),
  })
  .refine(
    (data) => {
      const start = new Date(`1970-01-01T${data.startTime}:00`);
      const end = new Date(`1970-01-01T${data.endTime}:00`);
      const diffMinutes = (end.getTime() - start.getTime()) / (1000 * 60);

      return diffMinutes >= 30 && diffMinutes <= 720; // 30 minutes to 12 hours
    },
    {
      message: "Shift duration must be between 30 minutes and 12 hours",
      path: ["endTime"],
    },
  )
  .refine(
    (data) => {
      // If recurring is true, recurrence pattern is required
      if (data.isRecurring && !data.recurrencePattern) {
        return false;
      }
      return true;
    },
    {
      message: "Recurrence pattern is required for recurring shifts",
      path: ["recurrencePattern"],
    },
  )
  .refine(
    (data) => {
      // Validate date is not in the past (except for today)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const shiftDate = new Date(data.date);

      return shiftDate >= today;
    },
    {
      message: "Shift date cannot be in the past",
      path: ["date"],
    },
  );

// Create recurring shift schema with additional options
export const createRecurringShiftSchema = createShiftSchema.extend({
  isRecurring: z.literal(true),
  recurrencePattern: recurrencePatternSchema,
  recurrenceOptions: z
    .object({
      endDate: z.string().regex(dateRegex, "Invalid date format. Use YYYY-MM-DD").optional(),
      maxOccurrences: z.number().min(1).max(365).optional(),
      customPattern: z
        .object({
          interval: z.number().min(1).max(30),
          daysOfWeek: z.array(z.number().min(0).max(6)).max(7).optional(),
        })
        .optional(),
    })
    .refine(
      (options) => {
        return options.endDate || options.maxOccurrences;
      },
      {
        message: "Either end date or max occurrences must be specified",
      },
    ),
});

// Update shift schema
export const updateShiftSchema = z
  .object({
    date: z.string().regex(dateRegex, "Invalid date format. Use YYYY-MM-DD").optional(),
    startTime: z.string().regex(timeRegex, "Invalid time format. Use HH:MM").optional(),
    endTime: z.string().regex(timeRegex, "Invalid time format. Use HH:MM").optional(),
    title: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    color: z.string().regex(colorRegex, "Invalid color format. Use hex color").optional(),
    status: shiftStatusSchema.optional(),
    breaks: z.array(breakPeriodSchema).max(5, "Maximum 5 breaks allowed").optional(),
  })
  .refine(
    (data) => {
      // If both start and end time provided, validate duration
      if (data.startTime && data.endTime) {
        const start = new Date(`1970-01-01T${data.startTime}:00`);
        const end = new Date(`1970-01-01T${data.endTime}:00`);
        const diffMinutes = (end.getTime() - start.getTime()) / (1000 * 60);

        return diffMinutes >= 30 && diffMinutes <= 720;
      }
      return true;
    },
    {
      message: "Shift duration must be between 30 minutes and 12 hours",
      path: ["endTime"],
    },
  );

// Get shifts filters schema
export const getShiftsSchema = z
  .object({
    memberId: z.string().optional(),
    startDate: z.string().regex(dateRegex, "Invalid date format. Use YYYY-MM-DD").optional(),
    endDate: z.string().regex(dateRegex, "Invalid date format. Use YYYY-MM-DD").optional(),
    status: shiftStatusSchema.optional(),
    includeRecurring: z
      .string()
      .transform((val) => val === "true")
      .optional(),
  })
  .refine(
    (data) => {
      // If both dates provided, start date should be before or equal to end date
      if (data.startDate && data.endDate) {
        return new Date(data.startDate) <= new Date(data.endDate);
      }
      return true;
    },
    {
      message: "Start date must be before or equal to end date",
      path: ["endDate"],
    },
  );

// Get weekly schedule schema - updated to handle query parameters properly
export const getWeeklyScheduleSchema = z
  .object({
    weekStart: z.string().regex(dateRegex, "Invalid date format. Use YYYY-MM-DD").optional(),
    memberId: z.string().optional(),
  })
  .refine(
    (data) => {
      // If weekStart is provided, validate that it's actually a Monday
      if (data.weekStart) {
        const date = new Date(data.weekStart);
        return date.getDay() === 1; // Monday = 1
      }
      return true;
    },
    {
      message: "Week start must be a Monday",
      path: ["weekStart"],
    },
  );

// Shift stats schema
export const getShiftStatsSchema = z
  .object({
    memberId: z.string().optional(),
    startDate: z.string().regex(dateRegex, "Invalid date format. Use YYYY-MM-DD").optional(),
    endDate: z.string().regex(dateRegex, "Invalid date format. Use YYYY-MM-DD").optional(),
  })
  .refine(
    (data) => {
      // If both dates provided, start date should be before or equal to end date
      if (data.startDate && data.endDate) {
        return new Date(data.startDate) <= new Date(data.endDate);
      }
      return true;
    },
    {
      message: "Start date must be before or equal to end date",
      path: ["endDate"],
    },
  );

// Bulk operations schema
export const bulkUpdateShiftsSchema = z.object({
  shiftIds: z.array(z.string()).min(1, "At least one shift ID is required").max(50, "Maximum 50 shifts allowed"),
  updates: z
    .object({
      status: shiftStatusSchema.optional(),
      color: z.string().regex(colorRegex, "Invalid color format. Use hex color").optional(),
    })
    .refine(
      (data) => {
        // At least one field must be provided
        return Object.keys(data).length > 0;
      },
      {
        message: "At least one update field is required",
      },
    ),
});

export const bulkDeleteShiftsSchema = z.object({
  shiftIds: z.array(z.string()).min(1, "At least one shift ID is required").max(50, "Maximum 50 shifts allowed"),
  deleteRecurring: z.boolean().optional().default(false), // Whether to delete all recurring instances
});

// Copy shifts schema
export const copyShiftsSchema = z.object({
  sourceDate: z.string().regex(dateRegex, "Invalid date format. Use YYYY-MM-DD"),
  targetDates: z
    .array(z.string().regex(dateRegex, "Invalid date format. Use YYYY-MM-DD"))
    .min(1, "At least one target date is required")
    .max(31, "Maximum 31 dates allowed"),
  memberIds: z
    .array(z.string())
    .min(1, "At least one member ID is required")
    .max(20, "Maximum 20 members allowed")
    .optional(),
  overrideExisting: z.boolean().optional().default(false),
});

// Type exports
export type CreateShiftData = z.infer<typeof createShiftSchema>;
export type CreateRecurringShiftData = z.infer<typeof createRecurringShiftSchema>;
export type UpdateShiftData = z.infer<typeof updateShiftSchema>;
export type BulkUpdateShiftsData = z.infer<typeof bulkUpdateShiftsSchema>;
export type BulkDeleteShiftsData = z.infer<typeof bulkDeleteShiftsSchema>;
export type CopyShiftsData = z.infer<typeof copyShiftsSchema>;
