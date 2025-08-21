import { logger } from "@/utils/logger";
import { prisma } from "@/config/prisma";
import { cacheService } from "./cache.service";
import { handleError } from "@/utils/errorHandler";
import { AppError } from "@/middlewares/error.middleware";
import type { PaginationParams } from "@/utils/pagination";
import { ClientService } from "./client.service";
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

export class AppointmentService {
  private readonly CACHE_TTL = 1800; // 30 minutes
  private readonly CACHE_PREFIX = "appointment";
  private clientService = new ClientService();

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
  public async cancelAppointment(id: string, orgId: string, reason: string): Promise<AppointmentWithDetails> {
    const updateData: UpdateAppointmentData = {
      status: "CANCELLED",
      cancellationReason: reason,
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

    // For simplicity, assume working hours are 9 AM to 6 PM
    // In a real application, you'd get this from member.workingHours
    const workingHours = {
      start: 9, // 9 AM
      end: 18, // 6 PM
    };

    const requestedDate = new Date(date);
    const slots: AvailabilitySlot[] = [];

    // Generate time slots in 30-minute intervals
    for (let hour = workingHours.start; hour < workingHours.end; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const slotStart = new Date(requestedDate);
        slotStart.setHours(hour, minute, 0, 0);

        const slotEnd = new Date(slotStart.getTime() + service.duration * 60000);

        // Don't add slots that would extend beyond working hours
        if (slotEnd.getHours() > workingHours.end) {
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

  // Export service instance
}

export const appointmentService = new AppointmentService();
