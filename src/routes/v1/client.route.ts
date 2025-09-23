import { Router } from "express";
import { validate } from "@/middlewares/validation.middleware";
import { requireAuthWithOrgId } from "@/middlewares/auth.middleware";
import * as clientController from "@/controllers/client.controller";
import {
  createClientSchema,
  updateClientSchema,
  clientListAnalyticsSchema,
  getAllClientsSchema,
} from "@/validations/client.schema";

const router = Router();

// Apply auth middleware to all routes
router.use(requireAuthWithOrgId);

/**
 * @route   POST /api/v1/clients
 * @desc    Create a new client
 * @access  Private (Member)
 */
router.post("/", validate(createClientSchema), clientController.createClient);

/**
 * @route   GET /api/v1/clients
 * @desc    Get all clients with pagination and search
 * @access  Private (Member)
 */
router.get("/", validate(getAllClientsSchema), clientController.getAllClients);

/**
 * @route   GET /api/v1/clients/:id
 * @desc    Get client by ID
 * @access  Private (Member)
 */
router.get("/:id", clientController.getClientById);

/**
 * @route   PATCH /api/v1/clients/:id
 * @desc    Update client
 * @access  Private (Member)
 */
router.patch("/:id", validate(updateClientSchema), clientController.updateClient);

/**
 * @route   DELETE /api/v1/clients/:id
 * @desc    Delete client
 * @access  Private (Member)
 */
router.delete("/:id", clientController.deleteClient);

/**
 * @route   GET /api/v1/clients/search/:query
 * @desc    Search clients by name, email, or phone
 * @access  Private (Member)
 */
router.get("/search/:query", clientController.searchClients);

// Analytics and Reporting Routes

/**
 * @route   GET /api/v1/clients/analytics/list
 * @desc    Get comprehensive client list with analytics data
 * @access  Private (Member)
 */
router.get("/analytics/list", validate(clientListAnalyticsSchema), clientController.getClientAnalyticsList);

export default router;
