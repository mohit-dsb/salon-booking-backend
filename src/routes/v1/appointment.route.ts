import { Router } from "express";
import { validate } from "@/middlewares/validation.middleware";
import { paginationQuerySchema } from "@/validations/pagination.schema";
import { AppointmentController } from "@/controllers/appointment.controller";
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  appointmentQuerySchema,
  rescheduleAppointmentSchema,
  cancelAppointmentSchema,
  checkAvailabilitySchema,
  convertWalkInAppointmentSchema,
  appointmentSummarySchema,
  appointmentListSchema,
  cancellationNoShowSchema,
} from "@/validations/appointment.schema";

const router = Router();
const appointmentController = new AppointmentController();

/**
 * @route   POST /api/v1/appointments
 * @desc    Create a new appointment
 * @access  Private (Member)
 */
router.post("/", validate(createAppointmentSchema), appointmentController.createAppointment);

/**
 * @route   POST /api/v1/appointments/walk-in
 * @desc    Create a new walk-in appointment (now uses same schema as regular appointments)
 * @access  Private (Member)
 */
router.post("/walk-in", validate(createAppointmentSchema), appointmentController.createWalkInAppointment);

/**
 * @route   GET /api/v1/appointments
 * @desc    Get all appointments with pagination and filters
 * @access  Private (Member)
 */
router.get("/", validate(appointmentQuerySchema), appointmentController.getAllAppointments);

/**
 * @route   GET /api/v1/appointments/:id
 * @desc    Get appointment by ID
 * @access  Private (Member)
 */
router.get("/:id", appointmentController.getAppointmentById);

/**
 * @route   PUT /api/v1/appointments/:id
 * @desc    Update appointment
 * @access  Private (Member)
 */
router.patch("/:id", validate(updateAppointmentSchema), appointmentController.updateAppointment);

/**
 * @route   PATCH /api/v1/appointments/:id/cancel
 * @desc    Cancel appointment
 * @access  Private (Member)
 */
router.patch("/:id/cancel", validate(cancelAppointmentSchema), appointmentController.cancelAppointment);

/**
 * @route   PATCH /api/v1/appointments/:id/confirm
 * @desc    Confirm appointment
 * @access  Private (Member)
 */
router.patch("/:id/confirm", appointmentController.confirmAppointment);

/**
 * @route   PATCH /api/v1/appointments/:id/start
 * @desc    Start appointment (mark as in progress)
 * @access  Private (Member)
 */
router.patch("/:id/start", appointmentController.startAppointment);

/**
 * @route   PATCH /api/v1/appointments/:id/complete
 * @desc    Complete appointment
 * @access  Private (Member)
 */
router.patch("/:id/complete", appointmentController.completeAppointment);

/**
 * @route   PATCH /api/v1/appointments/:id/no-show
 * @desc    Mark appointment as no-show
 * @access  Private (Member)
 */
router.patch("/:id/no-show", appointmentController.markNoShow);

/**
 * @route   PATCH /api/v1/appointments/:id/convert
 * @desc    Convert walk-in appointment to regular appointment with client
 * @access  Private (Member)
 */
router.patch("/:id/convert", validate(convertWalkInAppointmentSchema), appointmentController.convertWalkInAppointment);

/**
 * @route   POST /api/v1/appointments/:id/reschedule
 * @desc    Reschedule appointment
 * @access  Private (Member)
 */
router.post("/:id/reschedule", validate(rescheduleAppointmentSchema), appointmentController.rescheduleAppointment);

/**
 * @route   GET /api/v1/appointments/availability/check
 * @desc    Check member availability for a specific time slot
 * @access  Private (Member)
 */
router.get("/availability/check", validate(checkAvailabilitySchema), appointmentController.checkAvailability);

/**
 * @route   GET /api/v1/appointments/member/:memberId
 * @desc    Get upcoming appointments for a specific member
 * @access  Private (Member)
 */
router.get("/member/:memberId", validate(paginationQuerySchema), appointmentController.getMemberUpcomingAppointments);

/**
 * @route   GET /api/v1/appointments/client/:clientId
 * @desc    Get appointment history for a specific client
 * @access  Private (Member)
 */
router.get("/client/:clientId", validate(paginationQuerySchema), appointmentController.getClientAppointmentHistory);

/**
 * @route   GET /api/v1/appointments/upcoming
 * @desc    Get upcoming appointments for the authenticated member
 * @access  Private (Member)
 */
router.get("/upcoming", appointmentController.getMemberUpcomingAppointments);

// Analytics and Reporting Routes

/**
 * @route   GET /api/v1/appointments/analytics/summary
 * @desc    Get appointment summary analytics with trends and patterns
 * @access  Private (Member)
 */
router.get("/analytics/summary", validate(appointmentSummarySchema), appointmentController.getAppointmentSummary);

/**
 * @route   GET /api/v1/appointments/analytics/list
 * @desc    Get detailed appointment list for analytics
 * @access  Private (Member)
 */
router.get("/analytics/list", validate(appointmentListSchema), appointmentController.getAppointmentAnalyticsList);

/**
 * @route   GET /api/v1/appointments/analytics/cancellations
 * @desc    Get cancellations and no-shows analytics
 * @access  Private (Member)
 */
router.get(
  "/analytics/cancellations",
  validate(cancellationNoShowSchema),
  appointmentController.getCancellationNoShowAnalytics,
);

export default router;
