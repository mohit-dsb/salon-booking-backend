import { logger } from "@/utils/logger";
import { prisma } from "@/config/prisma";
import { cacheService } from "./cache.service";
import { handleError } from "@/utils/errorHandler";
import { AppError } from "@/middlewares/error.middleware";
import type { PaginationParams } from "@/utils/pagination";
import { Appointment, AppointmentStatus, Prisma } from "@prisma/client";

export interface CreateAppointmentData {
  clientId?: string; // Optional for walk-in appointments
  memberId: string;
  serviceId: string;
  startTime: string;
  notes?: string;
  internalNotes?: string;
  // Walk-in client fields (used when clientId is not provided)
  walkInClientName?: string;
  walkInClientPhone?: string;
}

export interface UpdateAppointmentData {
  startTime?: string;
  status?: AppointmentStatus;
  notes?: string;
  internalNotes?: string;
  cancellationReason?: string;
  cancelledAt?: string;
  cancelledBy?: string;
}

export interface AppointmentFilters {
  clientId?: string;
  memberId?: string;
  serviceId?: string;
  status?: AppointmentStatus;
  startDate?: string;
  endDate?: string;
  search?: string;
  isWalkIn?: boolean;
}

export interface AppointmentWithDetails extends Appointment {
  client: {
    id: string;
    firstName: string | null; // Nullable for walk-in appointments
    lastName: string | null; // Nullable for walk-in appointments
    email: string | null; // Nullable for walk-in appointments
    phone: string | null;
  } | null; // Entire client can be null for walk-in appointments
  member: {
    id: string;
    username: string;
    email: string;
  };
  service: {
    id: string;
    name: string;
    duration: number;
    price: number;
  };
  bookedByMember: {
    id: string;
    username: string;
  };
}

export interface AvailabilitySlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

export interface WorkingHours {
  start: number; // Hour of day (0-23)
  end: number; // Hour of day (0-23)
  daysOfWeek?: number[]; // 0-6 (Sunday-Saturday)
}

export class AppointmentService {
  private readonly CACHE_TTL = 1800; // 30 minutes
  private readonly CACHE_PREFIX = "appointment";

  private getCacheKey(orgId: string, key: string): string {
    return `${this.CACHE_PREFIX}:${orgId}:${key}`;
  }

  private getAppointmentCacheKey(id: string, orgId: string): string {
    return this.getCacheKey(orgId, `id:${id}`);
  }

  private getAppointmentListCacheKey(orgId: string, filters: string): string {
    return this.getCacheKey(orgId, `list:${filters}`);
  }

  private getAvailabilityCacheKey(orgId: string, memberId: string, date: string): string {
    return this.getCacheKey(orgId, `availability:${memberId}:${date}`);
  }

  private async invalidateAppointmentCache(orgId: string): Promise<void> {
    const pattern = this.getCacheKey(orgId, "*");
    await cacheService.invalidatePattern(pattern);
  }

  private async validateOrgMembership(orgId: string): Promise<void> {
    if (!orgId || orgId.trim() === "") {
      throw new AppError("Organization ID is required", 400);
    }
  }

  private parseDateTime(dateTimeString: string): Date {
    const date = new Date(dateTimeString);
    if (isNaN(date.getTime())) {
      throw new AppError("Invalid date format", 400);
    }
    return date;
  }

  private calculateEndTime(startTime: Date, durationMinutes: number): Date {
    return new Date(startTime.getTime() + durationMinutes * 60000);
  }

  // Create a new appointment (handles both regular and walk-in appointments)
  public async createAppointment(
    orgId: string,
    data: CreateAppointmentData,
    bookedBy: string,
  ): Promise<AppointmentWithDetails> {
    await this.validateOrgMembership(orgId);

    const startTime = this.parseDateTime(data.startTime);

    // Validate that the member and service exist and belong to the organization
    const [member, service] = await Promise.all([
      prisma.member.findFirst({ where: { id: data.memberId, orgId } }),
      prisma.service.findFirst({ where: { id: data.serviceId, orgId } }),
    ]);

    if (!member) {
      throw new AppError("Member not found", 404);
    }

    if (!service) {
      throw new AppError("Service not found", 404);
    }

    // Validate client and member service in parallel
    const [client, memberService] = await Promise.all([
      data.clientId ? prisma.client.findFirst({ where: { id: data.clientId, orgId } }) : Promise.resolve(null),
      prisma.memberService.findFirst({
        where: {
          memberId: data.memberId,
          serviceId: data.serviceId,
          orgId,
        },
      }),
    ]);

    // If clientId was provided, validate the client exists
    if (data.clientId && !client) {
      throw new AppError("Client not found", 404);
    }

    if (!memberService) {
      throw new AppError("This member does not provide the selected service", 400);
    }

    const endTime = this.calculateEndTime(startTime, service.duration);

    // Check for scheduling conflicts
    await this.checkSchedulingConflicts(data.memberId, startTime, endTime, orgId);

    // Generate walk-in client name if it's a walk-in appointment
    const walkInClientName = !data.clientId ? data.walkInClientName || (await this.generateWalkInName(orgId)) : null;

    try {
      const appointment = await prisma.appointment.create({
        data: {
          clientId: data.clientId, // Will be undefined for walk-in appointments
          memberId: data.memberId,
          serviceId: data.serviceId,
          orgId,
          startTime,
          endTime,
          duration: service.duration,
          price: service.price,
          notes: data.notes,
          internalNotes: data.internalNotes,
          bookedBy,
          walkInClientName,
          walkInClientPhone: data.walkInClientPhone,
        },
        include: {
          client: data.clientId
            ? {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true,
                },
              }
            : false,
          member: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
          service: {
            select: {
              id: true,
              name: true,
              duration: true,
              price: true,
            },
          },
          bookedByMember: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });

      // Invalidate relevant caches
      await this.invalidateAppointmentCache(orgId);

      logger.info("Appointment created successfully", {
        appointmentId: appointment.id,
        clientId: data.clientId || "walk-in",
        memberId: data.memberId,
        startTime: startTime.toISOString(),
        orgId,
      });

      return appointment as AppointmentWithDetails;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      handleError(error, "createAppointment", "Failed to create appointment");
    }
  }

