import { Router } from "express";
import { validate } from "@/middlewares/validation.middleware";
import { requireAuthWithOrgId } from "@/middlewares/auth.middleware";
import { CategoryController } from "@/controllers/category.controller";
import { createCategorySchema, getAllCategoriesSchema, updateCategorySchema } from "@/validations/category.schema";

const categoryRoutes = Router();
const categoryController = new CategoryController();

// Apply auth middleware to all routes
categoryRoutes.use(requireAuthWithOrgId);

categoryRoutes
  .route("/")
  .post(validate(createCategorySchema), categoryController.createCategory)
  .get(categoryController.getAllCategoriesPaginated);

categoryRoutes.get("/all", validate(getAllCategoriesSchema), categoryController.getAllCategories);

categoryRoutes
  .route("/:slug")
  .get(categoryController.getCategoryBySlug)
  .patch(validate(updateCategorySchema), categoryController.updateCategory)
  .delete(categoryController.deleteCategory);

export default categoryRoutes;
