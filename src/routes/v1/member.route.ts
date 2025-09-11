import { Router } from "express";
import { validate } from "@/middlewares/validation.middleware";
import * as memberController from "@/controllers/member.controller";
import { requireAuthWithOrgId } from "@/middlewares/auth.middleware";
import {
  createMemberSchema,
  updateMemberSchema,
  assignServicesSchema,
  memberQuerySchema,
  searchMemberSchema,
  bulkDeleteMembersSchema,
  workingHoursActivitySchema,
  breakActivitySchema,
  attendanceSummarySchema,
  wagesDetailSchema,
  wagesSummarySchema,
  paySummarySchema,
  scheduledShiftsSchema,
  workingHoursSummarySchema,
  commissionActivitySchema,
  commissionSummarySchema,
} from "@/validations/member.schema";

const router = Router();

// TODO: write decorators for routes and controllers here

// Apply auth middleware to all routes
router.use(requireAuthWithOrgId);

// Stats and search routes (must come before parameterized routes)
router.get("/stats", memberController.getMemberStats);
router.get("/search", validate(searchMemberSchema), memberController.searchMembers);

// Profile routes for current user
router.get("/profile", memberController.getMemberProfile);
router.patch("/profile", memberController.updateMemberProfile);

// Service-specific routes
router.get("/by-service/:serviceId", memberController.getMembersByService);

// Main CRUD operations
router.get("/", validate(memberQuerySchema), memberController.getAllMembers);
router.post("/", validate(createMemberSchema), memberController.createMember);
router.delete("/bulk", validate(bulkDeleteMembersSchema), memberController.bulkDeleteMembers);

// Parameterized routes (must come after static routes)
router.get("/:id", memberController.getMemberById);
router.patch("/:id", validate(updateMemberSchema), memberController.updateMember);
router.delete("/:id", memberController.deleteMember);

// Member service management
router.patch("/:id/services", validate(assignServicesSchema), memberController.assignServices);

// Member status management
router.patch("/:id/status", memberController.toggleMemberStatus);

// Analytics and Reporting Routes

/**
 * @route   GET /api/v1/members/analytics/working-hours
 * @desc    Get working hours activity analytics for team members
 * @access  Private (Admin/Member)
 */
router.get("/analytics/working-hours", validate(workingHoursActivitySchema), memberController.getWorkingHoursActivity);

/**
 * @route   GET /api/v1/members/analytics/breaks
 * @desc    Get break activity analytics for team members
 * @access  Private (Admin/Member)
 */
router.get("/analytics/breaks", validate(breakActivitySchema), memberController.getBreakActivity);

/**
 * @route   GET /api/v1/members/analytics/attendance
 * @desc    Get attendance summary analytics for team members
 * @access  Private (Admin/Member)
 */
router.get("/analytics/attendance", validate(attendanceSummarySchema), memberController.getAttendanceSummary);

/**
 * @route   GET /api/v1/members/analytics/wages/detail
 * @desc    Get detailed wages information for team members
 * @access  Private (Admin/Member)
 */
router.get("/analytics/wages/detail", validate(wagesDetailSchema), memberController.getWagesDetail);

/**
 * @route   GET /api/v1/members/analytics/wages/summary
 * @desc    Get wages summary analytics for team members
 * @access  Private (Admin/Member)
 */
router.get("/analytics/wages/summary", validate(wagesSummarySchema), memberController.getWagesSummary);

// New Analytics and Reporting Routes

/**
 * @route   GET /api/v1/members/analytics/pay-summary
 * @desc    Get pay summary overview for team member compensation
 * @access  Private (Admin/Member)
 */
router.get("/analytics/pay-summary", validate(paySummarySchema), memberController.getPaySummary);

/**
 * @route   GET /api/v1/members/analytics/scheduled-shifts
 * @desc    Get detailed view of team members scheduled shifts
 * @access  Private (Admin/Member)
 */
router.get("/analytics/scheduled-shifts", validate(scheduledShiftsSchema), memberController.getScheduledShifts);

/**
 * @route   GET /api/v1/members/analytics/working-hours-summary
 * @desc    Get working hours summary with operational hours and productivity overview
 * @access  Private (Admin/Member)
 */
router.get(
  "/analytics/working-hours-summary",
  validate(workingHoursSummarySchema),
  memberController.getWorkingHoursSummary,
);

/**
 * @route   GET /api/v1/members/analytics/commission-activity
 * @desc    Get full list of sales with commission payable
 * @access  Private (Admin/Member)
 */
router.get(
  "/analytics/commission-activity",
  validate(commissionActivitySchema),
  memberController.getCommissionActivity,
);

/**
 * @route   GET /api/v1/members/analytics/commission-summary
 * @desc    Get overview of commission earned by team members, locations and sales items
 * @access  Private (Admin/Member)
 */
router.get("/analytics/commission-summary", validate(commissionSummarySchema), memberController.getCommissionSummary);

export default router;