  // Generate unique walk-in name
  private async generateWalkInName(orgId: string): Promise<string> {
    // Get the current date to generate daily sequence
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const count = await prisma.appointment.count({
      where: {
        orgId,
        clientId: { equals: null }, // Walk-in appointments
        createdAt: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    return `Walk-in #${count + 1}`;
  }

  // Check for scheduling conflicts
  private async checkSchedulingConflicts(
    memberId: string,
    startTime: Date,
    endTime: Date,
    orgId: string,
    excludeAppointmentId?: string,
  ): Promise<void> {
    const conflictingAppointments = await prisma.appointment.findMany({
      where: {
        memberId,
        orgId,
        id: excludeAppointmentId ? { not: excludeAppointmentId } : undefined,
        status: {
          in: ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"],
        },
        OR: [
          // New appointment starts during existing appointment
          {
            AND: [{ startTime: { lte: startTime } }, { endTime: { gt: startTime } }],
          },
          // New appointment ends during existing appointment
          {
            AND: [{ startTime: { lt: endTime } }, { endTime: { gte: endTime } }],
          },
          // New appointment completely contains existing appointment
          {
            AND: [{ startTime: { gte: startTime } }, { endTime: { lte: endTime } }],
          },
        ],
      },
    });

    if (conflictingAppointments.length > 0) {
      throw new AppError(
        `Member is not available at this time. Conflicting appointment at ${conflictingAppointments[0].startTime.toLocaleString()}`,
        409,
      );
    }
  }

  // Get appointment by ID
  public async getAppointmentById(id: string, orgId: string): Promise<AppointmentWithDetails> {
    await this.validateOrgMembership(orgId);

    if (!id || id.trim() === "") {
      throw new AppError("Appointment ID is required", 400);
    }

    const cacheKey = this.getAppointmentCacheKey(id, orgId);
    const cached = await cacheService.get<AppointmentWithDetails>(cacheKey);

    if (cached) {
      return cached;
    }

    const appointment = await prisma.appointment.findFirst({
      where: { id, orgId },
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        member: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        service: {
          select: {
            id: true,
            name: true,
            duration: true,
            price: true,
          },
        },
        bookedByMember: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    if (!appointment) {
      throw new AppError("Appointment not found", 404);
    }

    // Cache the result
    await cacheService.set(cacheKey, appointment, this.CACHE_TTL);

    return appointment;
  }

  // Get all appointments with pagination and filters
  public async getAllAppointments(
    orgId: string,
    pagination: PaginationParams,
    filters: AppointmentFilters = {},
  ): Promise<{
    appointments: AppointmentWithDetails[];
    pagination: {
      total: number;
      pages: number;
      current: number;
      limit: number;
    };
  }> {
    await this.validateOrgMembership(orgId);

    const { page, limit } = pagination;
    const offset = (page - 1) * limit;

    // Create cache key based on filters
    const filterKey = JSON.stringify({ ...filters, page, limit });
    const cacheKey = this.getAppointmentListCacheKey(orgId, filterKey);

    // Define result type
    type AppointmentListResult = {
      appointments: AppointmentWithDetails[];
      pagination: {
        total: number;
        pages: number;
        current: number;
        limit: number;
      };
    };

    // Check cache first
    const cached = await cacheService.get<AppointmentListResult>(cacheKey);
    if (cached) {
      return cached;
    }

    // Build where clause
    const where: Prisma.AppointmentWhereInput = { orgId };

    if (filters.clientId) {
      where.clientId = filters.clientId;
    }

    if (filters.memberId) {
      where.memberId = filters.memberId;
    }

    if (filters.serviceId) {
      where.serviceId = filters.serviceId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.isWalkIn !== undefined) {
      // Walk-in appointments have no clientId
      if (filters.isWalkIn) {
        where.clientId = { equals: null };
      } else {
        where.clientId = { not: null };
      }
    }

    if (filters.startDate || filters.endDate) {
      where.startTime = {};
      if (filters.startDate) {
        where.startTime.gte = this.parseDateTime(filters.startDate);
      }
      if (filters.endDate) {
        where.startTime.lte = this.parseDateTime(filters.endDate);
      }
    }

    if (filters.search) {
      where.OR = [
        {
          client: {
            firstName: {
              contains: filters.search,
              mode: "insensitive",
            },
          },
        },
        {
          client: {
            lastName: {
              contains: filters.search,
              mode: "insensitive",
            },
          },
        },
        {
          notes: {
            contains: filters.search,
            mode: "insensitive",
          },
        },
      ];
    }

    const [appointments, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { startTime: "asc" },
        include: {
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          member: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
          service: {
            select: {
              id: true,
              name: true,
              duration: true,
              price: true,
            },
          },
          bookedByMember: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      }),
      prisma.appointment.count({ where }),
    ]);

    const result = {
      appointments,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        current: page,
        limit,
      },
    };

    // Cache the result
    await cacheService.set(cacheKey, result, this.CACHE_TTL);

    return result;
  }

  // Update appointment
  public async updateAppointment(
    id: string,
    orgId: string,
    data: UpdateAppointmentData,
  ): Promise<AppointmentWithDetails> {
    await this.validateOrgMembership(orgId);

    const existingAppointment = await this.getAppointmentById(id, orgId);

    // Don't allow updates to completed, cancelled, or no-show appointments unless it's just adding notes
    if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(existingAppointment.status) && (data.startTime || data.status)) {
      throw new AppError("Cannot modify completed, cancelled, or no-show appointments", 400);
    }

    try {
      const updateData: Prisma.AppointmentUpdateInput = {};

      if (data.startTime) {
        const newStartTime = this.parseDateTime(data.startTime);
        const newEndTime = this.calculateEndTime(newStartTime, existingAppointment.duration);

        // Check for conflicts when rescheduling
        await this.checkSchedulingConflicts(existingAppointment.memberId, newStartTime, newEndTime, orgId, id);

        updateData.startTime = newStartTime;
        updateData.endTime = newEndTime;
      }

      if (data.status) {
        updateData.status = data.status;
      }

      if (data.notes !== undefined) {
        updateData.notes = data.notes;
      }

      if (data.internalNotes !== undefined) {
        updateData.internalNotes = data.internalNotes;
      }

      if (data.cancellationReason !== undefined) {
        updateData.cancellationReason = data.cancellationReason;
        updateData.cancelledAt = new Date().toISOString();
      }

      const updatedAppointment = await prisma.appointment.update({
        where: { id },
        data: updateData,
        include: {
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          member: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
          service: {
            select: {
              id: true,
              name: true,
              duration: true,
              price: true,
            },
          },
          bookedByMember: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });

      // Invalidate caches
      await this.invalidateAppointmentCache(orgId);

      logger.info("Appointment updated successfully", { appointmentId: id, orgId });

      return updatedAppointment;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      handleError(error, "updateAppointment", "Failed to update appointment");
    }
  }

  // Cancel appointment
  public async cancelAppointment(
    id: string,
    orgId: string,
    reason: string,
    cancelledBy: string,
  ): Promise<AppointmentWithDetails> {
    const updateData: UpdateAppointmentData = {
      status: "CANCELLED",
      cancellationReason: reason,
      cancelledBy,
      cancelledAt: new Date().toISOString(),
    };

    return this.updateAppointment(id, orgId, updateData);
  }

  // Reschedule appointment
  public async rescheduleAppointment(
    id: string,
    orgId: string,
    newStartTime: string,
    notes?: string,
  ): Promise<AppointmentWithDetails> {
    const updateData: UpdateAppointmentData = {
      startTime: newStartTime,
    };

    if (notes) {
      updateData.notes = notes;
    }

    return this.updateAppointment(id, orgId, updateData);
  }

  // Check member availability for a specific date
  public async checkMemberAvailability(
    orgId: string,
    memberId: string,
    serviceId: string,
    date: string,
  ): Promise<AvailabilitySlot[]> {
    await this.validateOrgMembership(orgId);

    const cacheKey = this.getAvailabilityCacheKey(orgId, memberId, date);
    const cached = await cacheService.get<AvailabilitySlot[]>(cacheKey);

    if (cached) {
      return cached;
    }

    // Validate member and service
    const [member, service] = await Promise.all([
      prisma.member.findFirst({ where: { id: memberId, orgId } }),
      prisma.service.findFirst({ where: { id: serviceId, orgId } }),
    ]);

    if (!member) {
      throw new AppError("Member not found", 404);
    }

    if (!service) {
      throw new AppError("Service not found", 404);
    }

    // Check if member provides this service
    const memberService = await prisma.memberService.findFirst({
      where: { memberId, serviceId, orgId },
    });

    if (!memberService) {
      throw new AppError("This member does not provide the selected service", 400);
    }

    const workingHours = member.workingHours;

    // Parse and validate working hours
    let memberWorkingHours: WorkingHours;
    try {
      if (!workingHours) {
        // Default working hours: 9 AM to 5 PM
        memberWorkingHours = { start: 9, end: 17 };
      } else {
        memberWorkingHours = workingHours as unknown as WorkingHours;
        // Validate the structure
        if (typeof memberWorkingHours.start !== "number" || typeof memberWorkingHours.end !== "number") {
          memberWorkingHours = { start: 9, end: 17 };
        }
      }
    } catch (_error) {
      // Fallback to default working hours if parsing fails
      memberWorkingHours = { start: 9, end: 17 };
    }

    const requestedDate = new Date(date);
    const slots: AvailabilitySlot[] = [];

    // Generate time slots in 30-minute intervals
    for (let hour = memberWorkingHours.start; hour < memberWorkingHours.end; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const slotStart = new Date(requestedDate);
        slotStart.setHours(hour, minute, 0, 0);

        const slotEnd = new Date(slotStart.getTime() + service.duration * 60000);

        // Don't add slots that would extend beyond working hours
        if (slotEnd.getHours() > memberWorkingHours.end) {
          break;
        }

        slots.push({
          startTime: slotStart.toISOString(),
          endTime: slotEnd.toISOString(),
          available: true, // Will be updated below
        });
      }
    }

    // Get existing appointments for the date
    const dayStart = new Date(requestedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(requestedDate);
    dayEnd.setHours(23, 59, 59, 999);

    const existingAppointments = await prisma.appointment.findMany({
      where: {
        memberId,
        orgId,
        startTime: {
          gte: dayStart,
          lte: dayEnd,
        },
        status: {
          in: ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"],
        },
      },
    });

    // Mark unavailable slots
    slots.forEach((slot) => {
      const slotStart = new Date(slot.startTime);
      const slotEnd = new Date(slot.endTime);

      const hasConflict = existingAppointments.some((appointment) => {
        return (
          (slotStart >= appointment.startTime && slotStart < appointment.endTime) ||
          (slotEnd > appointment.startTime && slotEnd <= appointment.endTime) ||
          (slotStart <= appointment.startTime && slotEnd >= appointment.endTime)
        );
      });

      slot.available = !hasConflict;
    });

    // Cache the result for 15 minutes
    await cacheService.set(cacheKey, slots, 900);

    return slots;
  }

  // Get upcoming appointments for a member
  public async getMemberUpcomingAppointments(
    orgId: string,
    memberId: string,
    days = 7,
  ): Promise<AppointmentWithDetails[]> {
    await this.validateOrgMembership(orgId);

    const now = new Date();
    const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const appointments = await prisma.appointment.findMany({
      where: {
        memberId,
        orgId,
        startTime: {
          gte: now,
          lte: futureDate,
        },
        status: {
          in: ["SCHEDULED", "CONFIRMED"],
        },
      },
      orderBy: { startTime: "asc" },
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        member: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        service: {
          select: {
            id: true,
            name: true,
            duration: true,
            price: true,
          },
        },
        bookedByMember: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    return appointments;
  }

  // Get client's appointment history
  public async getClientAppointmentHistory(orgId: string, clientId: string): Promise<AppointmentWithDetails[]> {
    await this.validateOrgMembership(orgId);

    const appointments = await prisma.appointment.findMany({
      where: {
        clientId,
        orgId,
      },
      orderBy: { startTime: "desc" },
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        member: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        service: {
          select: {
            id: true,
            name: true,
            duration: true,
            price: true,
          },
        },
        bookedByMember: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    return appointments;
  }

  // Convert walk-in appointment to regular appointment with client
  public async convertWalkInAppointment(
    appointmentId: string,
    orgId: string,
    clientId: string,
  ): Promise<AppointmentWithDetails> {
    await this.validateOrgMembership(orgId);

    // Validate the appointment exists and is a walk-in
    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, orgId, clientId: null },
    });

    if (!appointment) {
      throw new AppError("Walk-in appointment not found", 404);
    }

    // Validate the client exists
    const client = await prisma.client.findFirst({
      where: { id: clientId, orgId },
    });

    if (!client) {
      throw new AppError("Client not found", 404);
    }

    try {
      const updatedAppointment = await prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          clientId,
          walkInClientName: null,
          walkInClientPhone: null,
        },
        include: {
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          member: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
          service: {
            select: {
              id: true,
              name: true,
              duration: true,
              price: true,
            },
          },
          bookedByMember: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });

      // Invalidate relevant caches
      await this.invalidateAppointmentCache(orgId);

      logger.info("Walk-in appointment converted to regular appointment", {
        appointmentId,
        clientId,
        orgId,
      });

      return updatedAppointment as AppointmentWithDetails;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      handleError(error, "convertWalkInAppointment", "Failed to convert walk-in appointment");
    }
  }

  // Analytics and Reporting Methods

  /**
   * Get appointment summary analytics with trends and patterns
   */
  async getAppointmentSummary(orgId: string, params: Record<string, unknown>) {
    try {
      const {
        startDate,
        endDate,
        period,
        groupBy = "day",
        memberId,
        serviceId,
        categoryId,
        includeMetrics = [],
      } = params;

      // Calculate date range based on period or custom dates
      const dateRange = this.calculateDateRange(
        period as string | undefined,
        startDate as string | undefined,
        endDate as string | undefined,
      );

      // Base query conditions
      const whereConditions: Prisma.AppointmentWhereInput = {
        orgId,
        startTime: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
        ...(memberId && typeof memberId === "string" ? { memberId } : {}),
        ...(serviceId && typeof serviceId === "string" ? { serviceId } : {}),
        ...(categoryId && typeof categoryId === "string" ? { service: { categoryId } } : {}),
      };

      // Get basic counts
      const [
        totalAppointments,
        scheduledAppointments,
        confirmedAppointments,
        completedAppointments,
        cancelledAppointments,
        noShowAppointments,
        walkInAppointments,
      ] = await Promise.all([
        prisma.appointment.count({ where: whereConditions }),
        prisma.appointment.count({ where: { ...whereConditions, status: "SCHEDULED" } }),
        prisma.appointment.count({ where: { ...whereConditions, status: "CONFIRMED" } }),
        prisma.appointment.count({ where: { ...whereConditions, status: "COMPLETED" } }),
        prisma.appointment.count({ where: { ...whereConditions, status: "CANCELLED" } }),
        prisma.appointment.count({ where: { ...whereConditions, status: "NO_SHOW" } }),
        prisma.appointment.count({ where: { ...whereConditions, clientId: null } }),
      ]);

      // Calculate revenue if requested
      let totalRevenue = 0;
      if (Array.isArray(includeMetrics) && includeMetrics.includes("revenue")) {
        const revenueResult = await prisma.appointment.aggregate({
          where: { ...whereConditions, status: "COMPLETED" },
          _sum: { price: true },
        });
        totalRevenue = revenueResult._sum.price || 0;
      }

      // Calculate rates
      const cancellationRate = totalAppointments > 0 ? (cancelledAppointments / totalAppointments) * 100 : 0;
      const noShowRate = totalAppointments > 0 ? (noShowAppointments / totalAppointments) * 100 : 0;
      const completionRate = totalAppointments > 0 ? (completedAppointments / totalAppointments) * 100 : 0;
      const walkInRate = totalAppointments > 0 ? (walkInAppointments / totalAppointments) * 100 : 0;

      // Get trend data based on groupBy
      const trendData = await this.getAppointmentTrends(whereConditions, groupBy as string, dateRange);

      // Get top performing members and services
      const [topMembers, topServices] = await Promise.all([
        this.getTopPerformingMembers(whereConditions, 5),
        this.getTopPerformingServices(whereConditions, 5),
      ]);

      return {
        period: {
          start: dateRange.start,
          end: dateRange.end,
          label: this.getPeriodLabel(
            period as string | undefined,
            startDate as string | undefined,
            endDate as string | undefined,
          ),
        },
        overview: {
          totalAppointments,
          scheduledAppointments,
          confirmedAppointments,
          completedAppointments,
          cancelledAppointments,
          noShowAppointments,
          walkInAppointments,
          totalRevenue,
        },
        rates: {
          cancellationRate: Math.round(cancellationRate * 100) / 100,
          noShowRate: Math.round(noShowRate * 100) / 100,
          completionRate: Math.round(completionRate * 100) / 100,
          walkInRate: Math.round(walkInRate * 100) / 100,
        },
        trends: trendData,
        topPerformers: {
          members: topMembers,
          services: topServices,
        },
        filters: {
          memberId,
          serviceId,
          categoryId,
          groupBy,
          includeMetrics,
        },
      };
    } catch (error) {
      handleError(error, "getAppointmentSummary", "Failed to get appointment summary");
    }
  }

  /**
   * Get detailed appointment list for analytics
   */
  async getAppointmentAnalyticsList(orgId: string, params: Record<string, unknown>, pagination: PaginationParams) {
    try {
      const {
        startDate,
        endDate,
        period,
        status,
        isWalkIn,
        sortBy = "startTime",
        sortOrder = "desc",
        includeDetails = [],
        search,
        memberId,
        serviceId,
        categoryId,
      } = params;

      // Calculate date range
      const dateRange = this.calculateDateRange(
        period as string | undefined,
        startDate as string | undefined,
        endDate as string | undefined,
      );

      // Build where conditions
      const whereConditions: Prisma.AppointmentWhereInput = {
        orgId,
        startTime: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
        ...(Array.isArray(status) && status.length > 0 ? { status: { in: status as AppointmentStatus[] } } : {}),
        ...(isWalkIn === "true" ? { clientId: null } : {}),
        ...(isWalkIn === "false" ? { clientId: { not: null } } : {}),
        ...(typeof memberId === "string" ? { memberId } : {}),
        ...(typeof serviceId === "string" ? { serviceId } : {}),
        ...(typeof categoryId === "string" ? { service: { categoryId } } : {}),
        ...(typeof search === "string"
          ? {
              OR: [
                { walkInClientName: { contains: search, mode: "insensitive" } },
                { client: { firstName: { contains: search, mode: "insensitive" } } },
                { client: { lastName: { contains: search, mode: "insensitive" } } },
                { member: { username: { contains: search, mode: "insensitive" } } },
                { service: { name: { contains: search, mode: "insensitive" } } },
                { notes: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      };

      // Build include object based on includeDetails
      const include: Prisma.AppointmentInclude = {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        member: {
          select: {
            id: true,
            username: true,
          },
        },
        service: {
          select: {
            id: true,
            name: true,
            duration: true,
            price: true,
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        bookedByMember: {
          select: {
            id: true,
            username: true,
          },
        },
      };

      // Build orderBy based on sortBy and sortOrder
      const orderBy: Prisma.AppointmentOrderByWithRelationInput = {};
      if (sortBy === "member") {
        orderBy.member = { username: sortOrder as "asc" | "desc" };
      } else if (sortBy === "service") {
        orderBy.service = { name: sortOrder as "asc" | "desc" };
      } else if (sortBy === "revenue") {
        orderBy.price = sortOrder as "asc" | "desc";
      } else {
        orderBy[sortBy as keyof Prisma.AppointmentOrderByWithRelationInput] = sortOrder as "asc" | "desc";
      }

      // Get total count
      const total = await prisma.appointment.count({ where: whereConditions });

      // Get appointments with pagination
      const appointments = await prisma.appointment.findMany({
        where: whereConditions,
        include,
        orderBy,
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      });

      // Calculate summary statistics
      const summaryStats = await this.calculateListSummaryStats(whereConditions);

      return {
        data: appointments,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          totalPages: Math.ceil(total / pagination.limit),
        },
        summary: summaryStats,
        filters: {
          dateRange,
          status,
          isWalkIn,
          search,
          memberId,
          serviceId,
          categoryId,
          sortBy,
          sortOrder,
          includeDetails,
        },
      };
    } catch (error) {
      handleError(error, "getAppointmentAnalyticsList", "Failed to get appointment analytics list");
    }
  }

  /**
   * Get cancellations and no-shows analytics
   */
  async getCancellationNoShowAnalytics(orgId: string, params: Record<string, unknown>) {
    try {
      const {
        startDate,
        endDate,
        period,
        analysisType = "both",
        groupBy = "day",
        includeReasons = true,
        minCancellationRate,
        memberId,
        serviceId,
        categoryId,
      } = params;

      // Calculate date range
      const dateRange = this.calculateDateRange(
        period as string | undefined,
        startDate as string | undefined,
        endDate as string | undefined,
      );

      // Base query conditions
      const baseWhere: Prisma.AppointmentWhereInput = {
        orgId,
        startTime: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
        ...(typeof memberId === "string" ? { memberId } : {}),
        ...(typeof serviceId === "string" ? { serviceId } : {}),
        ...(typeof categoryId === "string" ? { service: { categoryId } } : {}),
      };

      // Status filter based on analysis type
      const statusFilter: AppointmentStatus[] = [];
      if (analysisType === "cancellations" || analysisType === "both") {
        statusFilter.push("CANCELLED");
      }
      if (analysisType === "no_shows" || analysisType === "both") {
        statusFilter.push("NO_SHOW");
      }

      const whereConditions = {
        ...baseWhere,
        status: { in: statusFilter },
      };

      // Get total counts
      const [totalAppointments, cancelledAppointments, noShowAppointments] = await Promise.all([
        prisma.appointment.count({ where: baseWhere }),
        prisma.appointment.count({ where: { ...baseWhere, status: "CANCELLED" } }),
        prisma.appointment.count({ where: { ...baseWhere, status: "NO_SHOW" } }),
      ]);

      // Calculate rates
      const cancellationRate = totalAppointments > 0 ? (cancelledAppointments / totalAppointments) * 100 : 0;
      const noShowRate = totalAppointments > 0 ? (noShowAppointments / totalAppointments) * 100 : 0;

      // Get trend data
      const trendData = await this.getCancellationTrends(baseWhere, groupBy as string, dateRange, statusFilter);

      // Get cancellation reasons if requested
      let cancellationReasons: Array<{ reason: string | null; count: number }> = [];
      if (includeReasons) {
        cancellationReasons = await this.getCancellationReasons(whereConditions);
      }

      // Get member and service analysis
      const [memberAnalysis, serviceAnalysis] = await Promise.all([
        this.getMemberCancellationAnalysis(baseWhere, statusFilter, minCancellationRate as number | undefined),
        this.getServiceCancellationAnalysis(baseWhere, statusFilter, minCancellationRate as number | undefined),
      ]);

      // Calculate revenue impact
      const revenueImpact = await this.calculateCancellationRevenueImpact(whereConditions);

      return {
        period: {
          start: dateRange.start,
          end: dateRange.end,
          label: this.getPeriodLabel(
            period as string | undefined,
            startDate as string | undefined,
            endDate as string | undefined,
          ),
        },
        overview: {
          totalAppointments,
          cancelledAppointments,
          noShowAppointments,
          cancellationRate: Math.round(cancellationRate * 100) / 100,
          noShowRate: Math.round(noShowRate * 100) / 100,
        },
        trends: trendData,
        reasons: cancellationReasons,
        analysis: {
          byMember: memberAnalysis,
          byService: serviceAnalysis,
        },
        revenueImpact,
        filters: {
          analysisType,
          groupBy,
          includeReasons,
          minCancellationRate,
          memberId,
          serviceId,
          categoryId,
        },
      };
    } catch (error) {
      handleError(error, "getCancellationNoShowAnalytics", "Failed to get cancellation and no-show analytics");
    }
  }

  // Helper methods for analytics

  private calculateDateRange(period?: string, startDate?: string, endDate?: string) {
    const now = new Date();
    let start: Date;
    let end: Date;

    if (period) {
      switch (period) {
        case "today":
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
          break;
        case "yesterday": {
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          start = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
          end = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59);
          break;
        }
        case "this_week": {
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - now.getDay());
          start = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate());
          end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
          break;
        }
        case "last_week": {
          const lastWeekStart = new Date(now);
          lastWeekStart.setDate(now.getDate() - now.getDay() - 7);
          const lastWeekEnd = new Date(lastWeekStart);
          lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
          start = new Date(lastWeekStart.getFullYear(), lastWeekStart.getMonth(), lastWeekStart.getDate());
          end = new Date(lastWeekEnd.getFullYear(), lastWeekEnd.getMonth(), lastWeekEnd.getDate(), 23, 59, 59);
          break;
        }
        case "this_month":
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
          break;
        case "last_month":
          start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
          break;
        case "this_year":
          start = new Date(now.getFullYear(), 0, 1);
          end = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
          break;
        case "last_year":
          start = new Date(now.getFullYear() - 1, 0, 1);
          end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
          break;
        default:
          // Default to last 30 days
          start = new Date(now);
          start.setDate(start.getDate() - 30);
          end = now;
      }
    } else {
      // Use custom dates or default to last 30 days
      start = startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      end = endDate ? new Date(endDate) : now;
    }

    return { start, end };
  }

  private getPeriodLabel(period?: string, startDate?: string, endDate?: string): string {
    if (period) {
      const labels = {
        today: "Today",
        yesterday: "Yesterday",
        this_week: "This Week",
        last_week: "Last Week",
        this_month: "This Month",
        last_month: "Last Month",
        this_year: "This Year",
        last_year: "Last Year",
      };
      return labels[period as keyof typeof labels] || "Custom Period";
    }

    if (startDate && endDate) {
      return `${startDate} to ${endDate}`;
    }

    return "Last 30 Days";
  }

  private async getAppointmentTrends(
    whereConditions: Prisma.AppointmentWhereInput,
    groupBy: string,
    _dateRange: { start: Date; end: Date },
  ) {
    // This is a simplified version. In production, you'd want to use more sophisticated aggregation
    // For MongoDB, you might need to use raw queries or aggregation pipelines
    const appointments = await prisma.appointment.findMany({
      where: whereConditions,
      select: {
        startTime: true,
        status: true,
        price: true,
      },
    });

    // Group appointments by the specified period
    const trends = this.groupAppointmentsByPeriod(appointments, groupBy);
    return trends;
  }

  private async getTopPerformingMembers(whereConditions: Prisma.AppointmentWhereInput, limit: number) {
    const members = await prisma.appointment.groupBy({
      by: ["memberId"],
      where: { ...whereConditions, status: "COMPLETED" },
      _count: { id: true },
      _sum: { price: true },
      orderBy: { _count: { id: "desc" } },
      take: limit,
    });

    // Get member details
    const memberDetails = await Promise.all(
      members.map(async (member) => {
        const memberInfo = await prisma.member.findUnique({
          where: { id: member.memberId },
          select: { id: true, username: true, email: true },
        });
        return {
          member: memberInfo,
          appointmentCount: member._count.id,
          totalRevenue: member._sum.price || 0,
        };
      }),
    );

    return memberDetails;
  }

  private async getTopPerformingServices(whereConditions: Prisma.AppointmentWhereInput, limit: number) {
    const services = await prisma.appointment.groupBy({
      by: ["serviceId"],
      where: { ...whereConditions, status: "COMPLETED" },
      _count: { id: true },
      _sum: { price: true },
      orderBy: { _count: { id: "desc" } },
      take: limit,
    });

    // Get service details
    const serviceDetails = await Promise.all(
      services.map(async (service) => {
        const serviceInfo = await prisma.service.findUnique({
          where: { id: service.serviceId },
          select: { id: true, name: true, price: true, duration: true },
        });
        return {
          service: serviceInfo,
          appointmentCount: service._count.id,
          totalRevenue: service._sum.price || 0,
        };
      }),
    );

    return serviceDetails;
  }

  private async calculateListSummaryStats(whereConditions: Prisma.AppointmentWhereInput) {
    const [totalRevenue, avgDuration, statusCounts] = await Promise.all([
      prisma.appointment.aggregate({
        where: { ...whereConditions, status: "COMPLETED" },
        _sum: { price: true },
      }),
      prisma.appointment.aggregate({
        where: whereConditions,
        _avg: { duration: true },
      }),
      prisma.appointment.groupBy({
        by: ["status"],
        where: whereConditions,
        _count: { id: true },
      }),
    ]);

    return {
      totalRevenue: totalRevenue._sum.price || 0,
      averageDuration: Math.round(avgDuration._avg.duration || 0),
      statusBreakdown: statusCounts.reduce(
        (acc, item) => {
          acc[item.status] = item._count.id;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };
  }

  private async getCancellationTrends(
    baseWhere: Prisma.AppointmentWhereInput,
    groupBy: string,
    _dateRange: { start: Date; end: Date },
    statusFilter: AppointmentStatus[],
  ) {
    const appointments = await prisma.appointment.findMany({
      where: {
        ...baseWhere,
        status: { in: statusFilter },
      },
      select: {
        startTime: true,
        status: true,
        cancellationReason: true,
      },
    });

    return this.groupAppointmentsByPeriod(appointments, groupBy);
  }

  private async getCancellationReasons(whereConditions: Prisma.AppointmentWhereInput) {
    const reasons = await prisma.appointment.groupBy({
      by: ["cancellationReason"],
      where: {
        ...whereConditions,
        cancellationReason: { not: null },
      },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });

    return reasons.map((reason) => ({
      reason: reason.cancellationReason,
      count: reason._count.id,
    }));
  }

  private async getMemberCancellationAnalysis(
    baseWhere: Prisma.AppointmentWhereInput,
    statusFilter: AppointmentStatus[],
    minCancellationRate?: number,
  ) {
    const memberStats = await prisma.appointment.groupBy({
      by: ["memberId"],
      where: baseWhere,
      _count: { id: true },
    });

    const memberCancellations = await prisma.appointment.groupBy({
      by: ["memberId"],
      where: {
        ...baseWhere,
        status: { in: statusFilter },
      },
      _count: { id: true },
    });

    const analysis = memberStats.map((stat) => {
      const cancellationRecord = memberCancellations.find((c) => c.memberId === stat.memberId);
      const cancellations = cancellationRecord?._count?.id || 0;
      const rate = (cancellations / stat._count.id) * 100;

      return {
        memberId: stat.memberId,
        totalAppointments: stat._count.id,
        cancellations,
        cancellationRate: Math.round(rate * 100) / 100,
      };
    });

    // Filter by minimum cancellation rate if specified
    const filteredAnalysis = minCancellationRate
      ? analysis.filter((item) => item.cancellationRate >= minCancellationRate)
      : analysis;

    // Get member details and sort by cancellation rate
    const analysisWithDetails = await Promise.all(
      filteredAnalysis
        .sort((a, b) => b.cancellationRate - a.cancellationRate)
        .slice(0, 10) // Limit to top 10
        .map(async (item) => {
          const member = await prisma.member.findUnique({
            where: { id: item.memberId },
            select: { id: true, username: true, email: true },
          });
          return { ...item, member };
        }),
    );

    return analysisWithDetails;
  }

  private async getServiceCancellationAnalysis(
    baseWhere: Prisma.AppointmentWhereInput,
    statusFilter: AppointmentStatus[],
    minCancellationRate?: number,
  ) {
    const serviceStats = await prisma.appointment.groupBy({
      by: ["serviceId"],
      where: baseWhere,
      _count: { id: true },
    });

    const serviceCancellations = await prisma.appointment.groupBy({
      by: ["serviceId"],
      where: {
        ...baseWhere,
        status: { in: statusFilter },
      },
      _count: { id: true },
    });

    const analysis = serviceStats.map((stat) => {
      const cancellationRecord = serviceCancellations.find((c) => c.serviceId === stat.serviceId);
      const cancellations = cancellationRecord?._count?.id || 0;
      const rate = (cancellations / stat._count.id) * 100;

      return {
        serviceId: stat.serviceId,
        totalAppointments: stat._count.id,
        cancellations,
        cancellationRate: Math.round(rate * 100) / 100,
      };
    });

    // Filter by minimum cancellation rate if specified
    const filteredAnalysis = minCancellationRate
      ? analysis.filter((item) => item.cancellationRate >= minCancellationRate)
      : analysis;

    // Get service details and sort by cancellation rate
    const analysisWithDetails = await Promise.all(
      filteredAnalysis
        .sort((a, b) => b.cancellationRate - a.cancellationRate)
        .slice(0, 10) // Limit to top 10
        .map(async (item) => {
          const service = await prisma.service.findUnique({
            where: { id: item.serviceId },
            select: { id: true, name: true, price: true, duration: true },
          });
          return { ...item, service };
        }),
    );

    return analysisWithDetails;
  }

  private async calculateCancellationRevenueImpact(whereConditions: Prisma.AppointmentWhereInput) {
    const result = await prisma.appointment.aggregate({
      where: whereConditions,
      _sum: { price: true },
      _count: { id: true },
    });

    return {
      lostRevenue: result._sum.price || 0,
      lostAppointments: result._count.id,
    };
  }

  private groupAppointmentsByPeriod(
    appointments: Array<{ startTime: Date; status: AppointmentStatus; price?: number }>,
    groupBy: string,
  ) {
    const groups = new Map();

    appointments.forEach((appointment) => {
      const date = new Date(appointment.startTime);
      let key: string;

      switch (groupBy) {
        case "day":
          key = date.toISOString().split("T")[0];
          break;
        case "week": {
          const startOfWeek = new Date(date);
          startOfWeek.setDate(date.getDate() - date.getDay());
          key = startOfWeek.toISOString().split("T")[0];
          break;
        }
        case "month":
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
          break;
        default:
          key = date.toISOString().split("T")[0];
      }

      if (!groups.has(key)) {
        groups.set(key, {
          date: key,
          total: 0,
          completed: 0,
          cancelled: 0,
          noShow: 0,
          revenue: 0,
        });
      }

      const group = groups.get(key);
      group.total++;

      if (appointment.status === "COMPLETED") {
        group.completed++;
        group.revenue += appointment.price || 0;
      } else if (appointment.status === "CANCELLED") {
        group.cancelled++;
      } else if (appointment.status === "NO_SHOW") {
        group.noShow++;
      }
    });

    return Array.from(groups.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  // Export service instance
}

export const appointmentService = new AppointmentService();
