import z from "zod";

// Role enum
export const roleEnum = z.enum(["ADMIN", "MEMBER"]);

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

// Address schema with better validation
const addressSchema = z.object({
  street: z.string().trim().min(1, "Street is required").max(200, "Street too long").optional(),
  city: z.string().trim().min(1, "City is required").max(100, "City too long").optional(),
  state: z.string().trim().min(1, "State is required").max(100, "State too long").optional(),
  zipCode: z.string().trim().min(3, "Invalid zip code").max(20, "Zip code too long").optional(),
  country: z.string().trim().min(2, "Invalid country").max(100, "Country too long").optional(),
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
};

export const createMemberSchema = z.object({
  ...baseUserFields,
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
  address: addressSchema.optional(),
  emergencyContact: emergencyContactSchema.optional(),
  startDate: z.iso.datetime("Invalid date format").optional(),
  serviceIds: z.array(z.string().min(1, "Service ID cannot be empty")).optional(),
});

export const updateMemberSchema = z.object({
  username: z.string().trim().min(1, "Username is required").max(50, "Username too long").optional(),
  email: z.email("Invalid email format").optional(),
  phone: z.string().trim().min(10, "Phone number too short").max(20, "Phone number too long").optional(),
  profileImage: z.url("Invalid image URL").optional(),
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
  address: addressSchema.optional(),
  emergencyContact: emergencyContactSchema.optional(),
  endDate: z.iso.datetime("Invalid date format").optional(),
  serviceIds: z.array(z.string().min(1, "Service ID cannot be empty")).optional(),
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

export const inviteMemberSchema = z.object({
  ...baseUserFields,
  jobTitle: z.string().trim().min(1, "Job title is required").max(100, "Job title too long").optional(),
  serviceIds: z.array(z.string().min(1, "Service ID cannot be empty")).optional(),
});

// Query parameter validation schemas
export const memberQuerySchema = z.object({
  page: z.string().regex(/^\d+$/, "Page must be a number").optional(),
  limit: z.string().regex(/^\d+$/, "Limit must be a number").optional(),
  isActive: z.enum(["true", "false"]).optional(),
  search: z.string().trim().min(1, "Search query cannot be empty").optional(),
  serviceId: z.string().min(1, "Service ID cannot be empty").optional(),
});

export const searchMemberSchema = z.object({
  q: z.string().trim().min(1, "Search query is required").max(100, "Search query too long"),
  page: z.string().regex(/^\d+$/, "Page must be a number").optional(),
  limit: z.string().regex(/^\d+$/, "Limit must be a number").optional(),
});

export const memberParamsSchema = z.object({
  id: z.string().min(1, "Member ID is required"),
});

export const serviceParamsSchema = z.object({
  serviceId: z.string().min(1, "Service ID is required"),
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

// 1. Working Hours Activity Schema
export const workingHoursActivitySchema = z.object({
  ...analyticsBaseSchema.shape,

  // Specific filters for working hours
  includeDetails: z
    .array(z.enum(["shiftDetails", "breakdowns", "overtime", "regularHours", "plannedVsActual", "timeTracking"]))
    .optional(),

  minHours: z.number().min(0, "Minimum hours must be positive").optional(),
  maxHours: z.number().min(0, "Maximum hours must be positive").optional(),

  shiftStatus: z
    .array(z.enum(["SCHEDULED", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"]))
    .optional(),

  includeBreakdown: z.boolean().optional(),
  groupBy: z.enum(["day", "week", "month", "member"]).optional(),
});

// 2. Break Activity Schema
export const breakActivitySchema = z.object({
  ...analyticsBaseSchema.shape,

  // Specific filters for break activity
  includeDetails: z
    .array(z.enum(["breakDuration", "breakFrequency", "breakTypes", "adherence", "violations"]))
    .optional(),

  breakType: z.array(z.string()).optional(),
  minBreakDuration: z.number().min(0, "Minimum break duration must be positive").optional(),
  maxBreakDuration: z.number().min(0, "Maximum break duration must be positive").optional(),

  adherenceThreshold: z.number().min(0).max(100, "Adherence threshold must be between 0-100").optional(),
  includeViolations: z.boolean().optional(),
  groupBy: z.enum(["day", "week", "month", "member", "breakType"]).optional(),
});

// 3. Attendance Summary Schema
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

// 4. Wages Detail Schema
export const wagesDetailSchema = z.object({
  ...analyticsBaseSchema.shape,

  // Specific filters for detailed wages
  includeComponents: z
    .array(
      z.enum([
        "baseWage",
        "overtime",
        "commission",
        "bonuses",
        "deductions",
        "netPay",
        "grossPay",
        "taxes",
        "benefits",
      ]),
    )
    .optional(),

  minWage: z.number().min(0, "Minimum wage must be positive").optional(),
  maxWage: z.number().min(0, "Maximum wage must be positive").optional(),

  payPeriod: z.enum(["daily", "weekly", "bi-weekly", "monthly"]).optional(),
  includeBreakdown: z.boolean().optional(),
  includeProjections: z.boolean().optional(),
  groupBy: z.enum(["day", "week", "month", "member", "location", "department"]).optional(),
});

// 5. Wages Summary Schema
export const wagesSummarySchema = z.object({
  ...analyticsBaseSchema.shape,

  // Specific filters for wages summary
  includeMetrics: z
    .array(
      z.enum([
        "totalWages",
        "averageWage",
        "medianWage",
        "overtimeCosts",
        "commissionTotal",
        "costPerHour",
        "wageDistribution",
      ]),
    )
    .optional(),

  groupBy: z.enum(["department", "location", "role", "period"]).optional(),
});

// 6. Pay Summary Schema
export const paySummarySchema = z.object({
  ...analyticsBaseSchema.shape,

  // Specific filters for pay summary
  includeComponents: z
    .array(
      z.enum([
        "totalCompensation",
        "baseSalary",
        "hourlyWages",
        "overtime",
        "commissions",
        "bonuses",
        "deductions",
        "benefits",
        "taxes",
        "netPay",
        "grossPay",
      ]),
    )
    .optional(),

  payrollPeriod: z.enum(["current", "last", "year-to-date", "custom"]).optional(),
  includeProjections: z.boolean().optional(),
  includeYearOverYear: z.boolean().optional(),
  includeBenchmarks: z.boolean().optional(),
  groupBy: z.enum(["member", "department", "role", "location", "payType"]).optional(),
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

// 8. Working Hours Summary Schema
export const workingHoursSummarySchema = z.object({
  ...analyticsBaseSchema.shape,

  // Specific filters for working hours summary
  includeMetrics: z
    .array(
      z.enum([
        "totalHours",
        "regularHours",
        "overtimeHours",
        "productivity",
        "utilization",
        "efficiency",
        "laborCost",
        "averageHours",
        "peakHours",
        "idleTime",
      ]),
    )
    .optional(),

  hoursType: z.array(z.enum(["scheduled", "actual", "billable", "productive"])).optional(),
  groupBy: z.enum(["day", "week", "month", "member", "department", "location", "service"]).optional(),
});

// Export type definitions for use in controllers and services
export type CreateMemberData = z.infer<typeof createMemberSchema>;
export type UpdateMemberData = z.infer<typeof updateMemberSchema>;
export type BulkDeleteMembersData = z.infer<typeof bulkDeleteMembersSchema>;
export type WorkingHoursActivityParams = z.infer<typeof workingHoursActivitySchema>;
export type BreakActivityParams = z.infer<typeof breakActivitySchema>;
export type AttendanceSummaryParams = z.infer<typeof attendanceSummarySchema>;
export type WagesDetailParams = z.infer<typeof wagesDetailSchema>;
export type WagesSummaryParams = z.infer<typeof wagesSummarySchema>;
export type PaySummaryParams = z.infer<typeof paySummarySchema>;
export type ScheduledShiftsParams = z.infer<typeof scheduledShiftsSchema>;
export type WorkingHoursSummaryParams = z.infer<typeof workingHoursSummarySchema>;
