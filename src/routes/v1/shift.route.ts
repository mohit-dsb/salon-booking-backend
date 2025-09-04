import { Router } from "express";
import { shiftController } from "@/controllers/shift.controller";
import { requireAuthWithOrgId } from "@/middlewares/auth.middleware";
import { validate } from "@/middlewares/validation.middleware";
import {
  createShiftSchema,
  createRecurringShiftSchema,
  updateShiftSchema,
  getShiftsSchema,
  getWeeklyScheduleSchema,
  getShiftStatsSchema,
  bulkUpdateShiftsSchema,
  bulkDeleteShiftsSchema,
  copyShiftsSchema,
} from "@/validations/shift.schema";

const router = Router();

// Apply auth middleware to all routes
router.use(requireAuthWithOrgId);

// ==================== SHIFT CRUD ROUTES ====================

// Create a new shift
router.post("/", validate(createShiftSchema), shiftController.createShift);

// Create a recurring shift series
router.post("/recurring", validate(createRecurringShiftSchema), shiftController.createRecurringShift);

// Get all shifts with filters and pagination
router.get("/", validate(getShiftsSchema), shiftController.getShifts);

// Get weekly schedule
router.get("/week/:weekStart", validate(getWeeklyScheduleSchema), shiftController.getWeeklySchedule);

// Get dashboard data for current user
router.get("/dashboard", shiftController.getDashboardData);

// Get shift statistics
router.get("/stats", validate(getShiftStatsSchema), shiftController.getShiftStats);

// Get a specific shift by ID
router.get("/:shiftId", shiftController.getShiftById);

// Update a shift
router.patch("/:shiftId", validate(updateShiftSchema), shiftController.updateShift);

// Delete a shift
router.delete("/:shiftId", shiftController.deleteShift);

// ==================== BULK OPERATIONS ROUTES ====================

// Bulk update shifts
router.patch("/bulk/update", validate(bulkUpdateShiftsSchema), shiftController.bulkUpdateShifts);

// Bulk delete shifts
router.delete("/bulk/delete", validate(bulkDeleteShiftsSchema), shiftController.bulkDeleteShifts);

// Copy shifts from one date to other dates
router.post("/bulk/copy", validate(copyShiftsSchema), shiftController.copyShifts);

export default router;
