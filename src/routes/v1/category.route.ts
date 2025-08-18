import { Router } from "express";
import { validate } from "@/middlewares/validation.middleware";
import { CategoryController } from "@/controllers/category.controller";
import { createCategorySchema, updateCategorySchema } from "@/validations/category.schema";

const categoryRoutes = Router();
const categoryController = new CategoryController();

categoryRoutes
  .route("/")
  .post(validate(createCategorySchema), categoryController.createCategory)
  .get(categoryController.getAllCategories);

categoryRoutes
  .route("/:slug")
  .get(categoryController.getCategoryBySlug)
  .patch(validate(updateCategorySchema), categoryController.updateCategory)
  .delete(categoryController.deleteCategory);

export default categoryRoutes;
