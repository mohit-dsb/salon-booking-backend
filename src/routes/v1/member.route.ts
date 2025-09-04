import { Router } from "express";
import { validate } from "@/middlewares/validation.middleware";
import * as memberController from "@/controllers/member.controller";
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
} from "@/validations/member.schema";

const router = Router();

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

export default router;
