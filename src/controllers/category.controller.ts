import { AuthObject } from "@clerk/express";
import { NextFunction, Request, Response } from "express";
import { CategoryService } from "@/services/category.service";
import { AppError, asyncHandler } from "@/middlewares/error.middleware";

// Type for auth object with orgId
type AuthWithOrgId = AuthObject & {
  orgId: string;
};

export class CategoryController {
  private categoryService = new CategoryService();

  public createCategory = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const auth = req.auth as AuthWithOrgId;

    const categoryData = {
      ...req.body,
      orgId: auth.orgId,
    };

    const category = await this.categoryService.createCategory(categoryData);
    res.status(201).json({ success: true, data: category });
  });

  public getCategoryById = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const auth = req.auth as AuthWithOrgId;

    if (!req.params.id) {
      throw new AppError("Category ID is required", 400);
    }
    const category = await this.categoryService.getCategoryById(req.params.id, auth.orgId);

    if (!category) {
      throw new AppError("Category not found", 404);
    }

    res.status(200).json({ success: true, data: category });
  });

  public getAllCategories = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const auth = req.auth as AuthWithOrgId;

    const categories = await this.categoryService.getCategoriesByOrg(auth.orgId);
    res.status(200).json({ success: true, data: categories });
  });

  public getCategoryBySlug = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const auth = req.auth as AuthWithOrgId;
    const { slug } = req.params;

    if (!slug) {
      throw new AppError("Category slug is required", 400);
    }
    const category = await this.categoryService.getCategoryBySlug(slug, auth.orgId);

    if (!category) {
      throw new AppError("Category not found", 404);
    }

    res.status(200).json({ success: true, data: category });
  });
}
