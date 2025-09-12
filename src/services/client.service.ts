import { logger } from "@/utils/logger";
import { prisma } from "@/config/prisma";
import { cacheService } from "./cache.service";
import { Client, Prisma } from "@prisma/client";
import { handleError } from "@/utils/errorHandler";
import { AppError } from "@/middlewares/error.middleware";
import type { PaginationParams } from "@/utils/pagination";
import type { ClientListAnalyticsParams, CreateClientData, UpdateClientData } from "@/validations/client.schema";

export interface ClientFilters {
  search?: string;
  isActive?: boolean;
}

export interface ClientWithAppointments extends Client {
  appointments?: Array<{
    id: string;
    status: string;
    startTime: Date;
    service: {
      name: string;
    };
  }>;
}
export class ClientService {
  private readonly CACHE_TTL = 3600; // 1 hour
  private readonly CACHE_PREFIX = "client";

  private getCacheKey(orgId: string, key: string): string {
    return `${this.CACHE_PREFIX}:${orgId}:${key}`;
  }

  private getClientCacheKey(id: string, orgId: string): string {
    return this.getCacheKey(orgId, `id:${id}`);
  }

  private getClientListCacheKey(orgId: string, filters: string): string {
    return this.getCacheKey(orgId, `list:${filters}`);
  }

  private async invalidateClientCache(orgId: string): Promise<void> {
    const pattern = this.getCacheKey(orgId, "*");
    await cacheService.invalidatePattern(pattern);
  }

  private async validateOrgMembership(orgId: string): Promise<void> {
    if (!orgId || orgId.trim() === "") {
      throw new AppError("Organization ID is required", 400);
    }
  }

