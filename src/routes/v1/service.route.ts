import { Router } from "express";
import { validate } from "@/middlewares/validation.middleware";
import { ServiceController } from "@/controllers/service.controller";
import { createServiceSchema, updateServiceSchema } from "@/validations/service.schema";

const serviceRoutes = Router();
const serviceController = new ServiceController();

// Base routes for services
serviceRoutes
  .route("/")
  .post(validate(createServiceSchema), serviceController.createService)
  .get(serviceController.getAllServices);

// Get active services only
serviceRoutes.get("/active", serviceController.getActiveServices);

// Search services
serviceRoutes.get("/search", serviceController.searchServices);

// Filter by price range
serviceRoutes.get("/price-range", serviceController.getServicesByPriceRange);

// Filter by duration
serviceRoutes.get("/duration", serviceController.getServicesByDuration);

// Get services by category
serviceRoutes.get("/category/:categoryId", serviceController.getServicesByCategory);

// Individual service routes (by slug)
serviceRoutes
  .route("/:slug")
  .get(serviceController.getServiceBySlug)
  .patch(validate(updateServiceSchema), serviceController.updateService)
  .delete(serviceController.deleteService);

// Service activation/deactivation
serviceRoutes.patch("/:slug/activate", serviceController.activateService);
serviceRoutes.patch("/:slug/deactivate", serviceController.deactivateService);

export default serviceRoutes;
