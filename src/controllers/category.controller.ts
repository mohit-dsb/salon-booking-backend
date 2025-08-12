import { CategoryService } from "@/services/category.service";
import { NextFunction, Request, Response } from "express";
import { AppError, asyncHandler } from "@/middlewares/error.middleware";

export class CategoryController {
  private categoryService = new CategoryService();

  public createCategory = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    if (!req.auth.orgId) {
      throw new AppError("Organization ID is required. User must be part of an organization.", 401);
    }

    const categoryData = {
      ...req.body,
      orgId: req.auth.orgId,
    };

    const category = await this.categoryService.createCategory(categoryData);
    res.status(201).json(category);
  });

  public getCategoryById = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    if (!req.params.id) {
      throw new AppError("Category ID is required", 400);
    }

    if (!req.auth.orgId) {
      throw new AppError("Organization ID is required. User must be part of an organization.", 401);
    }

    const category = await this.categoryService.getCategoryById(req.auth.orgId, req.params.id);

    if (!category) {
      throw new AppError("Category not found", 404);
    }

    res.status(200).json(category);
  });
}
