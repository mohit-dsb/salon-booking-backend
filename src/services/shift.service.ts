import { prisma } from "../config/prisma";
import { cacheService } from "./cache.service";
import { createPaginatedResponse } from "../utils/pagination";
import type { PaginatedResponse } from "../utils/pagination";
import { Prisma } from "@prisma/client";
import { ShiftStatus } from "@prisma/client";
import type {
  CreateShiftData,
  UpdateShiftData,
  ShiftFilters,
  ShiftWithDetails,
  WeeklySchedule,
  DaySchedule,
  ShiftStats,
  RecurringShiftOptions,
  BreakPeriod,
} from "../types/shift.types";

class ShiftService {
  private prisma = prisma;
  private cacheService = cacheService;

  // Helper function to transform JsonValue breaks to BreakPeriod[]
  private parseBreaks(breaks: Prisma.JsonValue | null): BreakPeriod[] | null {
    if (!breaks) return null;
    try {
      if (typeof breaks === "string") {
        return JSON.parse(breaks) as BreakPeriod[];
      }
      return breaks as unknown as BreakPeriod[];
    } catch {
      return null;
    }
  }

  // Helper function to transform shift data with proper typing
  private transformShift(
    shift: Prisma.ShiftGetPayload<{
      include: {
        member: {
          select: {
            id: true;
            username: true;
            email: true;
            profileImage: true;
          };
        };
        createdByMember: {
          select: {
            id: true;
            username: true;
          };
        };
      };
    }>,
  ): ShiftWithDetails {
    return {
      ...shift,
      breaks: this.parseBreaks(shift.breaks),
    };
  }

  // Helper function to serialize BreakPeriod[] to JSON for storage
  private serializeBreaks(breaks: BreakPeriod[] | null): Prisma.InputJsonValue {
    return breaks as unknown as Prisma.InputJsonValue;
  }

  // ==================== SHIFT CRUD OPERATIONS ====================

