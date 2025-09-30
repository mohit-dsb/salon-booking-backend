import { z } from "zod";

// Role enum
export const roleEnum = z.enum(["ADMIN", "MEMBER"]);

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

// Day working hours schema (reusable for all days)
const dayWorkingHoursSchema = z
  .object({
    isWorking: z.boolean(),
    startTime: z
      .string()
      .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:MM)")
      .optional(),
    endTime: z
      .string()
      .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:MM)")
      .optional(),
    breaks: z
      .array(
        z.object({
          startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:MM)"),
          endTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:MM)"),
        }),
      )
      .optional(),
  })
  .optional();

// Working hours schema using the reusable day schema
const workingHoursSchema = z.object({
  monday: dayWorkingHoursSchema,
  tuesday: dayWorkingHoursSchema,
  wednesday: dayWorkingHoursSchema,
  thursday: dayWorkingHoursSchema,
  friday: dayWorkingHoursSchema,
  saturday: dayWorkingHoursSchema,
  sunday: dayWorkingHoursSchema,
});

// Emergency contact schema with better validation
const emergencyContactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name too long"),
  relationship: z.string().trim().min(1, "Relationship is required").max(50, "Relationship too long"),
  phone: z.string().trim().min(10, "Phone number too short").max(20, "Phone number too long"),
  email: z.email("Invalid email format").optional(),
});

// Common member fields for reuse
const baseUserFields = {
  username: z.string().trim().min(1, "Username is required").max(50, "Username too long"),
  email: z.email("Invalid email format"),
  phone: z.string().trim().min(10, "Phone number too short").max(20, "Phone number too long").optional(),
  role: roleEnum.optional().default("MEMBER"),
  country: z.string().trim().min(3, "Country name too short").max(100, "Country name too long").optional(),
};

export const createMemberSchema = z.object({
  ...baseUserFields,
  profileImage: z.url("Invalid image URL").optional(),
  jobTitle: z.string().trim().min(1, "Job title is required").max(100, "Job title too long").optional(),
  bio: z.string().trim().max(500, "Bio too long").optional(),
  workingHours: workingHoursSchema.optional(),
  commissionRate: z
    .number()
    .min(0, "Commission rate must be positive")
    .max(100, "Commission rate cannot exceed 100%")
    .optional(),
  hourlyRate: z.number().min(0, "Hourly rate must be positive").optional(),
  dateOfBirth: z.iso.datetime("Invalid date format").optional(),
  addresses: z.array(addressSchema).optional(),
  emergencyContacts: z.array(emergencyContactSchema).optional(),
  startDate: z.iso.datetime("Invalid date format").optional(),
  endDate: z.iso.datetime("Invalid date format").optional(),
  employementType: z.enum(["EMPLOYEE", "SELF_EMPLOYED"]).optional(),
  serviceIds: z.array(z.string().min(1, "Service ID cannot be empty")).optional(),
  teamMemberId: z.string().trim().optional(),
  notes: z.string().trim().max(250, "Notes too long").optional(),
  allowCalendarBookings: z.boolean().optional().default(true),
  permissionLevel: z.enum(["Low", "Medium", "High", "Basic", "No_access"]).optional().default("Low"),
});

export const updateMemberSchema = z.object({
  username: z.string().trim().min(1, "Username is required").max(50, "Username too long").optional(),
  email: z.email("Invalid email format").optional(),
  phone: z.string().trim().min(10, "Phone number too short").max(20, "Phone number too long").optional(),
  profileImage: z.url("Invalid image URL").optional().or(z.literal("")), // Allow empty string to remove
  role: roleEnum.optional(),
  jobTitle: z.string().trim().min(1, "Job title is required").max(100, "Job title too long").optional(),
  bio: z.string().trim().max(500, "Bio too long").optional(),
  workingHours: workingHoursSchema.optional(),
  isActive: z.boolean().optional(),
  commissionRate: z
    .number()
    .min(0, "Commission rate must be positive")
    .max(100, "Commission rate cannot exceed 100%")
    .optional(),
  hourlyRate: z.number().min(0, "Hourly rate must be positive").optional(),
  dateOfBirth: z.iso.datetime("Invalid date format").optional(),
  addresses: z.array(addressSchema).optional(),
  country: z.string().trim().min(3, "Country name too short").max(100, "Country name too long").optional(),
  emergencyContacts: z.array(emergencyContactSchema).optional(),
  startDate: z.iso.datetime("Invalid date format").optional(),
  endDate: z.iso.datetime("Invalid date format").optional(),
  employementType: z.enum(["EMPLOYEE", "SELF_EMPLOYED"]).optional(),
  serviceIds: z.array(z.string().min(1, "Service ID cannot be empty")).optional(),
  teamMemberId: z.string().trim().optional(),
  notes: z.string().trim().max(250, "Notes too long").optional(),
  allowCalendarBookings: z.boolean().optional(),
  permissionLevel: z.enum(["Low", "Medium", "High", "Basic", "No_access"]).optional(),
});

