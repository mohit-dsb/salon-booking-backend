import { prisma } from "@/config/prisma";
import { Category } from "@prisma/client";
import { createSlug } from "@/utils/slugify";
import { cacheService } from "./cache.service";
import { AppError } from "@/middlewares/error.middleware";
import { PaginationParams, createPaginatedResponse, PaginatedResponse } from "@/utils/pagination";

// Types for Category operations
export interface ICreateCategory {
  name: string;
  description?: string;
  orgId: string;
  isActive?: boolean;
}

export interface IUpdateCategory {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export class CategoryService {
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
    const category = await prisma.category.findFirst({
      where: {
        slug,
        orgId,
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true },
    });
    return !!category;
  }

  // Create a new category
  public async createCategory(data: ICreateCategory): Promise<Category> {
    const slug = await this.generateUniqueSlug(data.name, data.orgId);

    if (await this.categoryExists(data.name, data.orgId)) {
      throw new AppError("Category already exists", 400);
    }

    const category = await prisma.category.create({
      data: {
        name: data.name.trim(), // Store original casing for display
        slug: slug, // Store URL-friendly slug for uniqueness
        orgId: data.orgId,
        description: data.description?.trim() || "",
      },
    });

    // Invalidate cache after creation
    await cacheService.invalidatePattern(`category:${data.orgId}:*`);

    return category;
  }

  // Get category by ID (with orgId check for multi-tenancy)
  public async getCategoryById(id: string, orgId: string): Promise<Category | null> {
    const cacheKey = `category:${orgId}:id:${id}`;

    // Try to get from cache first
    const cached = await cacheService.get<Category>(cacheKey);
    if (cached) {
      return cached;
    }

    // If not in cache, fetch from database
    const category = await prisma.category.findUnique({
      where: {
        id,
        orgId,
      },
      include: {
        services: true,
      },
    });

    if (category) {
      // Cache the result for 1 hour
      await cacheService.set(cacheKey, category, 3600);
    }

    return category;
  }

  // Get all categories for an organization with pagination
  public async getCategoriesByOrg(orgId: string, pagination: PaginationParams): Promise<PaginatedResponse<Category>> {
    const cacheKey = `category:${orgId}:paginated:${pagination.page}:${pagination.limit}:${pagination.sortBy}:${pagination.sortOrder}`;

    // Try to get from cache first
    const cached = await cacheService.get<PaginatedResponse<Category>>(cacheKey);
    if (cached) {
      return cached;
    }

    // Get total count for pagination metadata
    const totalItems = await prisma.category.count({
      where: { orgId },
    });

    // Build orderBy based on sortBy and sortOrder
    const orderBy: Record<string, "asc" | "desc"> = {};
    orderBy[pagination.sortBy] = pagination.sortOrder;

    // If not in cache, fetch from database with pagination
    const categories = await prisma.category.findMany({
      where: { orgId },
      include: {
        services: true,
      },
      orderBy,
      skip: pagination.skip,
      take: pagination.limit,
    });

    // Create paginated response
    const paginatedResponse = createPaginatedResponse(categories, totalItems, pagination.page, pagination.limit);

    // Cache the result for 30 minutes (shorter TTL for paginated data)
    await cacheService.set(cacheKey, paginatedResponse, 1800);

    return paginatedResponse;
  }

  // Update category
  public async updateCategory(id: string, orgId: string, data: IUpdateCategory): Promise<Category> {
    const updateData: Record<string, unknown> = { ...data, orgId };

    // If name is being updated, also update the slug
    if (data.name) {
      updateData.name = data.name.trim();
      updateData.slug = await this.generateUniqueSlug(data.name, orgId, id);
    }

    if (data.description) {
      updateData.description = data.description?.trim() || "";
    }

    const category = await prisma.category.update({
      where: {
        id,
      },
      data: updateData,
    });

    // Invalidate all related cache entries
    await cacheService.invalidatePattern(`category:${orgId}:*`);

    return category;
  }

  // Delete category (this will cascade delete all services)
  public async deleteCategory(id: string): Promise<Category> {
    const category = await prisma.category.delete({
      where: {
        id,
      },
    });

    // Invalidate all related cache entries
    await cacheService.invalidatePattern(`category:${category.orgId}:*`);

    return category;
  }

  // Soft delete - deactivate category
  public async deactivateCategory(id: string, orgId: string): Promise<Category> {
    const category = await prisma.category.update({
      where: {
        id,
      },
      data: {
        isActive: false,
        orgId, // Ensure orgId check
      },
    });

    // Invalidate all related cache entries
    await cacheService.invalidatePattern(`category:${orgId}:*`);

    return category;
  }

  // Activate category
  public async activateCategory(id: string, orgId: string): Promise<Category> {
    const category = await prisma.category.update({
      where: {
        id,
      },
      data: {
        isActive: true,
        orgId, // Ensure orgId check
      },
    });

    // Invalidate all related cache entries
    await cacheService.invalidatePattern(`category:${orgId}:*`);

    return category;
  }

  // Check if category exists in organization (using slug for exact matching)
  public async categoryExists(name: string, orgId: string): Promise<boolean> {
    const slug = createSlug(name);
    const category = await prisma.category.findFirst({
      where: {
        slug: slug,
        orgId,
      },
      select: { id: true },
    });
    return !!category;
  }

  // Get category by slug within organization
  public async getCategoryBySlug(slug: string, orgId: string): Promise<Category | null> {
    const cacheKey = `category:${orgId}:slug:${slug}`;

    // Try to get from cache first
    const cached = await cacheService.get<Category>(cacheKey);
    if (cached) {
      return cached;
    }

    // If not in cache, fetch from database
    const category = await prisma.category.findFirst({
      where: {
        slug,
        orgId,
      },
      include: {
        services: true,
      },
    });

    if (category) {
      // Cache the result for 1 hour
      await cacheService.set(cacheKey, category, 3600);
    }

    return category;
  }

  // Count categories in organization
  public async countCategories(orgId: string): Promise<number> {
    return await prisma.category.count({
      where: { orgId },
    });
  }

  // Search categories by name within organization
  public async searchCategories(searchTerm: string, orgId: string): Promise<Category[]> {
    const normalizedSearchTerm = searchTerm.toLowerCase().trim();
    const cacheKey = `category:${orgId}:search:${normalizedSearchTerm}`;

    // Try to get from cache first
    const cached = await cacheService.get<Category[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // If not in cache, fetch from database
    const categories = await prisma.category.findMany({
      where: {
        orgId,
        name: {
          contains: searchTerm,
          mode: "insensitive",
        },
      },
      include: {
        services: true,
      },
      orderBy: { name: "asc" },
    });

    // Cache the result for 30 minutes (shorter TTL for search results)
    await cacheService.set(cacheKey, categories, 1800);

    return categories;
  }
}
