import { Router } from "express";
import { validate } from "@/middlewares/validation.middleware";
import { requireAuthWithOrgId } from "@/middlewares/auth.middleware";
import { CategoryController } from "@/controllers/category.controller";
import { createCategorySchema, getAllCategoriesSchema, updateCategorySchema } from "@/validations/category.schema";

const router = Router();
const categoryController = new CategoryController();

// Apply auth middleware to all routes
router.use(requireAuthWithOrgId);

/**
 * @route   POST /api/v1/categories
 * @desc    Create a new category
 * @access  Private (Member)
 */
router.post("/", validate(createCategorySchema), categoryController.createCategory);

/**
 * @route   GET /api/v1/categories
 * @desc    Get all categories with pagination
 * @access  Private (Member)
 */
router.get("/", categoryController.getAllCategoriesPaginated);

/**
 * @route   GET /api/v1/categories/all
 * @desc    Get all categories without pagination (for dropdowns, etc.)
 * @access  Private (Member)
 */
router.get("/all", validate(getAllCategoriesSchema), categoryController.getAllCategories);

/**
 * @route   GET /api/v1/categories/:slug
 * @desc    Get category by slug
 * @access  Private (Member)
 */
router.get("/:slug", categoryController.getCategoryBySlug);

/**
 * @route   PATCH /api/v1/categories/:slug
 * @desc    Update category
 * @access  Private (Member)
 */
router.patch("/:slug", validate(updateCategorySchema), categoryController.updateCategory);

/**
 * @route   DELETE /api/v1/categories/:id
 * @desc    Delete category
 * @access  Private (Member)
 */
router.delete("/:id", categoryController.deleteCategory);

export default router;
