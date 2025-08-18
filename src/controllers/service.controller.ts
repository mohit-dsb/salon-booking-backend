import { AuthObject } from "@clerk/express";
import { NextFunction, Request, Response } from "express";
import { ServiceService } from "@/services/service.service";
import { AppError, asyncHandler } from "@/middlewares/error.middleware";

// Type for auth object with orgId
type AuthWithOrgId = AuthObject & {
  orgId: string;
};

export class ServiceController {
  private serviceService = new ServiceService();

  public createService = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const auth = req.auth as AuthWithOrgId;

    const serviceData = {
      ...req.body,
      orgId: auth.orgId,
    };

    const service = await this.serviceService.createService(serviceData);
    res.status(201).json({ success: true, data: service });
  });

  public getServiceById = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const auth = req.auth as AuthWithOrgId;

    if (!req.params.id) {
      throw new AppError("Service ID is required", 400);
    }

    const service = await this.serviceService.getServiceById(req.params.id, auth.orgId);

    if (!service) {
      throw new AppError("Service not found", 404);
    }

    res.status(200).json({ success: true, data: service });
  });

  public getAllServices = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const auth = req.auth as AuthWithOrgId;

    const services = await this.serviceService.getServicesByOrg(auth.orgId);
    res.status(200).json({ success: true, data: services });
  });

  public getActiveServices = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const auth = req.auth as AuthWithOrgId;

    const services = await this.serviceService.getActiveServicesByOrg(auth.orgId);
    res.status(200).json({ success: true, data: services });
  });

  public getServiceBySlug = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const auth = req.auth as AuthWithOrgId;
    const { slug } = req.params;

    if (!slug) {
      throw new AppError("Service slug is required", 400);
    }

    const service = await this.serviceService.getServiceBySlug(slug, auth.orgId);

    if (!service) {
      throw new AppError("Service not found", 404);
    }

    res.status(200).json({ success: true, data: service });
  });

  public getServicesByCategory = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const auth = req.auth as AuthWithOrgId;
    const { categoryId } = req.params;

    if (!categoryId) {
      throw new AppError("Category ID is required", 400);
    }

    const services = await this.serviceService.getServicesByCategory(categoryId, auth.orgId);
    res.status(200).json({ success: true, data: services });
  });

  public updateService = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const auth = req.auth as AuthWithOrgId;
    const { slug } = req.params;

    if (!slug) {
      throw new AppError("Service slug is required", 400);
    }

    // First get the service to get its ID
    const existingService = await this.serviceService.getServiceBySlug(slug, auth.orgId);
    if (!existingService) {
      throw new AppError("Service not found", 404);
    }

    const service = await this.serviceService.updateService(existingService.id, auth.orgId, req.body);
    res.status(200).json({ success: true, data: service });
  });

  public deleteService = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const auth = req.auth as AuthWithOrgId;
    const { slug } = req.params;

    if (!slug) {
      throw new AppError("Service slug is required", 400);
    }

    // First get the service to get its ID
    const existingService = await this.serviceService.getServiceBySlug(slug, auth.orgId);
    if (!existingService) {
      throw new AppError("Service not found", 404);
    }

    await this.serviceService.deleteService(existingService.id, auth.orgId);
    res.status(200).json({ success: true, message: "Service deleted successfully" });
  });

  public deactivateService = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const auth = req.auth as AuthWithOrgId;
    const { slug } = req.params;

    if (!slug) {
      throw new AppError("Service slug is required", 400);
    }

    // First get the service to get its ID
    const existingService = await this.serviceService.getServiceBySlug(slug, auth.orgId);
    if (!existingService) {
      throw new AppError("Service not found", 404);
    }

    const service = await this.serviceService.deactivateService(existingService.id, auth.orgId);
    res.status(200).json({ success: true, data: service });
  });

  public activateService = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const auth = req.auth as AuthWithOrgId;
    const { slug } = req.params;

    if (!slug) {
      throw new AppError("Service slug is required", 400);
    }

    // First get the service to get its ID
    const existingService = await this.serviceService.getServiceBySlug(slug, auth.orgId);
    if (!existingService) {
      throw new AppError("Service not found", 404);
    }

    const service = await this.serviceService.activateService(existingService.id, auth.orgId);
    res.status(200).json({ success: true, data: service });
  });

  public searchServices = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const auth = req.auth as AuthWithOrgId;
    const { q } = req.query;

    if (!q || typeof q !== "string") {
      throw new AppError("Search query is required", 400);
    }

    const services = await this.serviceService.searchServices(q, auth.orgId);
    res.status(200).json({ success: true, data: services });
  });

  public getServicesByPriceRange = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const auth = req.auth as AuthWithOrgId;
    const { minPrice, maxPrice } = req.query;

    const min = minPrice ? parseFloat(minPrice as string) : undefined;
    const max = maxPrice ? parseFloat(maxPrice as string) : undefined;

    if (min && isNaN(min)) {
      throw new AppError("Invalid minimum price", 400);
    }

    if (max && isNaN(max)) {
      throw new AppError("Invalid maximum price", 400);
    }

    const services = await this.serviceService.getServicesByPriceRange(auth.orgId, min, max);
    res.status(200).json({ success: true, data: services });
  });

  public getServicesByDuration = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const auth = req.auth as AuthWithOrgId;
    const { maxDuration } = req.query;

    const max = maxDuration ? parseInt(maxDuration as string) : undefined;

    if (max && isNaN(max)) {
      throw new AppError("Invalid maximum duration", 400);
    }

    const services = await this.serviceService.getServicesByDuration(auth.orgId, max);
    res.status(200).json({ success: true, data: services });
  });
}
