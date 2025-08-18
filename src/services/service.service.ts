import { prisma } from "@/config/prisma";
import { Service } from "@prisma/client";
import { createSlug } from "@/utils/slugify";
import { cacheService } from "./cache.service";
import { AppError } from "@/middlewares/error.middleware";

// Types for Service operations
export interface ICreateService {
  name: string;
  description?: string;
  price: number;
  duration: number;
  categoryId: string;
  orgId: string;
  isActive?: boolean;
}

export interface IUpdateService {
  name?: string;
  description?: string;
  price?: number;
  duration?: number;
  categoryId?: string;
  isActive?: boolean;
}

export class ServiceService {
  // Helper method to generate unique slug (handles collisions)
  private async generateUniqueSlug(name: string, orgId: string, excludeId?: string): Promise<string> {
    const baseSlug = createSlug(name);
    let slug = baseSlug;
    let counter = 1;

    while (await this.slugExists(slug, orgId, excludeId)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  // Check if slug exists in organization
  private async slugExists(slug: string, orgId: string, excludeId?: string): Promise<boolean> {
    const service = await prisma.service.findFirst({
      where: {
        slug,
        orgId,
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true },
    });
    return !!service;
  }

  // Create a new service
  public async createService(data: ICreateService): Promise<Service> {
    const slug = await this.generateUniqueSlug(data.name, data.orgId);

    // Check if category exists and belongs to the organization
    const category = await prisma.category.findFirst({
      where: {
        id: data.categoryId,
        orgId: data.orgId,
      },
    });

    if (!category) {
      throw new AppError("Category not found or does not belong to your organization", 404);
    }

    if (await this.serviceExists(data.name, data.orgId)) {
      throw new AppError("Service already exists", 400);
    }

    const service = await prisma.service.create({
      data: {
        name: data.name.trim(),
        slug: slug,
        description: data.description?.trim() || "",
        price: data.price,
        duration: data.duration,
        categoryId: data.categoryId,
        orgId: data.orgId,
        isActive: data.isActive ?? true,
      },
      include: {
        category: true,
      },
    });

    // Invalidate cache after creation
    await cacheService.invalidatePattern(`service:${data.orgId}:*`);
    await cacheService.invalidatePattern(`category:${data.orgId}:*`); // Also invalidate category cache as it includes services

    return service;
  }

  // Get service by ID (with orgId check for multi-tenancy)
  public async getServiceById(id: string, orgId: string): Promise<Service | null> {
    const cacheKey = `service:${orgId}:id:${id}`;

    // Try to get from cache first
    const cached = await cacheService.get<Service>(cacheKey);
    if (cached) {
      return cached;
    }

    // If not in cache, fetch from database
    const service = await prisma.service.findFirst({
      where: {
        id,
        orgId,
      },
      include: {
        category: true,
      },
    });

    if (service) {
      // Cache the result for 1 hour
      await cacheService.set(cacheKey, service, 3600);
    }

    return service;
  }

  // Get all services for an organization
  public async getServicesByOrg(orgId: string): Promise<Service[]> {
    const cacheKey = `service:${orgId}:all`;

    // Try to get from cache first
    const cached = await cacheService.get<Service[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // If not in cache, fetch from database
    const services = await prisma.service.findMany({
      where: { orgId },
      include: {
        category: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Cache the result for 1 hour
    await cacheService.set(cacheKey, services, 3600);

    return services;
  }

  // Get services by category
  public async getServicesByCategory(categoryId: string, orgId: string): Promise<Service[]> {
    const cacheKey = `service:${orgId}:category:${categoryId}`;

    // Try to get from cache first
    const cached = await cacheService.get<Service[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // If not in cache, fetch from database
    const services = await prisma.service.findMany({
      where: {
        categoryId,
        orgId,
      },
      include: {
        category: false,
      },
      orderBy: { name: "asc" },
    });

    // Cache the result for 1 hour
    await cacheService.set(cacheKey, services, 3600);

    return services;
  }

  // Get only active services for an organization
  public async getActiveServicesByOrg(orgId: string): Promise<Service[]> {
    const cacheKey = `service:${orgId}:active`;

    // Try to get from cache first
    const cached = await cacheService.get<Service[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // If not in cache, fetch from database
    const services = await prisma.service.findMany({
      where: {
        orgId,
        isActive: true,
        category: {
          isActive: true,
        },
      },
      include: {
        category: true,
      },
      orderBy: { name: "asc" },
    });

    // Cache the result for 1 hour
    await cacheService.set(cacheKey, services, 3600);

    return services;
  }

  // Update service
  public async updateService(id: string, orgId: string, data: IUpdateService): Promise<Service> {
    const updateData: Record<string, unknown> = { ...data, orgId };

    // If name is being updated, also update the slug
    if (data.name) {
      updateData.name = data.name.trim();
      updateData.slug = await this.generateUniqueSlug(data.name, orgId, id);
    }

    // If categoryId is being updated, verify it belongs to the organization
    if (data.categoryId) {
      const category = await prisma.category.findFirst({
        where: {
          id: data.categoryId,
          orgId: orgId,
        },
      });

      if (!category) {
        throw new AppError("Category not found or does not belong to your organization", 404);
      }
    }

    const service = await prisma.service.update({
      where: {
        id,
      },
      data: updateData,
      include: {
        category: false,
      },
    });

    // Invalidate all related cache entries
    await cacheService.invalidatePattern(`service:${orgId}:*`);
    await cacheService.invalidatePattern(`category:${orgId}:*`); // Also invalidate category cache as it includes services

    return service;
  }

  // Delete service
  public async deleteService(id: string, orgId: string): Promise<Service> {
    // Verify service belongs to organization
    const service = await this.getServiceById(id, orgId);
    if (!service) {
      throw new AppError("Service not found or does not belong to your organization", 404);
    }

    const deletedService = await prisma.service.delete({
      where: {
        id,
      },
    });

    // Invalidate all related cache entries
    await cacheService.invalidatePattern(`service:${orgId}:*`);
    await cacheService.invalidatePattern(`category:${orgId}:*`); // Also invalidate category cache as it includes services

    return deletedService;
  }

  // Soft delete - deactivate service
  public async deactivateService(id: string, orgId: string): Promise<Service> {
    const service = await prisma.service.update({
      where: {
        id,
      },
      data: {
        isActive: false,
        orgId, // Ensure orgId check
      },
      include: {
        category: true,
      },
    });

    // Invalidate all related cache entries
    await cacheService.invalidatePattern(`service:${orgId}:*`);
    await cacheService.invalidatePattern(`category:${orgId}:*`); // Also invalidate category cache as it includes services

    return service;
  }

  // Activate service
  public async activateService(id: string, orgId: string): Promise<Service> {
    const service = await prisma.service.update({
      where: {
        id,
      },
      data: {
        isActive: true,
        orgId, // Ensure orgId check
      },
      include: {
        category: true,
      },
    });

    // Invalidate all related cache entries
    await cacheService.invalidatePattern(`service:${orgId}:*`);
    await cacheService.invalidatePattern(`category:${orgId}:*`); // Also invalidate category cache as it includes services

    return service;
  }

  // Check if service exists in organization
  public async serviceExists(name: string, orgId: string): Promise<boolean> {
    const slug = createSlug(name);
    const service = await prisma.service.findFirst({
      where: {
        slug: slug,
        orgId,
      },
      select: { id: true },
    });
    return !!service;
  }

  // Get service by name within organization
  public async getServiceByName(name: string, orgId: string): Promise<Service | null> {
    const slug = createSlug(name);
    return await prisma.service.findFirst({
      where: {
        slug: slug,
        orgId,
      },
      include: {
        category: true,
      },
    });
  }

  // Get service by slug within organization
  public async getServiceBySlug(slug: string, orgId: string): Promise<Service | null> {
    const cacheKey = `service:${orgId}:slug:${slug}`;

    // Try to get from cache first
    const cached = await cacheService.get<Service>(cacheKey);
    if (cached) {
      return cached;
    }

    // If not in cache, fetch from database
    const service = await prisma.service.findFirst({
      where: {
        slug,
        orgId,
      },
      include: {
        category: false,
      },
    });

    if (service) {
      // Cache the result for 1 hour
      await cacheService.set(cacheKey, service, 3600);
    }

    return service;
  }

  // Count services in organization
  public async countServices(orgId: string): Promise<number> {
    return await prisma.service.count({
      where: { orgId },
    });
  }

  // Search services by name within organization
  public async searchServices(searchTerm: string, orgId: string): Promise<Service[]> {
    const normalizedSearchTerm = searchTerm.toLowerCase().trim();
    const cacheKey = `service:${orgId}:search:${normalizedSearchTerm}`;

    // Try to get from cache first
    const cached = await cacheService.get<Service[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // If not in cache, fetch from database
    const services = await prisma.service.findMany({
      where: {
        orgId,
        OR: [
          {
            name: {
              contains: searchTerm,
              mode: "insensitive",
            },
          },
          {
            description: {
              contains: searchTerm,
              mode: "insensitive",
            },
          },
        ],
      },
      include: {
        category: true,
      },
      orderBy: { name: "asc" },
    });

    // Cache the result for 30 minutes (shorter TTL for search results)
    await cacheService.set(cacheKey, services, 1800);

    return services;
  }

  // Get services with price range filter
  public async getServicesByPriceRange(orgId: string, minPrice?: number, maxPrice?: number): Promise<Service[]> {
    const cacheKey = `service:${orgId}:price:${minPrice || 0}:${maxPrice || "max"}`;

    // Try to get from cache first
    const cached = await cacheService.get<Service[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // If not in cache, fetch from database
    const services = await prisma.service.findMany({
      where: {
        orgId,
        isActive: true,
        ...(minPrice && { price: { gte: minPrice } }),
        ...(maxPrice && { price: { lte: maxPrice } }),
      },
      include: {
        category: true,
      },
      orderBy: { price: "asc" },
    });

    // Cache the result for 1 hour
    await cacheService.set(cacheKey, services, 3600);

    return services;
  }

  // Get services with duration filter
  public async getServicesByDuration(orgId: string, maxDuration?: number): Promise<Service[]> {
    const cacheKey = `service:${orgId}:duration:${maxDuration || "max"}`;

    // Try to get from cache first
    const cached = await cacheService.get<Service[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // If not in cache, fetch from database
    const services = await prisma.service.findMany({
      where: {
        orgId,
        isActive: true,
        ...(maxDuration && { duration: { lte: maxDuration } }),
      },
      include: {
        category: true,
      },
      orderBy: { duration: "asc" },
    });

    // Cache the result for 1 hour
    await cacheService.set(cacheKey, services, 3600);

    return services;
  }
}
