import { logger } from "@/utils/logger";
import { prisma } from "@/config/prisma";
import { cacheService } from "./cache.service";
import { Client, Prisma } from "@prisma/client";
import { handleError } from "@/utils/errorHandler";
import { AppError } from "@/middlewares/error.middleware";
import type { PaginationParams } from "@/utils/pagination";
import type {
  ClientListAnalyticsParams,
  CreateClientData,
  GetAllClientsParams,
  UpdateClientData,
} from "@/validations/client.schema";

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

export interface ClientWithTotalSpent extends Client {
  totalSpent: number;
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
      if (data.addresses && data.addresses.length > 0) createData.addresses = data.addresses;

      // Additional info fields
      if (data.clientSource) {
        createData.clientSource = data.clientSource;
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
      
      // Emergency contact details
      if (data.primaryEmergencyContactFullName) {
        createData.primaryEmergencyContactFullName = data.primaryEmergencyContactFullName.trim();
      }
      if (data.primaryEmergencyContactPhone) {
        createData.primaryEmergencyContactPhone = data.primaryEmergencyContactPhone.trim();
      }
      if (data.primaryEmergencyContactEmail) {
        createData.primaryEmergencyContactEmail = data.primaryEmergencyContactEmail.toLowerCase().trim();
      }
      if (data.primaryEmergencyContactRelation) {
        createData.primaryEmergencyContactRelation = data.primaryEmergencyContactRelation.trim();
      }

      if (data.secondaryEmergencyContactFullName) {
        createData.secondaryEmergencyContactFullName = data.secondaryEmergencyContactFullName.trim();
      }
      if (data.secondaryEmergencyContactPhone) {
        createData.secondaryEmergencyContactPhone = data.secondaryEmergencyContactPhone.trim();
      }
      if (data.secondaryEmergencyContactEmail) {
        createData.secondaryEmergencyContactEmail = data.secondaryEmergencyContactEmail.toLowerCase().trim();
      }
      if (data.secondaryEmergencyContactRelation) {
        createData.secondaryEmergencyContactRelation = data.secondaryEmergencyContactRelation.trim();
      }

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

  // Update client
  public async updateClient(id: string, orgId: string, data: UpdateClientData): Promise<ClientWithAppointments> {
    await this.validateOrgMembership(orgId);

    if (!id || id.trim() === "") {
      throw new AppError("Client ID is required", 400);
    }

    // Get existing client to verify it exists and get current data
    const existingClient = await this.getClientById(id, orgId);

    // Prepare update data
    const updateData: Record<string, unknown> = {};

    // Handle core fields that might have uniqueness constraints
    if (data.email !== undefined && data.email !== existingClient.email) {
      // Check if email is already taken by another client in this organization
      const emailExists = await prisma.client.findUnique({
        where: {
          email_orgId: {
            email: data.email,
            orgId,
          },
        },
      });

      if (emailExists && emailExists.id !== id) {
        throw new AppError("Email is already taken by another client", 400);
      }

      updateData.email = data.email;
    }

    // Handle other updatable fields
    const fieldsToUpdate = [
      "firstName",
      "lastName",
      "phone",
      "gender",
      "dateOfBirth",
      "addresses",
      "clientSource",
      "referredBy",
      "preferredLanguage",
      "occupation",
      "country",
      "additionalEmail",
      "additionalPhone",
      "notifyByEmail",
      "notifyBySMS",
      "notifyByWhatsapp",
      "allowEmailMarketing",
      "allowSMSMarketing",
      "allowWhatsappMarketing",
      "isActive",
    ];

    fieldsToUpdate.forEach((field) => {
      if (data[field as keyof UpdateClientData] !== undefined) {
        updateData[field] = data[field as keyof UpdateClientData];
      }
    });

    // Handle date parsing for dateOfBirth if provided
    if (data.dateOfBirth !== undefined) {
      updateData.dateOfBirth =
        typeof data.dateOfBirth === "string" ? this.parseDate(data.dateOfBirth) : data.dateOfBirth;
    }

    try {
      // Update client in database
      const updatedClient = await prisma.client.update({
        where: { id },
        data: updateData,
        include: {
          appointments: {
            orderBy: { startTime: "desc" },
            take: 5,
            include: {
              service: {
                select: { name: true },
              },
            },
          },
        },
      });

      // Invalidate caches
      await this.invalidateClientCache(orgId);

      logger.info("Client updated successfully", {
        clientId: id,
        orgId,
        updatedFields: Object.keys(updateData),
      });

      return updatedClient;
    } catch (error: unknown) {
      logger.error("Failed to update client", {
        clientId: id,
        orgId,
        error: error instanceof Error ? error.message : "Unknown error",
        updatedFields: Object.keys(updateData),
      });

      if (error instanceof AppError) {
        throw error;
      }

      handleError(error, "updateClient", "Failed to update client");
    }
  }

  // Get all clients with pagination and filters
  public async getAllClients(
    orgId: string,
    pagination: PaginationParams,
    filters: GetAllClientsParams,
  ): Promise<{
    clients: ClientWithTotalSpent[];
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
      clients: ClientWithTotalSpent[];
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

    const [clientsData, total] = await Promise.all([
      prisma.client.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { [filters.sortBy]: filters.sortOrder },
        include: {
          appointments: {
            where: {
              status: "COMPLETED",
            },
            select: {
              price: true,
            },
          },
        },
      }),
      prisma.client.count({ where }),
    ]);

    // Calculate total spent for each client
    const clients: ClientWithTotalSpent[] = clientsData.map((client) => ({
      ...client,
      totalSpent: client.appointments.reduce((sum, appointment) => sum + appointment.price, 0),
    }));

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