  private parseDate(dateString: string): Date {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      throw new AppError("Invalid date format", 400);
    }
    return date;
  }

  // Create a new client
  public async createClient(orgId: string, data: CreateClientData): Promise<Client> {
    await this.validateOrgMembership(orgId);

    // Check if client with this email already exists in the organization
    const existingClient = await prisma.client.findUnique({
      where: {
        email_orgId: {
          email: data.email,
          orgId,
        },
      },
    });

    if (existingClient) {
      throw new AppError("A client with this email already exists in your organization", 400);
    }

    try {
      // Parse dates if provided
      const createData: Prisma.ClientCreateInput = {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        orgId,
        gender: data.gender,
      };

      // Basic optional fields
      if (data.phone) createData.phone = data.phone.trim();
      if (data.dateOfBirth) createData.dateOfBirth = this.parseDate(data.dateOfBirth);
      if (data.address) createData.address = data.address as Prisma.InputJsonValue;

      // Additional info fields
      if (data.clientSource === "Walk-in") {
        createData.clientSource = "WALK_IN";
      }
      if (data.referredBy) {
        createData.referredBy = {
          connect: { id: data.referredBy.trim() },
        };
      }
      if (data.preferredLanguage) createData.preferredLanguage = data.preferredLanguage.trim();
      if (data.occupation) createData.occupation = data.occupation.trim();
      if (data.country) createData.country = data.country.trim();

      // Additional contact details
      if (data.additionalEmail) createData.additionalEmail = data.additionalEmail.toLowerCase().trim();
      if (data.additionalPhone) createData.additionalPhone = data.additionalPhone.trim();

      // Notification preferences (with defaults from schema)
      if (data.notifyByEmail !== undefined) createData.notifyByEmail = data.notifyByEmail;
      if (data.notifyBySMS !== undefined) createData.notifyBySMS = data.notifyBySMS;
      if (data.notifyByWhatsapp !== undefined) createData.notifyByWhatsapp = data.notifyByWhatsapp;

      // Marketing preferences (with defaults from schema)
      if (data.allowEmailMarketing !== undefined) createData.allowEmailMarketing = data.allowEmailMarketing;
      if (data.allowSMSMarketing !== undefined) createData.allowSMSMarketing = data.allowSMSMarketing;
      if (data.allowWhatsappMarketing !== undefined) createData.allowWhatsappMarketing = data.allowWhatsappMarketing;

      const client = await prisma.client.create({
        data: createData,
      });

      // Cache the created client
      const clientCacheKey = this.getClientCacheKey(client.id, orgId);
      await cacheService.set(clientCacheKey, client, this.CACHE_TTL);

      // Invalidate list caches
      await this.invalidateClientCache(orgId);

      logger.info("Client created successfully", { clientId: client.id, email: client.email, orgId });

      return client;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      handleError(error, "createClient", "Failed to create client");
    }
  }

  // Get client by ID
  public async getClientById(id: string, orgId: string): Promise<ClientWithAppointments> {
    await this.validateOrgMembership(orgId);

    if (!id || id.trim() === "") {
      throw new AppError("Client ID is required", 400);
    }

    // Check cache first
    const cacheKey = this.getClientCacheKey(id, orgId);
    const cached = await cacheService.get<ClientWithAppointments>(cacheKey);

    if (cached) {
      return cached;
    }

    const client = await prisma.client.findFirst({
      where: { id, orgId },
      include: {
        appointments: {
          orderBy: { startTime: "desc" },
          take: 5, // Last 5 appointments
          include: {
            service: {
              select: { name: true },
            },
          },
        },
      },
    });

    if (!client) {
      throw new AppError("Client not found", 404);
    }

    // Cache the result
    await cacheService.set(cacheKey, client, this.CACHE_TTL);

    return client;
  }

  // Get all clients with pagination and filters
  public async getAllClients(
    orgId: string,
    pagination: PaginationParams,
    filters: ClientFilters = {},
  ): Promise<{
    clients: Client[];
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
    const cacheKey = this.getClientListCacheKey(orgId, filterKey);

    // Define result type
    type ClientListResult = {
      clients: Client[];
      pagination: {
        total: number;
        pages: number;
        current: number;
        limit: number;
      };
    };

    // Check cache first
    const cached = await cacheService.get<ClientListResult>(cacheKey);
    if (cached) {
      return cached;
    }

    // Build where clause
    const where: Prisma.ClientWhereInput = { orgId };

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.search) {
      where.OR = [
        {
          firstName: {
            contains: filters.search,
            mode: "insensitive",
          },
        },
        {
          lastName: {
            contains: filters.search,
            mode: "insensitive",
          },
        },
        {
          email: {
            contains: filters.search,
            mode: "insensitive",
          },
        },
      ];
    }

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.client.count({ where }),
    ]);

    const result = {
      clients,
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

  // Update client
  public async updateClient(id: string, orgId: string, data: UpdateClientData): Promise<Client> {
    await this.validateOrgMembership(orgId);

    const existingClient = await this.getClientById(id, orgId);

    // If email is being updated, check for duplicates
    if (data.email && data.email !== existingClient.email) {
      const duplicateClient = await prisma.client.findUnique({
        where: {
          email_orgId: {
            email: data.email,
            orgId,
          },
        },
      });

      if (duplicateClient) {
        throw new AppError("A client with this email already exists in your organization", 400);
      }
    }

    try {
      // Parse dates properly and handle special fields
      const parsedData = {
        ...data,
        dateOfBirth: data.dateOfBirth ? this.parseDate(data.dateOfBirth) : undefined,
      };

      // Handle clientSource enum conversion
      if (data.clientSource === "Walk-in") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (parsedData as any).clientSource = "WALK_IN";
      }

      // Remove undefined values
      const cleanData = Object.fromEntries(Object.entries(parsedData).filter(([_, value]) => value !== undefined));

      const updatedClient = await prisma.client.update({
        where: { id },
        data: cleanData,
      });

      // Invalidate all client-related caches for this organization
      await this.invalidateClientCache(orgId);

      logger.info("Client updated successfully", { clientId: id, orgId });

      return updatedClient;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      handleError(error, "updateClient", "Failed to update client");
    }
  }

  // Delete client (soft delete by setting isActive to false)
  public async deleteClient(id: string, orgId: string): Promise<void> {
    await this.getClientById(id, orgId); // Validate client exists

    try {
      // Check if client has any future appointments
      const futureAppointments = await prisma.appointment.count({
        where: {
          clientId: id,
          orgId,
          startTime: {
            gte: new Date(),
          },
          status: {
            in: ["SCHEDULED", "CONFIRMED"],
          },
        },
      });

      if (futureAppointments > 0) {
        throw new AppError(
          "Cannot delete client with future appointments. Please cancel or reschedule appointments first.",
          400,
        );
      }

      // Soft delete the client
      await prisma.client.update({
        where: { id },
        data: { isActive: false },
      });

      // Invalidate all client-related caches for this organization
      await this.invalidateClientCache(orgId);

      logger.info("Client deleted successfully", { clientId: id, orgId });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      handleError(error, "deleteClient", "Failed to delete client");
    }
  }

  // Search clients by name or email
  public async searchClients(orgId: string, query: string): Promise<Client[]> {
    await this.validateOrgMembership(orgId);

    if (!query || query.trim().length < 2) {
      throw new AppError("Search query must be at least 2 characters", 400);
    }

    const cacheKey = this.getCacheKey(orgId, `search:${query.toLowerCase()}`);
    const cached = await cacheService.get<Client[]>(cacheKey);

    if (cached) {
      return cached;
    }

    const clients = await prisma.client.findMany({
      where: {
        orgId,
        isActive: true,
        OR: [
          {
            firstName: {
              contains: query,
              mode: "insensitive",
            },
          },
          {
            lastName: {
              contains: query,
              mode: "insensitive",
            },
          },
          {
            email: {
              contains: query,
              mode: "insensitive",
            },
          },
        ],
      },
      take: 10, // Limit search results
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });

    // Cache the result for 5 minutes (shorter TTL for search)
    await cacheService.set(cacheKey, clients, 300);

    return clients;
  }

  // Analytics and Reporting Methods

  /**
   * Get comprehensive client list with analytics data
   */
  async getClientAnalyticsList(orgId: string, params: ClientListAnalyticsParams, pagination: PaginationParams) {
    try {
      const { sortBy = "name", sortOrder = "asc", gender, startDate, endDate, period } = params;

      // Calculate date range if specified
      const dateRange = startDate || endDate || period ? this.calculateDateRange(period, startDate, endDate) : null;

      // Build where clause for clients
      const clientWhere: Prisma.ClientWhereInput = {
        orgId,
        ...(gender && { gender }),
      };

      // Build include clause based on requested details
      const include: Prisma.ClientInclude = {
        referredBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        appointments: {
          select: {
            startTime: true,
          },
          ...(dateRange && {
            where: {
              startTime: { gte: dateRange.start, lte: dateRange.end },
            },
          }),
          orderBy: { startTime: "desc" },
        },
      };

      // Build orderBy based on sortBy and sortOrder
      const orderBy: Prisma.ClientOrderByWithRelationInput = this.buildClientOrderBy(sortBy, sortOrder);

      // Get total count
      const total = await prisma.client.count({ where: clientWhere });

      // Get clients with pagination
      const clients = await prisma.client.findMany({
        where: clientWhere,
        include,
        orderBy,
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      });

      return {
        data: clients,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          totalPages: Math.ceil(total / pagination.limit),
        },
        filters: params,
      };
    } catch (error) {
      handleError(error, "getClientAnalyticsList", "Failed to get client analytics list");
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
          start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          end = now;
      }
    } else {
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

  private async getNewClientsCount(orgId: string, dateRange: { start: Date; end: Date }): Promise<number> {
    // Clients whose first appointment was in the specified period
    const clientsWithFirstAppointment = await prisma.client.findMany({
      where: {
        orgId,
        appointments: {
          some: {
            startTime: {
              gte: dateRange.start,
              lte: dateRange.end,
            },
          },
        },
      },
      include: {
        appointments: {
          select: { startTime: true },
          orderBy: { startTime: "asc" },
          take: 1,
        },
      },
    });

    return clientsWithFirstAppointment.filter(
      (client) => client.appointments.length > 0 && client.appointments[0].startTime >= dateRange.start,
    ).length;
  }

  private async getReturningClientsCount(orgId: string, dateRange: { start: Date; end: Date }): Promise<number> {
    const returningClients = await prisma.client.count({
      where: {
        orgId,
        appointments: {
          some: {
            startTime: {
              gte: dateRange.start,
              lte: dateRange.end,
            },
          },
        },
        AND: {
          appointments: {
            some: {
              startTime: {
                lt: dateRange.start,
              },
            },
          },
        },
      },
    });

    return returningClients;
  }

  private async getActiveClientsCount(orgId: string, dateRange: { start: Date; end: Date }): Promise<number> {
    return prisma.client.count({
      where: {
        orgId,
        appointments: {
          some: {
            startTime: {
              gte: dateRange.start,
              lte: dateRange.end,
            },
          },
        },
      },
    });
  }

  // Placeholder methods for complex analytics (to be implemented based on specific requirements)
  private async getClientTrends(
    orgId: string,
    appointmentWhere: Prisma.AppointmentWhereInput,
    groupBy: string,
    _dateRange: { start: Date; end: Date },
  ) {
    // Group appointments by the specified period and count clients
    const appointments = await prisma.appointment.findMany({
      where: appointmentWhere,
      select: {
        startTime: true,
        clientId: true,
        price: true,
        status: true,
      },
    });

    // Group by period and aggregate data
    const trends = new Map<
      string,
      {
        period: string;
        newClients: number;
        returningClients: number;
        totalRevenue: number;
        totalAppointments: number;
        uniqueClients: Set<string>;
      }
    >();

    // First pass: collect all appointments by period
    appointments.forEach((appointment) => {
      const date = new Date(appointment.startTime);
      let periodKey: string;

      switch (groupBy) {
        case "day":
          periodKey = date.toISOString().split("T")[0];
          break;
        case "week": {
          const startOfWeek = new Date(date);
          startOfWeek.setDate(date.getDate() - date.getDay());
          periodKey = startOfWeek.toISOString().split("T")[0];
          break;
        }
        case "month":
          periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
          break;
        default:
          periodKey = date.toISOString().split("T")[0];
      }

      if (!trends.has(periodKey)) {
        trends.set(periodKey, {
          period: periodKey,
          newClients: 0,
          returningClients: 0,
          totalRevenue: 0,
          totalAppointments: 0,
          uniqueClients: new Set(),
        });
      }

      const periodData = trends.get(periodKey)!;
      periodData.totalAppointments++;
      periodData.uniqueClients.add(appointment.clientId || "walk-in");

      if (appointment.status === "COMPLETED") {
        periodData.totalRevenue += appointment.price || 0;
      }
    });

    // Second pass: determine new vs returning clients
    for (const [periodKey, periodData] of trends) {
      const periodStart = new Date(periodKey);
      let periodEnd: Date;

      if (groupBy === "day") {
        periodEnd = new Date(periodStart);
        periodEnd.setDate(periodStart.getDate() + 1);
      } else if (groupBy === "week") {
        periodEnd = new Date(periodStart);
        periodEnd.setDate(periodStart.getDate() + 7);
      } else if (groupBy === "month") {
        periodEnd = new Date(periodStart);
        periodEnd.setMonth(periodStart.getMonth() + 1);
      } else {
        periodEnd = new Date(periodStart);
        periodEnd.setDate(periodStart.getDate() + 1);
      }

      // Check each client to see if they had appointments before this period
      for (const clientId of periodData.uniqueClients) {
        if (clientId === "walk-in") continue;

        const previousAppointments = await prisma.appointment.count({
          where: {
            clientId,
            orgId,
            startTime: {
              lt: periodStart,
            },
          },
        });

        if (previousAppointments === 0) {
          periodData.newClients++;
        } else {
          periodData.returningClients++;
        }
      }
    }

    // Convert to array and sort by period
    return Array.from(trends.values())
      .map((item) => ({
        period: item.period,
        newClients: item.newClients,
        returningClients: item.returningClients,
        totalClients: item.uniqueClients.size,
        totalRevenue: Math.round(item.totalRevenue * 100) / 100,
        totalAppointments: item.totalAppointments,
        averageRevenuePerClient:
          item.uniqueClients.size > 0 ? Math.round((item.totalRevenue / item.uniqueClients.size) * 100) / 100 : 0,
      }))
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  private async getClientSegmentation(orgId: string, dateRange: { start: Date; end: Date }) {
    // Get client data with appointment counts and spending
    const clients = await prisma.client.findMany({
      where: { orgId, isActive: true },
      include: {
        appointments: {
          where: {
            startTime: {
              gte: dateRange.start,
              lte: dateRange.end,
            },
            status: "COMPLETED",
          },
          select: {
            price: true,
            startTime: true,
          },
        },
        _count: {
          select: {
            appointments: {
              where: {
                startTime: {
                  gte: dateRange.start,
                  lte: dateRange.end,
                },
              },
            },
          },
        },
      },
    });

    // Calculate segmentation metrics
    const segmentation = {
      bySpendingTier: {
        vip: { count: 0, percentage: 0, avgSpent: 0 },
        high: { count: 0, percentage: 0, avgSpent: 0 },
        medium: { count: 0, percentage: 0, avgSpent: 0 },
        low: { count: 0, percentage: 0, avgSpent: 0 },
      },
      byFrequencyTier: {
        frequent: { count: 0, percentage: 0, avgAppointments: 0 },
        regular: { count: 0, percentage: 0, avgAppointments: 0 },
        occasional: { count: 0, percentage: 0, avgAppointments: 0 },
        new: { count: 0, percentage: 0, avgAppointments: 0 },
      },
      byRecency: {
        active: { count: 0, percentage: 0, avgDaysSinceLastVisit: 0 },
        recent: { count: 0, percentage: 0, avgDaysSinceLastVisit: 0 },
        inactive: { count: 0, percentage: 0, avgDaysSinceLastVisit: 0 },
        dormant: { count: 0, percentage: 0, avgDaysSinceLastVisit: 0 },
        new: { count: 0, percentage: 0, avgDaysSinceLastVisit: 0 },
      },
      demographics: {
        ageGroups: {
          "18-25": { count: 0, percentage: 0 },
          "26-35": { count: 0, percentage: 0 },
          "36-45": { count: 0, percentage: 0 },
          "46-55": { count: 0, percentage: 0 },
          "56+": { count: 0, percentage: 0 },
        },
      },
    };

    const now = new Date();
    const spendingData: Array<{ totalSpent: number; appointmentCount: number; lastVisit?: Date; age?: number }> = [];

    clients.forEach((client) => {
      const totalSpent = client.appointments.reduce((sum, apt) => sum + (apt.price || 0), 0);
      const appointmentCount = client._count.appointments;
      const lastVisit =
        client.appointments.length > 0
          ? new Date(Math.max(...client.appointments.map((apt) => apt.startTime.getTime())))
          : undefined;

      // Calculate age if dateOfBirth is available
      let age: number | undefined;
      if (client.dateOfBirth) {
        age = now.getFullYear() - client.dateOfBirth.getFullYear();
      }

      spendingData.push({ totalSpent, appointmentCount, lastVisit, age });

      // Spending tier segmentation
      if (totalSpent >= 1000) {
        segmentation.bySpendingTier.vip.count++;
      } else if (totalSpent >= 500) {
        segmentation.bySpendingTier.high.count++;
      } else if (totalSpent >= 100) {
        segmentation.bySpendingTier.medium.count++;
      } else {
        segmentation.bySpendingTier.low.count++;
      }

      // Frequency tier segmentation
      if (appointmentCount >= 10) {
        segmentation.byFrequencyTier.frequent.count++;
      } else if (appointmentCount >= 5) {
        segmentation.byFrequencyTier.regular.count++;
      } else if (appointmentCount >= 1) {
        segmentation.byFrequencyTier.occasional.count++;
      } else {
        segmentation.byFrequencyTier.new.count++;
      }

      // Recency segmentation
      if (lastVisit) {
        const daysSinceLastVisit = Math.floor((now.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceLastVisit <= 30) {
          segmentation.byRecency.active.count++;
        } else if (daysSinceLastVisit <= 90) {
          segmentation.byRecency.recent.count++;
        } else if (daysSinceLastVisit <= 180) {
          segmentation.byRecency.inactive.count++;
        } else {
          segmentation.byRecency.dormant.count++;
        }
      } else {
        segmentation.byRecency.new.count++;
      }

      // Age group segmentation
      if (age) {
        if (age >= 18 && age <= 25) {
          segmentation.demographics.ageGroups["18-25"].count++;
        } else if (age >= 26 && age <= 35) {
          segmentation.demographics.ageGroups["26-35"].count++;
        } else if (age >= 36 && age <= 45) {
          segmentation.demographics.ageGroups["36-45"].count++;
        } else if (age >= 46 && age <= 55) {
          segmentation.demographics.ageGroups["46-55"].count++;
        } else if (age >= 56) {
          segmentation.demographics.ageGroups["56+"].count++;
        }
      }
    });

    const totalClients = clients.length;

    // Calculate percentages and averages
    if (totalClients > 0) {
      // Spending tier percentages and averages
      Object.keys(segmentation.bySpendingTier).forEach((tier) => {
        const tierData = segmentation.bySpendingTier[tier as keyof typeof segmentation.bySpendingTier];
        tierData.percentage = Math.round((tierData.count / totalClients) * 100);

        // Calculate average spending for this tier
        const tierClients = spendingData.filter((client) => {
          const totalSpent = client.totalSpent;
          switch (tier) {
            case "vip":
              return totalSpent >= 1000;
            case "high":
              return totalSpent >= 500 && totalSpent < 1000;
            case "medium":
              return totalSpent >= 100 && totalSpent < 500;
            case "low":
              return totalSpent < 100;
            default:
              return false;
          }
        });
        tierData.avgSpent =
          tierClients.length > 0
            ? Math.round((tierClients.reduce((sum, c) => sum + c.totalSpent, 0) / tierClients.length) * 100) / 100
            : 0;
      });

      // Frequency tier percentages and averages
      Object.keys(segmentation.byFrequencyTier).forEach((tier) => {
        const tierData = segmentation.byFrequencyTier[tier as keyof typeof segmentation.byFrequencyTier];
        tierData.percentage = Math.round((tierData.count / totalClients) * 100);

        // Calculate average appointments for this tier
        const tierClients = spendingData.filter((client) => {
          const count = client.appointmentCount;
          switch (tier) {
            case "frequent":
              return count >= 10;
            case "regular":
              return count >= 5 && count < 10;
            case "occasional":
              return count >= 1 && count < 5;
            case "new":
              return count === 0;
            default:
              return false;
          }
        });
        tierData.avgAppointments =
          tierClients.length > 0
            ? Math.round((tierClients.reduce((sum, c) => sum + c.appointmentCount, 0) / tierClients.length) * 100) / 100
            : 0;
      });

      // Recency percentages and averages
      Object.keys(segmentation.byRecency).forEach((tier) => {
        const tierData = segmentation.byRecency[tier as keyof typeof segmentation.byRecency];
        tierData.percentage = Math.round((tierData.count / totalClients) * 100);
      });

      // Age group percentages
      Object.keys(segmentation.demographics.ageGroups).forEach((group) => {
        const groupData =
          segmentation.demographics.ageGroups[group as keyof typeof segmentation.demographics.ageGroups];
        groupData.percentage = Math.round((groupData.count / totalClients) * 100);
      });
    }

    return segmentation;
  }

  private buildClientOrderBy(sortBy: string, sortOrder: string): Prisma.ClientOrderByWithRelationInput {
    const order = sortOrder as "asc" | "desc";

    switch (sortBy) {
      case "name":
        return { firstName: order };
      case "email":
        return { email: order };
      case "registrationDate":
        return { createdAt: order };
      case "lastVisit":
        return { updatedAt: order };
      default:
        return { firstName: order };
    }
  }
}

export const clientService = new ClientService();
