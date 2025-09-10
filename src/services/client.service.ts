import { logger } from "@/utils/logger";
import { prisma } from "@/config/prisma";
import { cacheService } from "./cache.service";
import { Client, Prisma } from "@prisma/client";
import { handleError } from "@/utils/errorHandler";
import { AppError } from "@/middlewares/error.middleware";
import type { PaginationParams } from "@/utils/pagination";
import type {
  ClientSummaryParams,
  ClientListAnalyticsParams,
  ClientInsightsParams,
  CreateClientData,
  UpdateClientData,
} from "@/validations/client.schema";

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

interface AppointmentAnalytics {
  status: string;
  price?: number;
  serviceId?: string;
  memberId?: string;
  service?: {
    name: string;
    category?: {
      name: string;
    };
  };
  member?: {
    username: string;
  };
  startTime?: Date;
  [key: string]: unknown;
}

interface PeriodMetrics {
  newClients: number;
  returningClients: number;
  totalRevenue: number;
  totalAppointments: number;
  averageAppointmentValue: number;
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

    // Validate required fields
    if (!data.email || !data.firstName || !data.lastName) {
      throw new AppError("Email, first name, and last name are required", 400);
    }

    // Sanitize and normalize input
    const normalizedEmail = data.email.toLowerCase().trim();
    const normalizedFirstName = data.firstName.trim();
    const normalizedLastName = data.lastName.trim();

