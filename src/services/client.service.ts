import { logger } from "@/utils/logger";
import { prisma } from "@/config/prisma";
import { cacheService } from "./cache.service";
import { Client, Prisma } from "@prisma/client";
import { handleError } from "@/utils/errorHandler";
import { AppError } from "@/middlewares/error.middleware";
import type { PaginationParams } from "@/utils/pagination";

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
      };

      if (data.phone) createData.phone = data.phone;
      if (data.notes) createData.notes = data.notes;
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
}

export const clientService = new ClientService();
