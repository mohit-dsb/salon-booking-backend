import { NextFunction, Request, Response } from "express";
import { getAuthWithOrgId } from "@/middlewares/auth.middleware";
import { AppError, asyncHandler } from "@/middlewares/error.middleware";
import { parsePaginationParams, PaginationQuery } from "@/utils/pagination";
import { CategoryService, type IUpdateCategory, type ICreateCategory } from "@/services/category.service";

export class CategoryController {
  private categoryService = new CategoryService();

  public createCategory = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const auth = await getAuthWithOrgId(req);

    const categoryData = {
      ...(req.parsedBody as ICreateCategory),
      orgId: auth.orgId,
    };

    const category = await this.categoryService.createCategory(categoryData);
    res.status(201).json({ success: true, data: category });
  });

  public getCategoryById = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const auth = await getAuthWithOrgId(req);

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
    const auth = await getAuthWithOrgId(req);

    // Use paginated response
    const pagination = parsePaginationParams(req.query as PaginationQuery, "createdAt");
    const result = await this.categoryService.getCategoriesByOrgPaginated(auth.orgId, pagination);
    res.status(200).json(result);
  });

  public getCategoryBySlug = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const auth = await getAuthWithOrgId(req);
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

  public deleteCategory = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const auth = await getAuthWithOrgId(req);
    const { slug } = req.params;

    if (!slug) {
      throw new AppError("Category slug is required", 400);
    }

    const category = await this.categoryService.getCategoryBySlug(slug, auth.orgId);

    if (!category) {
      throw new AppError("Category not found", 404);
    }

    await this.categoryService.deleteCategory(category.id);
    res.status(204).send();
  });

  public updateCategory = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const auth = await getAuthWithOrgId(req);
    const { slug } = req.params;

    if (!slug) {
      throw new AppError("Category slug is required", 400);
    }

    const category = await this.categoryService.getCategoryBySlug(slug, auth.orgId);

    if (!category) {
      throw new AppError("Category not found", 404);
    }

    const updatedCategory = await this.categoryService.updateCategory(
      category.id,
      auth.orgId,
      req.parsedBody as IUpdateCategory,
    );
    res.status(200).json({ success: true, data: updatedCategory });
  });
}