  async createShift(data: CreateShiftData, createdBy: string, orgId: string) {
    try {
      // Validate shift times
      this.validateShiftTimes(data.startTime, data.endTime);

      // Check for shift conflicts
      await this.checkForConflicts(data.memberId, data.date, data.startTime, data.endTime);

      // Calculate duration
      const duration = this.calculateDuration(data.startTime, data.endTime);

      const shift = await prisma.shift.create({
        data: {
          memberId: data.memberId,
          orgId,
          date: new Date(data.date),
          startTime: data.startTime,
          endTime: data.endTime,
          duration,
          title: data.title,
          description: data.description,
          color: data.color || "#3B82F6",
          breaks: this.serializeBreaks(data.breaks || []),
          isRecurring: data.isRecurring || false,
          recurrencePattern: data.recurrencePattern,
          parentShiftId: data.parentShiftId,
          createdBy,
        },
        include: {
          member: {
            select: {
              id: true,
              username: true,
              email: true,
              profileImage: true,
            },
          },
          createdByMember: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });

      // Create recurring shifts if specified
      if (data.isRecurring && data.recurrencePattern) {
        await this.createRecurringShifts(shift.id, data, createdBy, orgId);
      }

      // Clear relevant caches
      await this.clearShiftCaches(orgId, data.memberId);

      return shift;
    } catch (error) {
      throw new Error(`Failed to create shift: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async createRecurringShift(
    data: CreateShiftData & { recurrenceOptions: RecurringShiftOptions },
    createdBy: string,
    orgId: string,
  ) {
    try {
      const parentShift = await this.createShift({ ...data, isRecurring: true }, createdBy, orgId);

      const recurringShifts = await this.generateRecurringShifts(
        parentShift.id,
        data,
        data.recurrenceOptions,
        createdBy,
        orgId,
      );

      return {
        parentShift,
        recurringShifts,
        totalShiftsCreated: recurringShifts.length + 1,
      };
    } catch (error) {
      throw new Error(`Failed to create recurring shift: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async getShiftById(id: string, orgId: string): Promise<ShiftWithDetails | null> {
    try {
      const shift = await this.prisma.shift.findUnique({
        where: {
          id,
          orgId,
        },
        include: {
          member: {
            select: {
              id: true,
              email: true,
              username: true,
              profileImage: true,
            },
          },
          createdByMember: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });

      if (!shift) return null;

      // Transform breaks from JsonValue to BreakPeriod[]
      const transformedShift: ShiftWithDetails = {
        ...shift,
        breaks: shift.breaks ? (JSON.parse(shift.breaks as string) as BreakPeriod[]) : null,
      };

      await this.cacheService.set(`shift:${id}`, transformedShift, 300);
      return transformedShift;
    } catch (error) {
      throw new Error(`Failed to get shift: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async getShifts(
    filters: ShiftFilters,
    orgId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedResponse<ShiftWithDetails>> {
    try {
      const offset = (page - 1) * limit;
      const where: Prisma.ShiftWhereInput = { orgId };

      // Apply filters
      if (filters.memberId) {
        where.memberId = filters.memberId;
      }

      if (filters.startDate && filters.endDate) {
        where.date = {
          gte: new Date(filters.startDate),
          lte: new Date(filters.endDate),
        };
      } else if (filters.startDate) {
        where.date = { gte: new Date(filters.startDate) };
      } else if (filters.endDate) {
        where.date = { lte: new Date(filters.endDate) };
      }

      if (filters.status) {
        where.status = filters.status;
      }

      if (filters.includeRecurring === false) {
        where.isRecurring = false;
      }

      const [shiftsData, totalCount] = await Promise.all([
        prisma.shift.findMany({
          where,
          include: {
            member: {
              select: {
                id: true,
                username: true,
                email: true,
                profileImage: true,
              },
            },
            createdByMember: {
              select: {
                id: true,
                username: true,
              },
            },
          },
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
          skip: offset,
          take: limit,
        }),
        prisma.shift.count({ where }),
      ]);

      const shifts = shiftsData.map((shift) => this.transformShift(shift));
      return createPaginatedResponse(shifts, totalCount, page, limit);
    } catch (error) {
      throw new Error(`Failed to get shifts: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async getWeeklySchedule(weekStart: string, memberId?: string, orgId?: string): Promise<WeeklySchedule> {
    try {
      const startDate = new Date(weekStart);
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);

      const where: Prisma.ShiftWhereInput = {
        date: {
          gte: startDate,
          lte: endDate,
        },
      };

      if (orgId) where.orgId = orgId;
      if (memberId) where.memberId = memberId;

      const rawShifts = await prisma.shift.findMany({
        where,
        include: {
          member: {
            select: {
              id: true,
              username: true,
              email: true,
              profileImage: true,
            },
          },
          createdByMember: {
            select: {
              id: true,
              username: true,
            },
          },
        },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      });

      const shifts = rawShifts.map((shift) => this.transformShift(shift));

      // Group shifts by day
      const days: DaySchedule[] = [];
      for (let i = 0; i < 7; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        const dateStr = currentDate.toISOString().split("T")[0];

        const dayShifts = shifts.filter((shift) => shift.date.toISOString().split("T")[0] === dateStr);

        const totalHours = dayShifts.reduce((sum, shift) => {
          const shiftDuration = this.calculateDuration(shift.startTime, shift.endTime);
          return sum + shiftDuration;
        }, 0);

        days.push({
          date: dateStr,
          dayName: currentDate.toLocaleDateString("en-US", { weekday: "long" }),
          shifts: dayShifts,
          totalHours,
        });
      }

      return {
        weekStart,
        weekEnd: endDate.toISOString().split("T")[0],
        days,
      };
    } catch (error) {
      throw new Error(`Failed to get weekly schedule: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async updateShift(shiftId: string, data: UpdateShiftData, updatedBy: string, orgId: string) {
    try {
      // Validate new times if provided
      if (data.startTime && data.endTime) {
        this.validateShiftTimes(data.startTime, data.endTime);
      }

      // Check for conflicts if times are being changed
      if (data.date || data.startTime || data.endTime) {
        const existingShift = await this.getShiftById(shiftId, orgId);
        if (!existingShift) {
          throw new Error("Shift not found");
        }

        const checkDate = data.date || existingShift.date.toISOString().split("T")[0];
        const checkStartTime = data.startTime || existingShift.startTime;
        const checkEndTime = data.endTime || existingShift.endTime;

        await this.checkForConflicts(existingShift.memberId, checkDate, checkStartTime, checkEndTime, shiftId);
      }

      const updateData: {
        date?: Date;
        startTime?: string;
        endTime?: string;
        duration?: number;
        title?: string;
        description?: string;
        color?: string;
        status?: ShiftStatus;
        breaks?: Prisma.InputJsonValue;
      } = {};

      // Copy simple fields
      if (data.startTime) updateData.startTime = data.startTime;
      if (data.endTime) updateData.endTime = data.endTime;
      if (data.title !== undefined) updateData.title = data.title;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.color) updateData.color = data.color;
      if (data.status) updateData.status = data.status;
      if (data.breaks) updateData.breaks = this.serializeBreaks(data.breaks);

      // Recalculate duration if times changed
      if (data.startTime && data.endTime) {
        updateData.duration = this.calculateDuration(data.startTime, data.endTime);
      }

      if (data.date) {
        updateData.date = new Date(data.date);
      }

      const shift = await prisma.shift.update({
        where: { id: shiftId, orgId },
        data: updateData,
        include: {
          member: {
            select: {
              id: true,
              username: true,
              email: true,
              profileImage: true,
            },
          },
          createdByMember: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });

      // Clear caches
      await this.clearShiftCaches(orgId, shift.memberId);

      return shift;
    } catch (error) {
      throw new Error(`Failed to update shift: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async deleteShift(shiftId: string, orgId: string) {
    try {
      const shift = await prisma.shift.findFirst({
        where: { id: shiftId, orgId },
        select: { memberId: true, isRecurring: true, parentShiftId: true },
      });

      if (!shift) {
        throw new Error("Shift not found");
      }

      // If deleting a parent recurring shift, delete all child shifts
      if (shift.isRecurring && !shift.parentShiftId) {
        await prisma.shift.deleteMany({
          where: { parentShiftId: shiftId, orgId },
        });
      }

      await prisma.shift.delete({
        where: { id: shiftId, orgId },
      });

      // Clear caches
      await this.clearShiftCaches(orgId, shift.memberId);

      return { success: true };
    } catch (error) {
      throw new Error(`Failed to delete shift: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  // ==================== ANALYTICS & STATS ====================

  async getShiftStats(memberId?: string, startDate?: string, endDate?: string, orgId?: string): Promise<ShiftStats> {
    try {
      const where: Prisma.ShiftWhereInput = {};

      if (orgId) where.orgId = orgId;
      if (memberId) where.memberId = memberId;

      if (startDate && endDate) {
        where.date = {
          gte: new Date(startDate),
          lte: new Date(endDate),
        };
      }

      const shifts = await prisma.shift.findMany({
        where,
        select: {
          status: true,
          startTime: true,
          endTime: true,
        },
      });

      const stats = shifts.reduce(
        (acc, shift) => {
          acc.totalShifts++;
          const duration = this.calculateDuration(shift.startTime, shift.endTime);
          acc.totalHours += duration;

          switch (shift.status) {
            case "SCHEDULED":
              acc.scheduledShifts++;
              break;
            case "CONFIRMED":
              acc.confirmedShifts++;
              break;
            case "COMPLETED":
              acc.completedShifts++;
              break;
            case "CANCELLED":
              acc.cancelledShifts++;
              break;
          }

          return acc;
        },
        {
          totalShifts: 0,
          scheduledShifts: 0,
          confirmedShifts: 0,
          completedShifts: 0,
          cancelledShifts: 0,
          totalHours: 0,
          averageShiftDuration: 0,
        },
      );

      stats.averageShiftDuration = stats.totalShifts > 0 ? stats.totalHours / stats.totalShifts : 0;

      return stats;
    } catch (error) {
      throw new Error(`Failed to get shift stats: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  // ==================== HELPER METHODS ====================

  private validateShiftTimes(startTime: string, endTime: string) {
    const start = this.timeToMinutes(startTime);
    const end = this.timeToMinutes(endTime);

    if (start >= end) {
      throw new Error("Start time must be before end time");
    }

    if (end - start < 30) {
      throw new Error("Shift must be at least 30 minutes long");
    }

    if (end - start > 12 * 60) {
      throw new Error("Shift cannot be longer than 12 hours");
    }
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  }

  private calculateDuration(startTime: string, endTime: string): number {
    const start = this.timeToMinutes(startTime);
    const end = this.timeToMinutes(endTime);
    return (end - start) / 60; // Return hours
  }

  private async checkForConflicts(
    memberId: string,
    date: string,
    startTime: string,
    endTime: string,
    excludeShiftId?: string,
  ) {
    const existingShifts = await prisma.shift.findMany({
      where: {
        memberId,
        date: new Date(date),
        id: excludeShiftId ? { not: excludeShiftId } : undefined,
        status: { not: "CANCELLED" },
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        title: true,
      },
    });

    const newStart = this.timeToMinutes(startTime);
    const newEnd = this.timeToMinutes(endTime);

    for (const shift of existingShifts) {
      const existingStart = this.timeToMinutes(shift.startTime);
      const existingEnd = this.timeToMinutes(shift.endTime);

      // Check for overlap
      if (
        (newStart >= existingStart && newStart < existingEnd) ||
        (newEnd > existingStart && newEnd <= existingEnd) ||
        (newStart <= existingStart && newEnd >= existingEnd)
      ) {
        throw new Error(
          `Shift conflicts with existing shift "${shift.title || "Untitled"}" (${shift.startTime} - ${shift.endTime})`,
        );
      }
    }
  }

  private async createRecurringShifts(
    _parentShiftId: string,
    _data: CreateShiftData,
    _createdBy: string,
    _orgId: string,
  ) {
    // Implementation for creating recurring shifts
    // This would generate shifts based on the recurrence pattern
    // For now, we'll just return an empty array
    return [];
  }

  private async generateRecurringShifts(
    _parentShiftId: string,
    _data: CreateShiftData,
    _options: RecurringShiftOptions,
    _createdBy: string,
    _orgId: string,
  ) {
    // Implementation for generating recurring shifts with custom patterns
    // This would be more complex and handle different recurrence patterns
    return [];
  }

  private async clearShiftCaches(orgId: string, memberId?: string) {
    const cacheKeys = [`shifts:${orgId}`];

    if (memberId) {
      cacheKeys.push(`member-shifts:${memberId}`);
    }

    await Promise.all(cacheKeys.map((key) => cacheService.delete(key)));
  }
}

export const shiftService = new ShiftService();
