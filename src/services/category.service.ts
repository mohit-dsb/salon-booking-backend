import { prisma } from "@/config/prisma";
import { Category } from "@prisma/client";
import { createSlug } from "@/utils/slugify";
import { AppError } from "@/middlewares/error.middleware";

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

    return await prisma.category.create({
      data: {
        name: data.name.trim(), // Store original casing for display
        slug: slug, // Store URL-friendly slug for uniqueness
        orgId: data.orgId,
        description: data.description?.trim() || "",
      },
    });
  }

  // Get category by ID (with orgId check for multi-tenancy)
  public async getCategoryById(id: string, orgId: string): Promise<Category | null> {
    return await prisma.category.findUnique({
      where: {
        id,
        orgId,
      },
      include: {
        services: true,
      },
    });
  }

  // Get all categories for an organization
  public async getCategoriesByOrg(orgId: string): Promise<Category[]> {
    return await prisma.category.findMany({
      where: { orgId },
      include: {
        services: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // Get only active categories for an organization
  public async getActiveCategoriesByOrg(orgId: string): Promise<Category[]> {
    return await prisma.category.findMany({
      where: {
        orgId,
        isActive: true,
      },
      include: {
        services: {
          where: {
            isActive: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });
  }

  // Update category
  public async updateCategory(id: string, orgId: string, data: IUpdateCategory): Promise<Category> {
    const updateData: any = { ...data, orgId };

    // If name is being updated, also update the slug
    if (data.name) {
      updateData.name = data.name.trim();
      updateData.slug = await this.generateUniqueSlug(data.name, orgId, id);
    }

    return await prisma.category.update({
      where: {
        id,
      },
      data: updateData,
    });
  }

  // Delete category (this will cascade delete all services)
  public async deleteCategory(id: string): Promise<Category> {
    return await prisma.category.delete({
      where: {
        id,
      },
    });
  }

  // Soft delete - deactivate category
  public async deactivateCategory(id: string, orgId: string): Promise<Category> {
    return await prisma.category.update({
      where: {
        id,
      },
      data: {
        isActive: false,
        orgId, // Ensure orgId check
      },
    });
  }

  // Activate category
  public async activateCategory(id: string, orgId: string): Promise<Category> {
    return await prisma.category.update({
      where: {
        id,
      },
      data: {
        isActive: true,
        orgId, // Ensure orgId check
      },
    });
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

  // Get category by name within organization (using slug for exact matching)
  public async getCategoryByName(name: string, orgId: string): Promise<Category | null> {
    const slug = createSlug(name);
    return await prisma.category.findFirst({
      where: {
        slug: slug,
        orgId,
      },
      include: {
        services: true,
      },
    });
  }

  // Get category by slug within organization
  public async getCategoryBySlug(slug: string, orgId: string): Promise<Category | null> {
    return await prisma.category.findFirst({
      where: {
        slug,
        orgId,
      },
      include: {
        services: true,
      },
    });
  }

  // Count categories in organization
  public async countCategories(orgId: string): Promise<number> {
    return await prisma.category.count({
      where: { orgId },
    });
  }

  // Search categories by name within organization
  public async searchCategories(searchTerm: string, orgId: string): Promise<Category[]> {
    return await prisma.category.findMany({
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
  }
}
