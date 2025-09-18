import { ClientService } from "@/services/client.service";
import { parsePaginationParams } from "@/utils/pagination";
import type { Request, Response, NextFunction } from "express";
import { getAuthWithOrgId } from "@/middlewares/auth.middleware";
import { asyncHandler, AppError } from "@/middlewares/error.middleware";
import { ClientTableRow, TableResponse } from "@/types/table.types";
import type { ClientListAnalyticsParams, UpdateClientData, CreateClientData, GetAllClientsParams } from "@/validations/client.schema";
import { getClientTableColumns, transformClientsReportToTableData } from "@/utils/data-transformation/clients";

// Create service instance
const clientService = new ClientService();

/**
 * Create a new client
 * @route POST /api/v1/clients
 * @access Private (Member)
 */
export const createClient = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);
  const clientData = req.parsedBody as CreateClientData;

  const client = await clientService.createClient(orgId, clientData);

  res.status(201).json({
    success: true,
    data: client,
    message: "Client created successfully",
  });
});

/**
 * Get all clients with pagination and filters
 * @route GET /api/v1/clients
 * @access Private (Member)
 */
export const getAllClients = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);
  const pagination = parsePaginationParams(req.query);

  // Extract filters from query parameters (validated by middleware)
  const filters = req.parsedQuery as GetAllClientsParams

  const result = await clientService.getAllClients(orgId, pagination, filters);

  res.status(200).json({
    success: true,
    data: result.clients,
    pagination: result.pagination,
    message: "Clients retrieved successfully",
  });
});

/**
 * Get client by ID
 * @route GET /api/v1/clients/:id
 * @access Private (Member)
 */
export const getClientById = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);
  const { id } = req.params;

  const client = await clientService.getClientById(id, orgId);

  res.status(200).json({
    success: true,
    data: client,
    message: "Client retrieved successfully",
  });
});

/**
 * Update client
 * @route PATCH /api/v1/clients/:id
 * @access Private (Member)
 */
export const updateClient = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);
  const { id } = req.params;
  const updateData = req.parsedBody as UpdateClientData;

  const client = await clientService.updateClient(id, orgId, updateData);

  res.status(200).json({
    success: true,
    data: client,
    message: "Client updated successfully",
  });
});

/**
 * Delete client (soft delete)
 * @route DELETE /api/v1/clients/:id
 * @access Private (Member)
 */
export const deleteClient = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);
  const { id } = req.params;

  await clientService.deleteClient(id, orgId);

  res.status(200).json({
    success: true,
    message: "Client deleted successfully",
  });
});

/**
 * Search clients by name, email, or phone
 * @route GET /api/v1/clients/search/:query
 * @access Private (Member)
 */
export const searchClients = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);
  const { query } = req.params;

  if (!query || typeof query !== "string") {
    throw new AppError("Search query is required", 400);
  }

  const clients = await clientService.searchClients(orgId, query);

  res.status(200).json({
    success: true,
    data: clients,
    message: "Search completed successfully",
  });
});

/**
 * Get comprehensive client list with analytics data
 * @route GET /api/v1/clients/analytics/list
 * @access Private (Member)
 */
export const getClientAnalyticsList = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);
  const params = req.parsedQuery as ClientListAnalyticsParams;
  const pagination = parsePaginationParams(req.query);

  const result = await clientService.getClientAnalyticsList(orgId, params, pagination);
  const tableData = transformClientsReportToTableData(result.data);
  const columns = getClientTableColumns();

  // Build response
  const response: TableResponse<ClientTableRow> = {
    tableData,
    columns,
    pagination: {
      page: result.pagination.page,
      limit: result.pagination.limit,
      total: result.pagination.total,
      totalPages: result.pagination.totalPages,
      hasNext: result.pagination.page < result.pagination.totalPages,
      hasPrev: result.pagination.page > 1,
    },
    metadata: {
      totalRecords: result.pagination.total,
      filteredRecords: tableData.length,
      lastUpdated: new Date().toISOString(),
      queryTime: Date.now(),
    },
  };

  res.status(200).json({
    success: true,
    data: response,
    pagination: result.pagination,
    filters: result.filters,
    message: "Client analytics list retrieved successfully",
  });
});
