import { Router } from "express";
import { validate } from "@/middlewares/validation.middleware";
import { ClientController } from "@/controllers/client.controller";
import { paginationQuerySchema } from "@/validations/pagination.schema";
import { createClientSchema, updateClientSchema } from "@/validations/client.schema";

const router = Router();
const clientController = new ClientController();

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
router.get("/", validate(paginationQuerySchema), clientController.getAllClients);

/**
 * @route   GET /api/v1/clients/:id
 * @desc    Get client by ID
 * @access  Private (Member)
 */
router.get("/:id", clientController.getClientById);

/**
 * @route   PUT /api/v1/clients/:id
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

export default router;
