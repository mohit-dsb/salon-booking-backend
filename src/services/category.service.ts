import { prisma } from "@/config/prisma";
import { AppError } from "@/middlewares/error.middleware";
import { Category } from "@prisma/client";

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
  // Helper method to normalize category names
  private normalizeName(name: string): string {
    return name.trim().toLowerCase();
  }

  // Create a new category
  public async createCategory(data: ICreateCategory): Promise<Category> {
    const normalizedName = this.normalizeName(data.name);
    
    if (await this.categoryExists(data.name, data.orgId)) {
      throw new AppError("Category already exists", 400);
    }
    
    return await prisma.category.create({
      data: {
        name: data.name.trim(), // Store original casing for display
        nameNormalized: normalizedName, // Store normalized for uniqueness
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
    
    // If name is being updated, also update the normalized field
    if (data.name) {
      updateData.name = data.name.trim();
      updateData.nameNormalized = this.normalizeName(data.name);
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

  // Check if category exists in organization (using normalized field for exact matching)
  public async categoryExists(name: string, orgId: string): Promise<boolean> {
    const normalizedName = this.normalizeName(name);
    const category = await prisma.category.findFirst({
      where: {
        nameNormalized: normalizedName,
        orgId,
      },
      select: { id: true },
    });
    return !!category;
  }

  // Get category by name within organization (using normalized field for exact matching)
  public async getCategoryByName(name: string, orgId: string): Promise<Category | null> {
    const normalizedName = this.normalizeName(name);
    return await prisma.category.findFirst({
      where: {
        nameNormalized: normalizedName,
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