export const assignServicesSchema = z.object({
  serviceIds: z.array(z.string().min(1, "Service ID cannot be empty")).min(1, "At least one service must be assigned"),
});

export const bulkDeleteMembersSchema = z.object({
  memberIds: z
    .array(z.string().min(1, "Member ID cannot be empty"))
    .min(1, "At least one member ID is required")
    .max(5, "Cannot delete more than 5 members at once"),
});

// Query parameter validation schemas
export const memberQuerySchema = z.object({
  page: z.string().regex(/^\d+$/, "Page must be a number").optional(),
  limit: z.string().regex(/^\d+$/, "Limit must be a number").optional(),
  isActive: z
    .enum(["true", "false"])
    .default("true")
    .transform((val) => val === "true"),
  search: z.string().trim().min(1, "Search query cannot be empty").optional(),
  serviceId: z.string().min(1, "Service ID cannot be empty").optional(),
  sortBy: z.enum(["username", "createdAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// Analytics and Reporting Validation Schemas

// Base analytics parameters used across multiple reports
const analyticsBaseSchema = z.object({
  // Date range filters
  period: z
    .enum(["today", "yesterday", "this_week", "last_week", "this_month", "last_month", "this_year", "last_year"])
    .optional(),
  startDate: z.iso.datetime("Invalid start date format").optional(),
  endDate: z.iso.datetime("Invalid end date format").optional(),

  // Member filters
  memberIds: z.array(z.string().min(1, "Member ID cannot be empty")).optional(),
  departments: z.array(z.string().min(1, "Department cannot be empty")).optional(),
  roles: z.array(roleEnum).optional(),
  isActive: z.boolean().optional(),

  // Pagination and sorting
  page: z.string().regex(/^\d+$/, "Page must be a number").optional(),
  limit: z.string().regex(/^\d+$/, "Limit must be a number").optional(),
  sortBy: z.enum(["name", "totalHours", "earnings", "attendance", "date"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),

  // Export options
  format: z.enum(["json", "csv", "excel"]).optional(),
});

// Attendance Summary Schema
export const attendanceSummarySchema = z.object({
  ...analyticsBaseSchema.shape,

  // Specific filters for attendance
  includeMetrics: z
    .array(
      z.enum([
        "punctuality",
        "absenteeism",
        "lateArrivals",
        "earlyDepartures",
        "noShows",
        "overtimeHours",
        "attendanceRate",
      ]),
    )
    .optional(),

  punctualityThreshold: z.number().min(0, "Punctuality threshold must be positive").optional(), // minutes
  includePatterns: z.boolean().optional(),
  groupBy: z.enum(["day", "week", "month", "member", "department"]).optional(),
});

// 7. Scheduled Shifts Schema
export const scheduledShiftsSchema = z.object({
  ...analyticsBaseSchema.shape,

  // Specific filters for scheduled shifts
  shiftStatus: z
    .array(z.enum(["SCHEDULED", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW", "PENDING"]))
    .optional(),

  shiftTypes: z.array(z.string()).optional(),
  locations: z.array(z.string()).optional(),

  includeDetails: z
    .array(
      z.enum([
        "shiftCoverage",
        "staffingLevels",
        "conflicts",
        "openShifts",
        "swapRequests",
        "overtimeShifts",
        "preferences",
      ]),
    )
    .optional(),

  minimumStaffing: z.number().min(1, "Minimum staffing must be at least 1").optional(),
  includeAvailability: z.boolean().optional(),
  includePreferences: z.boolean().optional(),
  conflictsOnly: z.boolean().optional(),
  groupBy: z.enum(["day", "week", "month", "location", "department", "shift_type"]).optional(),
});

// Export type definitions for use in controllers and services
export type CreateMemberData = z.infer<typeof createMemberSchema>;
export type UpdateMemberData = z.infer<typeof updateMemberSchema>;
export type BulkDeleteMembersData = z.infer<typeof bulkDeleteMembersSchema>;
export type AttendanceSummaryParams = z.infer<typeof attendanceSummarySchema>;
export type ScheduledShiftsParams = z.infer<typeof scheduledShiftsSchema>;
export type MemberQueryParams = z.infer<typeof memberQuerySchema>;
