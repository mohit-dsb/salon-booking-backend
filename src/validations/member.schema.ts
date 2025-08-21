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
  body: z.object({
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
  }),
});

export const updateMemberSchema = z.object({
  body: z.object({
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
  }),
});

export const assignServicesSchema = z.object({
  body: z.object({
    serviceIds: z
      .array(z.string().min(1, "Service ID cannot be empty"))
      .min(1, "At least one service must be assigned"),
  }),
});

export const inviteMemberSchema = z.object({
  body: z.object({
    ...baseUserFields,
    jobTitle: z.string().trim().min(1, "Job title is required").max(100, "Job title too long").optional(),
    serviceIds: z.array(z.string().min(1, "Service ID cannot be empty")).optional(),
  }),
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
  params: z.object({
    id: z.string().min(1, "Member ID is required"),
  }),
});

export const serviceParamsSchema = z.object({
  params: z.object({
    serviceId: z.string().min(1, "Service ID is required"),
  }),
});
