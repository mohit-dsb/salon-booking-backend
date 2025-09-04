import { ClientService } from "@/services/client.service";
import { parsePaginationParams } from "@/utils/pagination";
import type { Request, Response, NextFunction } from "express";
import { getAuthWithOrgId } from "@/middlewares/auth.middleware";
import { asyncHandler, AppError } from "@/middlewares/error.middleware";
import type { ClientSummaryParams, ClientListAnalyticsParams, ClientInsightsParams } from "@/validations/client.schema";

export class ClientController {
  private clientService = new ClientService();

  // Create a new client
  public createClient = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const clientData = req.body;

    const client = await this.clientService.createClient(orgId, clientData);

    res.status(201).json({
      success: true,
      data: client,
      message: "Client created successfully",
    });
  });

  // Get all clients with pagination and filters
  public getAllClients = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const pagination = parsePaginationParams(req.query);

    // Extract filters from query parameters (validated by middleware)
    const filters: {
      isActive?: boolean;
      search?: string;
    } = {};

    if (req.query.isActive !== undefined) {
      filters.isActive = req.query.isActive === "true";
    }

    if (req.query.search) {
      filters.search = req.query.search as string;
    }

    const result = await this.clientService.getAllClients(orgId, pagination, filters);

    res.status(200).json({
      success: true,
      data: result.clients,
      pagination: result.pagination,
      message: "Clients retrieved successfully",
    });
  });

  // Get client by ID
  public getClientById = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const { id } = req.params;

    const client = await this.clientService.getClientById(id, orgId);

    res.status(200).json({
      success: true,
      data: client,
      message: "Client retrieved successfully",
    });
  });

  // Update client
  public updateClient = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const { id } = req.params;
    const updateData = req.body;

    const client = await this.clientService.updateClient(id, orgId, updateData);

    res.status(200).json({
      success: true,
      data: client,
      message: "Client updated successfully",
    });
  });

  // Delete client (soft delete)
  public deleteClient = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const { id } = req.params;

    await this.clientService.deleteClient(id, orgId);

    res.status(200).json({
      success: true,
      message: "Client deleted successfully",
    });
  });

  // Search clients
  public searchClients = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const { query } = req.params;

    if (!query || typeof query !== "string") {
      throw new AppError("Search query is required", 400);
    }

    const clients = await this.clientService.searchClients(orgId, query);

    res.status(200).json({
      success: true,
      data: clients,
      message: "Search completed successfully",
    });
  });

  // Analytics and Reporting Methods

  /**
   * Get client summary analytics with trends and patterns
   */
  public getClientSummary = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const params = req.query as unknown as ClientSummaryParams;

    const result = await this.clientService.getClientSummary(orgId, params);

    res.status(200).json({
      success: true,
      data: result,
      message: "Client summary analytics retrieved successfully",
    });
  });

  /**
   * Get comprehensive client list with analytics data
   */
  public getClientAnalyticsList = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const params = req.query as unknown as ClientListAnalyticsParams;
    const pagination = parsePaginationParams(req.query);

    const result = await this.clientService.getClientAnalyticsList(orgId, params, pagination);

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      summary: result.summary,
      filters: result.filters,
      message: "Client analytics list retrieved successfully",
    });
  });

  /**
   * Get individual client insights and behavior analysis
   */
  public getClientInsights = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const { clientId } = req.params;
    const params = req.query as unknown as ClientInsightsParams;

    if (!clientId) {
      throw new AppError("Client ID is required", 400);
    }

    const result = await this.clientService.getClientInsights(orgId, clientId, params);

    res.status(200).json({
      success: true,
      data: result,
      message: "Client insights retrieved successfully",
    });
  });
}