    // Check if client with this email already exists in the organization
    const existingClient = await prisma.client.findUnique({
      where: {
        email_orgId: {
          email: normalizedEmail,
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
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        email: normalizedEmail,
        orgId,
      };

      if (data.phone) createData.phone = data.phone.trim();
      if (data.notes) createData.notes = data.notes.trim();
      if (data.dateOfBirth) createData.dateOfBirth = this.parseDate(data.dateOfBirth);
      if (data.address) createData.address = data.address as Prisma.InputJsonValue;
      if (data.preferences) createData.preferences = data.preferences as Prisma.InputJsonValue;

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
      // Parse dates properly
      const parsedData = {
        ...data,
        dateOfBirth: data.dateOfBirth ? this.parseDate(data.dateOfBirth) : undefined,
      };

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
   * Get client summary analytics with trends and patterns
   */
  async getClientSummary(orgId: string, params: ClientSummaryParams) {
    try {
      const {
        startDate,
        endDate,
        period,
        groupBy = "day",
        includeMetrics = [],
        includeSegmentation = false,
        compareWithPrevious = false,
        memberId,
        serviceId,
        categoryId,
      } = params;

      // Calculate date range based on period or custom dates
      const dateRange = this.calculateDateRange(period, startDate, endDate);

      // Base query conditions for appointments
      const appointmentWhere: Prisma.AppointmentWhereInput = {
        orgId,
        startTime: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
        ...(memberId && { memberId }),
        ...(serviceId && { serviceId }),
        ...(categoryId && { service: { categoryId } }),
      };

      // Get client statistics
      const [totalClients, newClients, returningClients, walkInClients, activeClients] = await Promise.all([
        // Total clients in organization
        prisma.client.count({ where: { orgId, isActive: true } }),

        // New clients (first appointment in period)
        this.getNewClientsCount(orgId, dateRange),

        // Returning clients (clients with previous appointments)
        this.getReturningClientsCount(orgId, dateRange),

        // Walk-in appointments (no clientId)
        prisma.appointment.count({
          where: { ...appointmentWhere, clientId: null },
        }),

        // Active clients (clients with appointments in period)
        this.getActiveClientsCount(orgId, dateRange),
      ]);

      // Calculate revenue and appointment metrics if requested
      let totalRevenue = 0;
      let averageValue = 0;
      if (includeMetrics.includes("revenue") || includeMetrics.includes("averageValue")) {
        const revenueData = await prisma.appointment.aggregate({
          where: { ...appointmentWhere, status: "COMPLETED" },
          _sum: { price: true },
          _count: { id: true },
        });
        totalRevenue = revenueData._sum.price || 0;
        averageValue = revenueData._count.id > 0 ? totalRevenue / revenueData._count.id : 0;
      }

      // Get trends data if requested
      let trends: Array<Record<string, unknown>> = [];
      if (groupBy) {
        trends = await this.getClientTrends(orgId, appointmentWhere, groupBy, dateRange);
      }

      // Get client segmentation if requested
      let segmentation: Record<string, unknown> = {};
      if (includeSegmentation) {
        segmentation = await this.getClientSegmentation(orgId, dateRange);
      }

      // Compare with previous period if requested
      let comparison: Record<string, unknown> = {};
      if (compareWithPrevious) {
        comparison = await this.getPreviousPeriodComparison(orgId, dateRange, params);
      }

      return {
        period: {
          start: dateRange.start,
          end: dateRange.end,
          label: this.getPeriodLabel(period, startDate, endDate),
        },
        overview: {
          totalClients,
          newClients,
          returningClients,
          walkInClients,
          activeClients,
          totalRevenue,
          averageValue: Math.round(averageValue * 100) / 100,
        },
        trends,
        segmentation,
        comparison,
        filters: {
          memberId,
          serviceId,
          categoryId,
          groupBy,
          includeMetrics,
          includeSegmentation,
          compareWithPrevious,
        },
      };
    } catch (error) {
      handleError(error, "getClientSummary", "Failed to get client summary");
    }
  }

  /**
   * Get comprehensive client list with analytics data
   */
  async getClientAnalyticsList(orgId: string, params: ClientListAnalyticsParams, pagination: PaginationParams) {
    try {
      const {
        clientType = "all",
        sortBy = "name",
        sortOrder = "asc",
        includeDetails = [],
        search,
        isActive,
        minAppointments,
        maxAppointments,
        minSpent,
        maxSpent,
        registrationDateFrom,
        registrationDateTo,
        lastVisitFrom: _lastVisitFrom,
        lastVisitTo: _lastVisitTo,
        ageFrom,
        ageTo,
        gender,
        communicationPreference: _communicationPreference,
        startDate,
        endDate,
        period,
        memberId: _memberId,
        serviceId: _serviceId,
        categoryId: _categoryId,
      } = params;

      // Calculate date range if specified
      const dateRange = startDate || endDate || period ? this.calculateDateRange(period, startDate, endDate) : null;

      // Build where clause for clients
      const clientWhere: Prisma.ClientWhereInput = {
        orgId,
        ...(isActive !== undefined && { isActive }),
        ...(search && {
          OR: [
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
          ],
        }),
        ...(registrationDateFrom && { createdAt: { gte: new Date(registrationDateFrom) } }),
        ...(registrationDateTo && { createdAt: { lte: new Date(registrationDateTo) } }),
        ...(gender && { gender }),
        // Note: Communication preference filtering would need a custom implementation
        // as JSON filtering in Prisma has specific syntax requirements
      };

      // Add age filters if specified
      if (ageFrom || ageTo) {
        const now = new Date();
        const ageConditions: Record<string, Date> = {};

        if (ageTo) {
          const minBirthDate = new Date(now.getFullYear() - ageTo, now.getMonth(), now.getDate());
          ageConditions.gte = minBirthDate;
        }

        if (ageFrom) {
          const maxBirthDate = new Date(now.getFullYear() - ageFrom, now.getMonth(), now.getDate());
          ageConditions.lte = maxBirthDate;
        }

        if (Object.keys(ageConditions).length > 0) {
          clientWhere.dateOfBirth = ageConditions;
        }
      }

      // Filter by client type (new, returning, walk-in)
      if (clientType !== "all") {
        await this.applyClientTypeFilter(clientWhere, clientType, dateRange, orgId);
      }

      // Build include clause based on requested details
      const include: Prisma.ClientInclude = {
        ...(includeDetails.includes("appointments") && {
          appointments: {
            select: {
              id: true,
              startTime: true,
              status: true,
              price: true,
              service: { select: { name: true, duration: true } },
              member: { select: { username: true } },
            },
            ...(dateRange && {
              where: {
                startTime: { gte: dateRange.start, lte: dateRange.end },
              },
            }),
            orderBy: { startTime: "desc" },
            take: 10, // Limit recent appointments
          },
        }),
        _count: {
          select: {
            appointments: {
              ...(dateRange && {
                where: {
                  startTime: { gte: dateRange.start, lte: dateRange.end },
                },
              }),
            },
          },
        },
      };

      // Build orderBy based on sortBy and sortOrder
      const orderBy: Prisma.ClientOrderByWithRelationInput = this.buildClientOrderBy(sortBy, sortOrder);

      // Apply spending filters by adding having clause through raw query if needed
      let clientIds: string[] | undefined;
      if (minSpent || maxSpent || minAppointments || maxAppointments) {
        clientIds = await this.getFilteredClientIds(orgId, {
          minSpent,
          maxSpent,
          minAppointments,
          maxAppointments,
          dateRange,
        });

        if (clientIds.length === 0) {
          return {
            data: [],
            pagination: {
              page: pagination.page,
              limit: pagination.limit,
              total: 0,
              totalPages: 0,
            },
            summary: this.getEmptyListSummary(),
            filters: params,
          };
        }

        clientWhere.id = { in: clientIds };
      }

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

      // Calculate additional analytics for each client if requested
      const enrichedClients = await this.enrichClientsWithAnalytics(clients, includeDetails, dateRange);

      // Calculate summary statistics
      const summary = await this.calculateListSummaryStats(clientWhere, dateRange);

      return {
        data: enrichedClients,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          totalPages: Math.ceil(total / pagination.limit),
        },
        summary,
        filters: params,
      };
    } catch (error) {
      handleError(error, "getClientAnalyticsList", "Failed to get client analytics list");
    }
  }

  /**
   * Get individual client insights and behavior analysis
   */
  async getClientInsights(orgId: string, clientId: string, params: ClientInsightsParams) {
    try {
      const {
        includeAppointmentHistory = true,
        includeSpendingAnalysis = true,
        includeServicePreferences = true,
        includeMemberPreferences = true,
        includeBehaviorPatterns = true,
        historyMonths = 12,
      } = params;

      // Validate client exists and belongs to organization
      const client = await prisma.client.findFirst({
        where: { id: clientId, orgId },
        include: {
          appointments: {
            include: {
              service: { include: { category: true } },
              member: true,
            },
            orderBy: { startTime: "desc" },
            take: historyMonths * 4, // Approximate appointments for the period
          },
        },
      });

      if (!client) {
        throw new AppError("Client not found", 404);
      }

      const historyStartDate = new Date();
      historyStartDate.setMonth(historyStartDate.getMonth() - historyMonths);

      const insights: Record<string, unknown> = {
        client: {
          id: client.id,
          name: `${client.firstName} ${client.lastName}`,
          email: client.email,
          phone: client.phone,
          registrationDate: client.createdAt,
          isActive: client.isActive,
          preferences: client.preferences,
        },
      };

      // Appointment History Analysis
      if (includeAppointmentHistory) {
        insights.appointmentHistory = await this.analyzeAppointmentHistory(client.appointments, historyStartDate);
      }

      // Spending Analysis
      if (includeSpendingAnalysis) {
        insights.spendingAnalysis = await this.analyzeClientSpending(client.appointments, historyStartDate);
      }

      // Service Preferences
      if (includeServicePreferences) {
        insights.servicePreferences = await this.analyzeServicePreferences(client.appointments);
      }

      // Member Preferences
      if (includeMemberPreferences) {
        insights.memberPreferences = await this.analyzeMemberPreferences(client.appointments);
      }

      // Behavior Patterns
      if (includeBehaviorPatterns) {
        insights.behaviorPatterns = await this.analyzeBehaviorPatterns(client.appointments, historyStartDate);
      }

      return insights;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      handleError(error, "getClientInsights", "Failed to get client insights");
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

  private async getPreviousPeriodComparison(
    orgId: string,
    dateRange: { start: Date; end: Date },
    params: ClientSummaryParams,
  ) {
    // Calculate previous period date range
    const periodDuration = dateRange.end.getTime() - dateRange.start.getTime();
    const previousStart = new Date(dateRange.start.getTime() - periodDuration);
    const previousEnd = new Date(dateRange.start.getTime() - 1); // 1ms before current period

    // Get current period metrics
    const currentMetrics = await this.getPeriodMetrics(orgId, dateRange, params);

    // Get previous period metrics
    const previousMetrics = await this.getPeriodMetrics(orgId, { start: previousStart, end: previousEnd }, params);

    // Calculate growth rates
    const comparison = {
      period: {
        current: `${dateRange.start.toISOString().split("T")[0]} to ${dateRange.end.toISOString().split("T")[0]}`,
        previous: `${previousStart.toISOString().split("T")[0]} to ${previousEnd.toISOString().split("T")[0]}`,
      },
      metrics: {
        newClients: {
          current: currentMetrics.newClients,
          previous: previousMetrics.newClients,
          growth:
            previousMetrics.newClients > 0
              ? Math.round(
                  ((currentMetrics.newClients - previousMetrics.newClients) / previousMetrics.newClients) * 100,
                )
              : currentMetrics.newClients > 0
                ? 100
                : 0,
        },
        returningClients: {
          current: currentMetrics.returningClients,
          previous: previousMetrics.returningClients,
          growth:
            previousMetrics.returningClients > 0
              ? Math.round(
                  ((currentMetrics.returningClients - previousMetrics.returningClients) /
                    previousMetrics.returningClients) *
                    100,
                )
              : currentMetrics.returningClients > 0
                ? 100
                : 0,
        },
        totalRevenue: {
          current: currentMetrics.totalRevenue,
          previous: previousMetrics.totalRevenue,
          growth:
            previousMetrics.totalRevenue > 0
              ? Math.round(
                  ((currentMetrics.totalRevenue - previousMetrics.totalRevenue) / previousMetrics.totalRevenue) * 100,
                )
              : currentMetrics.totalRevenue > 0
                ? 100
                : 0,
        },
        totalAppointments: {
          current: currentMetrics.totalAppointments,
          previous: previousMetrics.totalAppointments,
          growth:
            previousMetrics.totalAppointments > 0
              ? Math.round(
                  ((currentMetrics.totalAppointments - previousMetrics.totalAppointments) /
                    previousMetrics.totalAppointments) *
                    100,
                )
              : currentMetrics.totalAppointments > 0
                ? 100
                : 0,
        },
        averageAppointmentValue: {
          current: currentMetrics.averageAppointmentValue,
          previous: previousMetrics.averageAppointmentValue,
          growth:
            previousMetrics.averageAppointmentValue > 0
              ? Math.round(
                  ((currentMetrics.averageAppointmentValue - previousMetrics.averageAppointmentValue) /
                    previousMetrics.averageAppointmentValue) *
                    100,
                )
              : currentMetrics.averageAppointmentValue > 0
                ? 100
                : 0,
        },
      },
      summary: {
        overallGrowth: this.calculateOverallGrowth(currentMetrics, previousMetrics),
        trend: this.determineTrend(currentMetrics, previousMetrics),
      },
    };

    return comparison;
  }

  private async getPeriodMetrics(orgId: string, dateRange: { start: Date; end: Date }, params: ClientSummaryParams) {
    const appointmentWhere: Prisma.AppointmentWhereInput = {
      orgId,
      startTime: {
        gte: dateRange.start,
        lte: dateRange.end,
      },
      ...(params.memberId && { memberId: params.memberId }),
      ...(params.serviceId && { serviceId: params.serviceId }),
      ...(params.categoryId && { service: { categoryId: params.categoryId } }),
    };

    const [newClients, returningClients, appointmentMetrics] = await Promise.all([
      this.getNewClientsCount(orgId, dateRange),
      this.getReturningClientsCount(orgId, dateRange),
      prisma.appointment.aggregate({
        where: { ...appointmentWhere, status: "COMPLETED" },
        _count: { id: true },
        _sum: { price: true },
        _avg: { price: true },
      }),
    ]);

    return {
      newClients,
      returningClients,
      totalRevenue: appointmentMetrics._sum.price || 0,
      totalAppointments: appointmentMetrics._count.id,
      averageAppointmentValue: appointmentMetrics._avg.price || 0,
    };
  }

  private calculateOverallGrowth(current: PeriodMetrics, previous: PeriodMetrics): number {
    const revenueGrowth =
      previous.totalRevenue > 0 ? (current.totalRevenue - previous.totalRevenue) / previous.totalRevenue : 0;
    const clientGrowth = previous.newClients > 0 ? (current.newClients - previous.newClients) / previous.newClients : 0;
    const appointmentGrowth =
      previous.totalAppointments > 0
        ? (current.totalAppointments - previous.totalAppointments) / previous.totalAppointments
        : 0;

    return Math.round(((revenueGrowth + clientGrowth + appointmentGrowth) / 3) * 100);
  }

  private determineTrend(current: PeriodMetrics, previous: PeriodMetrics): string {
    const growth = this.calculateOverallGrowth(current, previous);
    if (growth > 20) return "strong_growth";
    if (growth > 5) return "moderate_growth";
    if (growth > -5) return "stable";
    if (growth > -20) return "moderate_decline";
    return "strong_decline";
  }

  private async applyClientTypeFilter(
    clientWhere: Prisma.ClientWhereInput,
    clientType: string,
    dateRange: { start: Date; end: Date } | null,
    orgId: string,
  ) {
    if (!dateRange) return;

    switch (clientType) {
      case "new": {
        // Clients whose first appointment was in the date range
        const newClientIds = await prisma.appointment.findMany({
          where: {
            orgId,
            startTime: {
              gte: dateRange.start,
              lte: dateRange.end,
            },
          },
          select: { clientId: true },
          distinct: ["clientId"],
        });

        // Filter to only clients whose first appointment was in this period
        const firstAppointmentClients = [];
        for (const { clientId } of newClientIds) {
          if (!clientId) continue;

          const firstAppointment = await prisma.appointment.findFirst({
            where: { clientId, orgId },
            orderBy: { startTime: "asc" },
            select: { startTime: true },
          });

          if (firstAppointment && firstAppointment.startTime >= dateRange.start) {
            firstAppointmentClients.push(clientId);
          }
        }

        clientWhere.id = { in: firstAppointmentClients };
        break;
      }

      case "returning": {
        // Clients with appointments in the date range AND before the date range
        const returningClientIds = await prisma.appointment.findMany({
          where: {
            orgId,
            startTime: {
              gte: dateRange.start,
              lte: dateRange.end,
            },
          },
          select: { clientId: true },
          distinct: ["clientId"],
        });

        const returningClients = [];
        for (const { clientId } of returningClientIds) {
          if (!clientId) continue;

          const hasPreviousAppointment = await prisma.appointment.count({
            where: {
              clientId,
              orgId,
              startTime: { lt: dateRange.start },
            },
          });

          if (hasPreviousAppointment > 0) {
            returningClients.push(clientId);
          }
        }

        clientWhere.id = { in: returningClients };
        break;
      }

      case "walk_in": {
        // Clients with null clientId (walk-in appointments)
        // This is handled at the appointment level, not client level
        // For client analytics, walk-ins don't have client records
        clientWhere.id = { in: [] }; // No clients for walk-ins
        break;
      }

      case "all":
      default:
        // No additional filtering
        break;
    }
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

  private async getFilteredClientIds(
    orgId: string,
    filters: {
      minSpent?: number;
      maxSpent?: number;
      minAppointments?: number;
      maxAppointments?: number;
      dateRange?: { start: Date; end: Date } | null;
    },
  ): Promise<string[]> {
    const { minSpent, maxSpent, minAppointments, maxAppointments, dateRange } = filters;

    // Get all clients with their appointment data
    const clients = await prisma.client.findMany({
      where: { orgId, isActive: true },
      include: {
        appointments: {
          where: dateRange
            ? {
                startTime: {
                  gte: dateRange.start,
                  lte: dateRange.end,
                },
                status: "COMPLETED",
              }
            : {
                status: "COMPLETED",
              },
          select: {
            price: true,
          },
        },
      },
    });

    const filteredClientIds: string[] = [];

    for (const client of clients) {
      const totalSpent = client.appointments.reduce((sum, apt) => sum + (apt.price || 0), 0);
      const appointmentCount = client.appointments.length;

      // Apply spending filters
      if (minSpent !== undefined && totalSpent < minSpent) continue;
      if (maxSpent !== undefined && totalSpent > maxSpent) continue;

      // Apply appointment count filters
      if (minAppointments !== undefined && appointmentCount < minAppointments) continue;
      if (maxAppointments !== undefined && appointmentCount > maxAppointments) continue;

      filteredClientIds.push(client.id);
    }

    return filteredClientIds;
  }

  private async enrichClientsWithAnalytics(
    clients: Array<Record<string, unknown>>,
    includeDetails: string[],
    dateRange: { start: Date; end: Date } | null,
  ) {
    if (!includeDetails || includeDetails.length === 0) {
      return clients;
    }

    const enrichedClients = [];

    for (const client of clients) {
      const clientId = client.id as string;
      const enrichedClient = { ...client };

      // Add appointment details if requested
      if (includeDetails.includes("appointments") && client.appointments) {
        enrichedClient.appointments = client.appointments;
      }

      // Add spending analytics if requested
      if (includeDetails.includes("spending")) {
        const spendingData = await this.getClientSpendingAnalytics(clientId, dateRange);
        enrichedClient.spendingAnalytics = spendingData;
      }

      // Add service preferences if requested
      if (includeDetails.includes("services")) {
        const serviceData = await this.getClientServiceAnalytics(clientId, dateRange);
        enrichedClient.serviceAnalytics = serviceData;
      }

      // Add demographic data if requested
      if (includeDetails.includes("demographics")) {
        enrichedClient.demographics = {
          age: client.dateOfBirth ? this.calculateAge(client.dateOfBirth as Date) : null,
          registrationDate: client.createdAt,
          lastVisit: client.updatedAt,
          isActive: client.isActive,
        };
      }

      enrichedClients.push(enrichedClient);
    }

    return enrichedClients;
  }

  private async getClientSpendingAnalytics(clientId: string, dateRange: { start: Date; end: Date } | null) {
    const appointments = await prisma.appointment.findMany({
      where: {
        clientId,
        status: "COMPLETED",
        ...(dateRange && {
          startTime: {
            gte: dateRange.start,
            lte: dateRange.end,
          },
        }),
      },
      select: {
        price: true,
        startTime: true,
      },
    });

    const totalSpent = appointments.reduce((sum, apt) => sum + (apt.price || 0), 0);
    const appointmentCount = appointments.length;
    const averageSpent = appointmentCount > 0 ? totalSpent / appointmentCount : 0;

    return {
      totalSpent: Math.round(totalSpent * 100) / 100,
      appointmentCount,
      averageSpent: Math.round(averageSpent * 100) / 100,
      spendingTrend: this.calculateSpendingTrend(appointments),
    };
  }

  private async getClientServiceAnalytics(clientId: string, dateRange: { start: Date; end: Date } | null) {
    const appointments = await prisma.appointment.findMany({
      where: {
        clientId,
        status: "COMPLETED",
        ...(dateRange && {
          startTime: {
            gte: dateRange.start,
            lte: dateRange.end,
          },
        }),
      },
      include: {
        service: {
          include: {
            category: true,
          },
        },
      },
    });

    const serviceStats = new Map();
    const categoryStats = new Map();

    appointments.forEach((appointment) => {
      const service = appointment.service;
      const category = service.category;

      // Service stats
      if (!serviceStats.has(service.id)) {
        serviceStats.set(service.id, {
          service: { id: service.id, name: service.name },
          count: 0,
          totalSpent: 0,
        });
      }
      const serviceStat = serviceStats.get(service.id);
      serviceStat.count++;
      serviceStat.totalSpent += appointment.price || 0;

      // Category stats
      if (!categoryStats.has(category.id)) {
        categoryStats.set(category.id, {
          category: { id: category.id, name: category.name },
          count: 0,
          totalSpent: 0,
        });
      }
      const categoryStat = categoryStats.get(category.id);
      categoryStat.count++;
      categoryStat.totalSpent += appointment.price || 0;
    });

    return {
      topServices: Array.from(serviceStats.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map((stat) => ({
          ...stat,
          totalSpent: Math.round(stat.totalSpent * 100) / 100,
        })),
      topCategories: Array.from(categoryStats.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map((stat) => ({
          ...stat,
          totalSpent: Math.round(stat.totalSpent * 100) / 100,
        })),
    };
  }

  private calculateAge(dateOfBirth: Date): number {
    const today = new Date();
    let age = today.getFullYear() - dateOfBirth.getFullYear();
    const monthDiff = today.getMonth() - dateOfBirth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
      age--;
    }

    return age;
  }

  private calculateSpendingTrend(appointments: Array<{ price: number; startTime: Date }>): string {
    if (appointments.length < 2) return "insufficient_data";

    // Sort by date
    const sortedAppointments = appointments.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    // Split into first and second half
    const midPoint = Math.floor(sortedAppointments.length / 2);
    const firstHalf = sortedAppointments.slice(0, midPoint);
    const secondHalf = sortedAppointments.slice(midPoint);

    const firstHalfAvg = firstHalf.reduce((sum, apt) => sum + (apt.price || 0), 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, apt) => sum + (apt.price || 0), 0) / secondHalf.length;

    const change = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;

    if (change > 10) return "increasing";
    if (change < -10) return "decreasing";
    return "stable";
  }

  private async calculateListSummaryStats(
    clientWhere: Prisma.ClientWhereInput,
    dateRange: { start: Date; end: Date } | null,
  ) {
    // Get clients with their appointment data
    const clients = await prisma.client.findMany({
      where: clientWhere,
      include: {
        appointments: {
          where: {
            status: "COMPLETED",
            ...(dateRange && {
              startTime: {
                gte: dateRange.start,
                lte: dateRange.end,
              },
            }),
          },
          select: {
            price: true,
          },
        },
      },
    });

    if (clients.length === 0) {
      return this.getEmptyListSummary();
    }

    let totalSpending = 0;
    let totalAppointments = 0;
    const clientSpending: number[] = [];

    clients.forEach((client) => {
      const clientTotalSpent = client.appointments.reduce((sum, apt) => sum + (apt.price || 0), 0);
      const clientAppointmentCount = client.appointments.length;

      totalSpending += clientTotalSpent;
      totalAppointments += clientAppointmentCount;

      if (clientTotalSpent > 0) {
        clientSpending.push(clientTotalSpent);
      }
    });

    const averageSpending = totalSpending / clients.length;
    const averageAppointments = totalAppointments / clients.length;

    // Calculate median spending
    const sortedSpending = clientSpending.sort((a, b) => a - b);
    const medianSpending =
      sortedSpending.length > 0
        ? sortedSpending.length % 2 === 0
          ? (sortedSpending[sortedSpending.length / 2 - 1] + sortedSpending[sortedSpending.length / 2]) / 2
          : sortedSpending[Math.floor(sortedSpending.length / 2)]
        : 0;

    return {
      totalClients: clients.length,
      totalSpending: Math.round(totalSpending * 100) / 100,
      totalAppointments,
      averageSpending: Math.round(averageSpending * 100) / 100,
      averageAppointments: Math.round(averageAppointments * 100) / 100,
      medianSpending: Math.round(medianSpending * 100) / 100,
      spendingDistribution: this.calculateSpendingDistribution(clientSpending),
    };
  }

  private calculateSpendingDistribution(spendingData: number[]): Record<string, number> {
    if (spendingData.length === 0) {
      return { "0-100": 0, "100-500": 0, "500-1000": 0, "1000+": 0 };
    }

    const distribution = { "0-100": 0, "100-500": 0, "500-1000": 0, "1000+": 0 };

    spendingData.forEach((amount) => {
      if (amount < 100) distribution["0-100"]++;
      else if (amount < 500) distribution["100-500"]++;
      else if (amount < 1000) distribution["500-1000"]++;
      else distribution["1000+"]++;
    });

    // Convert to percentages
    Object.keys(distribution).forEach((key) => {
      distribution[key as keyof typeof distribution] = Math.round(
        (distribution[key as keyof typeof distribution] / spendingData.length) * 100,
      );
    });

    return distribution;
  }

  private getEmptyListSummary() {
    return {
      totalClients: 0,
      averageSpending: 0,
      averageAppointments: 0,
    };
  }

  private async analyzeAppointmentHistory(appointments: AppointmentAnalytics[], _historyStartDate: Date) {
    // Implementation for appointment history analysis
    return {
      totalAppointments: appointments.length,
      completedAppointments: appointments.filter((a) => a.status === "COMPLETED").length,
      cancelledAppointments: appointments.filter((a) => a.status === "CANCELLED").length,
      noShowAppointments: appointments.filter((a) => a.status === "NO_SHOW").length,
    };
  }

  private async analyzeClientSpending(appointments: AppointmentAnalytics[], _historyStartDate: Date) {
    // Implementation for spending analysis
    const completedAppointments = appointments.filter((a) => a.status === "COMPLETED");
    const totalSpent = completedAppointments.reduce((sum: number, a) => sum + (a.price || 0), 0);

    return {
      totalSpent,
      averagePerAppointment: completedAppointments.length > 0 ? totalSpent / completedAppointments.length : 0,
      appointmentCount: completedAppointments.length,
    };
  }

  private async analyzeServicePreferences(appointments: AppointmentAnalytics[]) {
    if (appointments.length === 0) {
      return {
        topServices: [],
        serviceFrequency: {},
        preferredCategories: [],
        serviceDiversity: 0,
        mostFrequentService: null,
        leastFrequentService: null,
      };
    }

    // Group appointments by service (assuming service data is included)
    const serviceStats = new Map<
      string,
      {
        serviceId: string;
        serviceName: string;
        count: number;
        totalSpent: number;
        lastVisit: Date;
        category?: string;
      }
    >();

    appointments.forEach((appointment) => {
      const serviceId = appointment.serviceId || "unknown";
      const serviceName = appointment.service?.name || "Unknown Service";
      const category = appointment.service?.category?.name;
      const price = appointment.price || 0;

      if (!serviceStats.has(serviceId)) {
        serviceStats.set(serviceId, {
          serviceId,
          serviceName,
          count: 0,
          totalSpent: 0,
          lastVisit: appointment.startTime || new Date(),
          category,
        });
      }

      const stat = serviceStats.get(serviceId)!;
      stat.count++;
      stat.totalSpent += price;
      if (appointment.startTime && appointment.startTime > stat.lastVisit) {
        stat.lastVisit = appointment.startTime;
      }
    });

    const serviceArray = Array.from(serviceStats.values());

    // Sort by frequency
    const sortedByFrequency = serviceArray.sort((a, b) => b.count - a.count);
    const sortedBySpending = serviceArray.sort((a, b) => b.totalSpent - a.totalSpent);

    // Calculate service diversity (unique services / total appointments)
    const serviceDiversity = serviceArray.length / appointments.length;

    // Group by categories
    const categoryStats = new Map<string, { count: number; totalSpent: number }>();
    serviceArray.forEach((service) => {
      if (service.category) {
        if (!categoryStats.has(service.category)) {
          categoryStats.set(service.category, { count: 0, totalSpent: 0 });
        }
        const catStat = categoryStats.get(service.category)!;
        catStat.count += service.count;
        catStat.totalSpent += service.totalSpent;
      }
    });

    const preferredCategories = Array.from(categoryStats.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .map(([category, stats]) => ({
        category,
        count: stats.count,
        totalSpent: Math.round(stats.totalSpent * 100) / 100,
        percentage: Math.round((stats.count / appointments.length) * 100),
      }));

    return {
      topServices: sortedByFrequency.slice(0, 5).map((service) => ({
        serviceId: service.serviceId,
        serviceName: service.serviceName,
        count: service.count,
        totalSpent: Math.round(service.totalSpent * 100) / 100,
        percentage: Math.round((service.count / appointments.length) * 100),
        lastVisit: service.lastVisit,
        averageSpent: Math.round((service.totalSpent / service.count) * 100) / 100,
      })),
      topServicesBySpending: sortedBySpending.slice(0, 5).map((service) => ({
        serviceId: service.serviceId,
        serviceName: service.serviceName,
        totalSpent: Math.round(service.totalSpent * 100) / 100,
        count: service.count,
        averageSpent: Math.round((service.totalSpent / service.count) * 100) / 100,
      })),
      serviceFrequency: Object.fromEntries(serviceArray.map((service) => [service.serviceName, service.count])),
      preferredCategories,
      serviceDiversity: Math.round(serviceDiversity * 100) / 100,
      mostFrequentService: sortedByFrequency[0] || null,
      leastFrequentService: sortedByFrequency[sortedByFrequency.length - 1] || null,
      totalUniqueServices: serviceArray.length,
    };
  }

  private async analyzeMemberPreferences(appointments: AppointmentAnalytics[]) {
    if (appointments.length === 0) {
      return {
        topMembers: [],
        memberFrequency: {},
        preferredMemberTypes: [],
        memberLoyalty: 0,
        mostVisitedMember: null,
        memberDiversity: 0,
      };
    }

    // Group appointments by member
    const memberStats = new Map<
      string,
      {
        memberId: string;
        memberName: string;
        count: number;
        totalSpent: number;
        lastVisit: Date;
        averageRating?: number;
      }
    >();

    appointments.forEach((appointment) => {
      const memberId = appointment.memberId || "unknown";
      const memberName = appointment.member?.username || "Unknown Member";
      const price = appointment.price || 0;

      if (!memberStats.has(memberId)) {
        memberStats.set(memberId, {
          memberId,
          memberName,
          count: 0,
          totalSpent: 0,
          lastVisit: appointment.startTime || new Date(),
        });
      }

      const stat = memberStats.get(memberId)!;
      stat.count++;
      stat.totalSpent += price;
      if (appointment.startTime && appointment.startTime > stat.lastVisit) {
        stat.lastVisit = appointment.startTime;
      }
    });

    const memberArray = Array.from(memberStats.values());

    // Sort by frequency and spending
    const sortedByFrequency = memberArray.sort((a, b) => b.count - a.count);
    const sortedBySpending = memberArray.sort((a, b) => b.totalSpent - a.totalSpent);

    // Calculate member diversity (unique members / total appointments)
    const memberDiversity = memberArray.length / appointments.length;

    // Calculate member loyalty (percentage of appointments with top member)
    const topMemberPercentage = sortedByFrequency[0] ? (sortedByFrequency[0].count / appointments.length) * 100 : 0;

    return {
      topMembers: sortedByFrequency.slice(0, 5).map((member) => ({
        memberId: member.memberId,
        memberName: member.memberName,
        count: member.count,
        totalSpent: Math.round(member.totalSpent * 100) / 100,
        percentage: Math.round((member.count / appointments.length) * 100),
        lastVisit: member.lastVisit,
        averageSpent: Math.round((member.totalSpent / member.count) * 100) / 100,
      })),
      topMembersBySpending: sortedBySpending.slice(0, 5).map((member) => ({
        memberId: member.memberId,
        memberName: member.memberName,
        totalSpent: Math.round(member.totalSpent * 100) / 100,
        count: member.count,
        averageSpent: Math.round((member.totalSpent / member.count) * 100) / 100,
      })),
      memberFrequency: Object.fromEntries(memberArray.map((member) => [member.memberName, member.count])),
      memberDiversity: Math.round(memberDiversity * 100) / 100,
      memberLoyalty: Math.round(topMemberPercentage),
      mostVisitedMember: sortedByFrequency[0] || null,
      leastVisitedMember: sortedByFrequency[sortedByFrequency.length - 1] || null,
      totalUniqueMembers: memberArray.length,
      memberRetention: this.calculateMemberRetention(memberArray, appointments),
    };
  }

  private calculateMemberRetention(
    memberStats: Array<{ memberId: string; count: number }>,
    appointments: AppointmentAnalytics[],
  ): number {
    if (memberStats.length === 0 || appointments.length < 2) return 0;

    // Sort appointments by date
    const sortedAppointments = appointments
      .filter((apt) => apt.startTime)
      .sort((a, b) => a.startTime!.getTime() - b.startTime!.getTime());

    if (sortedAppointments.length < 2) return 0;

    // Check if client returns to the same member
    const firstAppointment = sortedAppointments[0];
    const lastAppointment = sortedAppointments[sortedAppointments.length - 1];

    const firstMemberId = firstAppointment.memberId;
    const lastMemberId = lastAppointment.memberId;

    return firstMemberId === lastMemberId ? 100 : 0;
  }

  private async analyzeBehaviorPatterns(appointments: AppointmentAnalytics[], historyStartDate: Date) {
    if (appointments.length === 0) {
      return {
        bookingFrequency: "no_data",
        preferredDays: [],
        preferredTimes: [],
        seasonality: {},
        bookingPatterns: {},
        cancellationRate: 0,
        noShowRate: 0,
        averageGapBetweenVisits: 0,
        consistencyScore: 0,
      };
    }

    // Filter appointments within history period
    const relevantAppointments = appointments.filter((apt) => apt.startTime && apt.startTime >= historyStartDate);

    if (relevantAppointments.length === 0) {
      return {
        bookingFrequency: "no_recent_data",
        preferredDays: [],
        preferredTimes: [],
        seasonality: {},
        bookingPatterns: {},
        cancellationRate: 0,
        noShowRate: 0,
        averageGapBetweenVisits: 0,
        consistencyScore: 0,
      };
    }

    // Analyze booking frequency
    const bookingFrequency = this.calculateBookingFrequency(relevantAppointments, historyStartDate);

    // Analyze preferred days and times
    const { preferredDays, preferredTimes } = this.analyzePreferredSchedule(relevantAppointments);

    // Analyze seasonality
    const seasonality = this.analyzeSeasonality(relevantAppointments);

    // Calculate rates
    const completedAppointments = relevantAppointments.filter((apt) => apt.status === "COMPLETED");
    const cancelledAppointments = relevantAppointments.filter((apt) => apt.status === "CANCELLED");
    const noShowAppointments = relevantAppointments.filter((apt) => apt.status === "NO_SHOW");

    const cancellationRate =
      relevantAppointments.length > 0
        ? Math.round((cancelledAppointments.length / relevantAppointments.length) * 100)
        : 0;

    const noShowRate =
      relevantAppointments.length > 0 ? Math.round((noShowAppointments.length / relevantAppointments.length) * 100) : 0;

    // Calculate average gap between visits
    const averageGapBetweenVisits = this.calculateAverageGap(relevantAppointments);

    // Calculate consistency score (0-100)
    const consistencyScore = this.calculateConsistencyScore(relevantAppointments, historyStartDate);

    return {
      bookingFrequency,
      preferredDays,
      preferredTimes,
      seasonality,
      bookingPatterns: {
        totalAppointments: relevantAppointments.length,
        completedAppointments: completedAppointments.length,
        cancelledAppointments: cancelledAppointments.length,
        noShowAppointments: noShowAppointments.length,
      },
      cancellationRate,
      noShowRate,
      averageGapBetweenVisits: Math.round(averageGapBetweenVisits * 100) / 100,
      consistencyScore: Math.round(consistencyScore),
      lastVisit: relevantAppointments[relevantAppointments.length - 1]?.startTime,
      firstVisit: relevantAppointments[0]?.startTime,
    };
  }

  private calculateBookingFrequency(appointments: AppointmentAnalytics[], startDate: Date): string {
    const now = new Date();
    const daysSinceStart = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSinceStart === 0) return "no_data";

    const appointmentsPerMonth = (appointments.length / daysSinceStart) * 30;

    if (appointmentsPerMonth >= 4) return "frequent"; // Weekly or more
    if (appointmentsPerMonth >= 2) return "regular"; // Bi-weekly
    if (appointmentsPerMonth >= 1) return "occasional"; // Monthly
    if (appointmentsPerMonth >= 0.25) return "infrequent"; // Quarterly
    return "rare"; // Less than quarterly
  }

  private analyzePreferredSchedule(appointments: AppointmentAnalytics[]) {
    const dayCounts = new Array(7).fill(0); // Sunday to Saturday
    const hourCounts = new Array(24).fill(0); // 0-23 hours

    appointments.forEach((appointment) => {
      if (appointment.startTime) {
        const day = appointment.startTime.getDay(); // 0 = Sunday, 6 = Saturday
        const hour = appointment.startTime.getHours();

        dayCounts[day]++;
        hourCounts[hour]++;
      }
    });

    // Get top preferred days
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const preferredDays = dayCounts
      .map((count, index) => ({
        day: dayNames[index],
        count,
        percentage: Math.round((count / appointments.length) * 100),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    // Get top preferred times
    const preferredTimes = hourCounts
      .map((count, hour) => ({ hour, count, percentage: Math.round((count / appointments.length) * 100) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((item) => ({
        time: `${item.hour}:00`,
        count: item.count,
        percentage: item.percentage,
      }));

    return { preferredDays, preferredTimes };
  }

  private analyzeSeasonality(appointments: AppointmentAnalytics[]) {
    const monthlyCounts = new Array(12).fill(0);
    const quarterlyCounts = new Array(4).fill(0);

    appointments.forEach((appointment) => {
      if (appointment.startTime) {
        const month = appointment.startTime.getMonth(); // 0-11
        const quarter = Math.floor(month / 3); // 0-3

        monthlyCounts[month]++;
        quarterlyCounts[quarter]++;
      }
    });

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    return {
      monthly: monthlyCounts.map((count, index) => ({
        month: monthNames[index],
        count,
        percentage: Math.round((count / appointments.length) * 100),
      })),
      quarterly: quarterlyCounts.map((count, index) => ({
        quarter: `Q${index + 1}`,
        count,
        percentage: Math.round((count / appointments.length) * 100),
      })),
      peakMonth: monthNames[monthlyCounts.indexOf(Math.max(...monthlyCounts))],
      peakQuarter: `Q${quarterlyCounts.indexOf(Math.max(...quarterlyCounts)) + 1}`,
    };
  }

  private calculateAverageGap(appointments: AppointmentAnalytics[]): number {
    if (appointments.length < 2) return 0;

    const sortedAppointments = appointments
      .filter((apt) => apt.startTime)
      .sort((a, b) => a.startTime!.getTime() - b.startTime!.getTime());

    const gaps: number[] = [];
    for (let i = 1; i < sortedAppointments.length; i++) {
      const gap = sortedAppointments[i].startTime!.getTime() - sortedAppointments[i - 1].startTime!.getTime();
      gaps.push(gap / (1000 * 60 * 60 * 24)); // Convert to days
    }

    return gaps.length > 0 ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : 0;
  }

  private calculateConsistencyScore(appointments: AppointmentAnalytics[], startDate: Date): number {
    if (appointments.length === 0) return 0;

    const now = new Date();
    const totalDays = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    if (totalDays === 0) return 0;

    // Expected appointments based on frequency
    const actualAppointments = appointments.length;
    const expectedAppointments = Math.max(1, Math.ceil(totalDays / 30)); // At least monthly

    // Calculate consistency based on how close actual is to expected
    const consistencyRatio = Math.min(actualAppointments / expectedAppointments, 2); // Cap at 200%
    return Math.round(consistencyRatio * 50); // 0-100 scale
  }
}

export const clientService = new ClientService();
