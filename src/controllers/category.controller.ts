import { CategoryService } from "@/services/category.service";
import { NextFunction, Request, Response } from "express";
import { AppError, asyncHandler } from "@/middlewares/error.middleware";
import { getAuth } from "@clerk/express";

export class CategoryController {
  private categoryService = new CategoryService();

  public createCategory = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const auth = getAuth(req);

    auth.orgId = process.env.ORG_ID || auth.orgId;
    if (!auth.orgId) {
      throw new AppError("Organization ID is required. User must be part of an organization.", 401);
    }

    const categoryData = {
      ...req.body,
      orgId: auth.orgId,
    };

    const category = await this.categoryService.createCategory(categoryData);
    res.status(201).json({ success: true, data: category });
  });

  public getCategoryById = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    if (!req.params.id) {
      throw new AppError("Category ID is required", 400);
    }

    const auth = getAuth(req);
    auth.orgId = process.env.ORG_ID || auth.orgId;

    if (!auth.orgId) {
      throw new AppError("Organization ID is required. User must be part of an organization.", 401);
    }

    const category = await this.categoryService.getCategoryById(req.params.id, auth.orgId);

    if (!category) {
      throw new AppError("Category not found", 404);
    }

    res.status(200).json({ success: true, data: category });
  });

  public getAllCategories = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const auth = getAuth(req);
    auth.orgId = "org_31EIOJRoyYVVnmybWQkpEdGjaC8";

    if (!auth.orgId) {
      throw new AppError("Organization ID is required. User must be part of an organization.", 401);
    }

    const categories = await this.categoryService.getCategoriesByOrg(auth.orgId);
    res.status(200).json({ success: true, data: categories });
  });
}
