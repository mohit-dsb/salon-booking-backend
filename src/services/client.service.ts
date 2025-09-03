import { logger } from "@/utils/logger";
import { prisma } from "@/config/prisma";
import { cacheService } from "./cache.service";
import { Client, Prisma } from "@prisma/client";
import { handleError } from "@/utils/errorHandler";
import { AppError } from "@/middlewares/error.middleware";
import type { PaginationParams } from "@/utils/pagination";
import type { ClientSummaryParams, ClientListAnalyticsParams, ClientInsightsParams } from "@/validations/client.schema";

export interface CreateClientData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  dateOfBirth?: string;
  address?: Record<string, unknown>;
  notes?: string;
  preferences?: Record<string, unknown>;
}

export interface UpdateClientData {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  address?: Record<string, unknown>;
  notes?: string;
  preferences?: Record<string, unknown>;
}

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
  [key: string]: unknown;
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
        includeRecommendations = false,
        historyMonths = 12,
        compareWithAverage = false,
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

      // Recommendations
      if (includeRecommendations) {
        insights.recommendations = await this.generateClientRecommendations(orgId, client, insights);
      }

      // Compare with average client if requested
      if (compareWithAverage) {
        insights.averageComparison = await this.compareWithAverageClient(orgId, insights, historyStartDate);
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
    _orgId: string,
    _appointmentWhere: Prisma.AppointmentWhereInput,
    _groupBy: string,
    _dateRange: { start: Date; end: Date },
  ) {
    // Implementation for client trends over time
    return [];
  }

  private async getClientSegmentation(_orgId: string, _dateRange: { start: Date; end: Date }) {
    // Implementation for client segmentation analysis
    return {};
  }

  private async getPreviousPeriodComparison(
    _orgId: string,
    _dateRange: { start: Date; end: Date },
    _params: ClientSummaryParams,
  ) {
    // Implementation for previous period comparison
    return {};
  }

  private async applyClientTypeFilter(
    _clientWhere: Prisma.ClientWhereInput,
    _clientType: string,
    _dateRange: { start: Date; end: Date } | null,
    _orgId: string,
  ) {
    // Implementation for client type filtering
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
    _orgId: string,
    _filters: {
      minSpent?: number;
      maxSpent?: number;
      minAppointments?: number;
      maxAppointments?: number;
      dateRange?: { start: Date; end: Date } | null;
    },
  ): Promise<string[]> {
    // Implementation for complex filtering by spending and appointment counts
    return [];
  }

  private async enrichClientsWithAnalytics(
    clients: Array<Record<string, unknown>>,
    _includeDetails: string[],
    _dateRange: { start: Date; end: Date } | null,
  ) {
    // Implementation for enriching client data with analytics
    return clients;
  }

  private async calculateListSummaryStats(
    _clientWhere: Prisma.ClientWhereInput,
    _dateRange: { start: Date; end: Date } | null,
  ) {
    // Implementation for summary statistics
    return {
      totalClients: 0,
      averageSpending: 0,
      averageAppointments: 0,
    };
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

  private async analyzeServicePreferences(_appointments: AppointmentAnalytics[]) {
    // Implementation for service preference analysis
    return {};
  }

  private async analyzeMemberPreferences(_appointments: AppointmentAnalytics[]) {
    // Implementation for member preference analysis
    return {};
  }

  private async analyzeBehaviorPatterns(_appointments: AppointmentAnalytics[], _historyStartDate: Date) {
    // Implementation for behavior pattern analysis
    return {};
  }

  private async generateClientRecommendations(
    _orgId: string,
    _client: Record<string, unknown>,
    _insights: Record<string, unknown>,
  ) {
    // Implementation for generating recommendations
    return [];
  }

  private async compareWithAverageClient(_orgId: string, _insights: Record<string, unknown>, _historyStartDate: Date) {
    // Implementation for comparing with average client metrics
    return {};
  }
}

export const clientService = new ClientService();
