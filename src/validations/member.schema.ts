import z from "zod";

// Working hours schema
const workingHoursSchema = z.object({
  monday: z
    .object({
      isWorking: z.boolean(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      breaks: z
        .array(
          z.object({
            startTime: z.string(),
            endTime: z.string(),
          }),
        )
        .optional(),
    })
    .optional(),
  tuesday: z
    .object({
      isWorking: z.boolean(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      breaks: z
        .array(
          z.object({
            startTime: z.string(),
            endTime: z.string(),
          }),
        )
        .optional(),
    })
    .optional(),
  wednesday: z
    .object({
      isWorking: z.boolean(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      breaks: z
        .array(
          z.object({
            startTime: z.string(),
            endTime: z.string(),
          }),
        )
        .optional(),
    })
    .optional(),
  thursday: z
    .object({
      isWorking: z.boolean(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      breaks: z
        .array(
          z.object({
            startTime: z.string(),
            endTime: z.string(),
          }),
        )
        .optional(),
    })
    .optional(),
  friday: z
    .object({
      isWorking: z.boolean(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      breaks: z
        .array(
          z.object({
            startTime: z.string(),
            endTime: z.string(),
          }),
        )
        .optional(),
    })
    .optional(),
  saturday: z
    .object({
      isWorking: z.boolean(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      breaks: z
        .array(
          z.object({
            startTime: z.string(),
            endTime: z.string(),
          }),
        )
        .optional(),
    })
    .optional(),
  sunday: z
    .object({
      isWorking: z.boolean(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      breaks: z
        .array(
          z.object({
            startTime: z.string(),
            endTime: z.string(),
          }),
        )
        .optional(),
    })
    .optional(),
});

// Address schema
const addressSchema = z.object({
  street: z.string().min(1).max(200).optional(),
  city: z.string().min(1).max(100).optional(),
  state: z.string().min(1).max(100).optional(),
  zipCode: z.string().min(1).max(20).optional(),
  country: z.string().min(1).max(100).optional(),
});

// Emergency contact schema
const emergencyContactSchema = z.object({
  name: z.string().min(1).max(100),
  relationship: z.string().min(1).max(50),
  phone: z.string().min(10).max(20),
  email: z.string().email().optional(),
});

export const createMemberSchema = z.object({
  body: z.object({
    firstName: z.string().trim().min(1).max(50),
    lastName: z.string().trim().min(1).max(50),
    email: z.email(),
    phone: z.string().min(10).max(20).optional(),
    jobTitle: z.string().trim().min(1).max(100).optional(),
    bio: z.string().trim().max(500).optional(),
    workingHours: workingHoursSchema.optional(),
    commissionRate: z.number().min(0).max(100).optional(),
    hourlyRate: z.number().min(0).optional(),
    dateOfBirth: z.iso.datetime().optional(),
    address: addressSchema.optional(),
    emergencyContact: emergencyContactSchema.optional(),
    startDate: z.iso.datetime().optional(),
    serviceIds: z.array(z.string()).optional(),
  }),
});

export const updateMemberSchema = z.object({
  body: z.object({
    firstName: z.string().trim().min(1).max(50).optional(),
    lastName: z.string().trim().min(1).max(50).optional(),
    email: z.email().optional(),
    phone: z.string().min(10).max(20).optional(),
    profileImage: z.url().optional(),
    jobTitle: z.string().trim().min(1).max(100).optional(),
    bio: z.string().trim().max(500).optional(),
    workingHours: workingHoursSchema.optional(),
    isActive: z.boolean().optional(),
    commissionRate: z.number().min(0).max(100).optional(),
    hourlyRate: z.number().min(0).optional(),
    dateOfBirth: z.iso.datetime().optional(),
    address: addressSchema.optional(),
    emergencyContact: emergencyContactSchema.optional(),
    endDate: z.iso.datetime().optional(),
    serviceIds: z.array(z.string()).optional(),
  }),
});

export const assignServicesSchema = z.object({
  body: z.object({
    serviceIds: z.array(z.string().min(1)),
  }),
});

export const inviteMemberSchema = z.object({
  body: z.object({
    email: z.email(),
    firstName: z.string().trim().min(1).max(50),
    lastName: z.string().trim().min(1).max(50),
    jobTitle: z.string().trim().min(1).max(100).optional(),
    serviceIds: z.array(z.string()).optional(),
  }),
});
