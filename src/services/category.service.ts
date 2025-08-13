import { prisma } from "@/config/prisma";
import { Category } from "@prisma/client";

// Types for Category operations
export interface CreateCategoryInput {
  name: string;
  description?: string;
  orgId: string;
  isActive?: boolean;
}

export interface UpdateCategoryInput {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export class CategoryService {
  // Create a new category
  public async createCategory(data: CreateCategoryInput): Promise<Category> {
    return await prisma.category.create({
      data: {
        name: data.name,
        orgId: data.orgId,
        description: data.description || "",
      },
    });
  }

  // Get category by ID (with orgId check for multi-tenancy)
  public async getCategoryById(id: string, orgId: string): Promise<Category | null> {
    return await prisma.category.findFirst({
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
  public async updateCategory(id: string, orgId: string, data: UpdateCategoryInput): Promise<Category> {
    return await prisma.category.update({
      where: {
        id,
      },
      data: {
        ...data,
        // Ensure we can't change orgId
        orgId,
      },
    });
  }

  // Delete category (this will cascade delete all services)
  public async deleteCategory(id: string, orgId: string): Promise<Category> {
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

  // Check if category exists in organization
  public async categoryExists(name: string, orgId: string): Promise<boolean> {
    const category = await prisma.category.findFirst({
      where: {
        name,
        orgId,
      },
      select: { id: true },
    });
    return !!category;
  }

  // Get category by name within organization
  public async getCategoryByName(name: string, orgId: string): Promise<Category | null> {
    return await prisma.category.findFirst({
      where: {
        name,
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
