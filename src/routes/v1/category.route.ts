import { Router } from "express";
import { validate } from "@/middlewares/validation.middleware";
import { createCategorySchema } from "@/validations/category.schema";
import { CategoryController } from "@/controllers/category.controller";

const categoryRoutes = Router();
const categoryController = new CategoryController();

categoryRoutes.post("/", validate(createCategorySchema), categoryController.createCategory);
categoryRoutes.get("/:id", categoryController.getCategoryById);

export default categoryRoutes;
