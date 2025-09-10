import { logger } from "@/utils/logger";
import { verifyWebhook } from "@clerk/express/webhooks";
import { handleError } from "@/utils/errorHandler";
import type { Request, Response, NextFunction } from "express";
import { MemberService } from "@/services/member.service";
import { parsePaginationParams } from "@/utils/pagination";
import { getAuthWithOrgId } from "@/middlewares/auth.middleware";
import { asyncHandler, AppError } from "@/middlewares/error.middleware";
import type {
  WorkingHoursActivityParams,
  BreakActivityParams,
  AttendanceSummaryParams,
  WagesDetailParams,
  WagesSummaryParams,
  PaySummaryParams,
  ScheduledShiftsParams,
  WorkingHoursSummaryParams,
  CommissionActivityParams,
  CommissionSummaryParams,
  BulkDeleteMembersData,
  CreateMemberData,
  UpdateMemberData,
} from "@/validations/member.schema";

// Initialize service instance - can be mocked easily for testing
const memberService = new MemberService();

// Member CRUD Operations

/**
 * Create a new member
 * @route POST /api/v1/members
 * @access Private (Admin)
 */
export const createMember = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);
  const memberData = req.parsedBody as CreateMemberData;

  const member = await memberService.createMember(orgId, memberData);

  res.status(201).json({
    success: true,
    data: member,
    message: "Member created successfully",
  });
});

/**
 * Get all members with pagination and filters
 * @route GET /api/v1/members
 * @access Private (Admin/Member)
 */
export const getAllMembers = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);
  const pagination = parsePaginationParams(req.query);

  // Extract filters from query parameters (validated by middleware)
  const filters: {
    isActive?: boolean;
    search?: string;
    serviceId?: string;
  } = {};

  if (req.query.isActive !== undefined) {
    filters.isActive = req.query.isActive === "true";
  }

  if (req.query.search) {
    filters.search = req.query.search as string;
  }

  if (req.query.serviceId) {
    filters.serviceId = req.query.serviceId as string;
  }

  const result = await memberService.getAllMembers(orgId, pagination, filters);

  res.status(200).json({
    success: true,
    message: "Members retrieved successfully",
    data: result.data,
    meta: result.meta,
  });
});

/**
 * Get member by ID
 * @route GET /api/v1/members/:id
 * @access Private (Admin/Member)
 */
export const getMemberById = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);
  const { id } = req.params;

  const member = await memberService.getMemberById(id, orgId);

  res.status(200).json({
    success: true,
    message: "Member retrieved successfully",
    data: member,
  });
});

/**
 * Update member
 * @route PATCH /api/v1/members/:id
 * @access Private (Admin/Member)
 */
export const updateMember = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);
  const { id } = req.params;
  const updateData = req.parsedBody as UpdateMemberData;

  const member = await memberService.updateMember(id, orgId, updateData);

  res.status(200).json({
    success: true,
    message: "Member updated successfully",
    data: member,
  });
});

/**
 * Delete member
 * @route DELETE /api/v1/members/:id
 * @access Private (Admin)
 */
export const deleteMember = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);
  const { id } = req.params;

  await memberService.deleteMember(id, orgId);

  res.status(200).json({
    success: true,
    message: "Member deleted successfully",
  });
});

/**
 * Bulk delete members
 * @route DELETE /api/v1/members/bulk
 * @access Private (Admin)
 */
export const bulkDeleteMembers = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);
  const { memberIds } = req.parsedBody as BulkDeleteMembersData;

  const result = await memberService.bulkDeleteMembers(memberIds, orgId);

  const totalRequested = memberIds.length;
  const successCount = result.deleted.length;
  const failedCount = result.failed.length;

  res.status(200).json({
    success: true,
    message: `Bulk delete completed. ${successCount}/${totalRequested} members deleted successfully.`,
    data: {
      summary: {
        total: totalRequested,
        deleted: successCount,
        failed: failedCount,
      },
      deleted: result.deleted,
      failed: result.failed,
    },
  });
});

// Member Service Management

/**
 * Assign services to member
 * @route PATCH /api/v1/members/:id/services
 * @access Private (Admin)
 */
export const assignServices = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);
  const { id } = req.params;
  const { serviceIds } = req.parsedBody as { serviceIds: string[] };

  await memberService.assignServicesToMember(id, orgId, serviceIds);

  res.status(200).json({
    success: true,
    message: "Services assigned successfully",
  });
});

/**
 * Get members by service
 * @route GET /api/v1/members/by-service/:serviceId
 * @access Private (Admin/Member)
 */
export const getMembersByService = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);
  const { serviceId } = req.params;

  const members = await memberService.getMembersByService(serviceId, orgId);

  res.status(200).json({
    success: true,
    message: "Members retrieved successfully",
    data: members,
  });
});

// Member Statistics and Search

/**
 * Get member statistics
 * @route GET /api/v1/members/stats
 * @access Private (Admin/Member)
 */
export const getMemberStats = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);

  const stats = await memberService.getMemberStats(orgId);

  res.status(200).json({
    success: true,
    message: "Member statistics retrieved successfully",
    data: stats,
  });
});

/**
 * Toggle member status (activate/deactivate)
 * @route PATCH /api/v1/members/:id/status
 * @access Private (Admin)
 */
export const toggleMemberStatus = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);
  const { id } = req.params;

  const member = await memberService.toggleMemberStatus(id, orgId);

  res.status(200).json({
    success: true,
    message: `Member ${member.isActive ? "activated" : "deactivated"} successfully`,
    data: member,
  });
});

/**
 * Search members
 * @route GET /api/v1/members/search
 * @access Private (Admin/Member)
 */
export const searchMembers = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);
  const { q } = req.query;

  const pagination = parsePaginationParams(req.query);
  const result = await memberService.searchMembers(orgId, q as string, pagination);

  res.status(200).json({
    success: true,
    message: "Search completed successfully",
    data: result.data,
    meta: result.meta,
  });
});

// Member Profile Management

/**
 * Get member profile (for the logged-in member)
 * @route GET /api/v1/members/profile
 * @access Private (Member)
 */
export const getMemberProfile = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId, userId } = await getAuthWithOrgId(req);

  const member = await memberService.getMemberByClerkId(userId as string, orgId);

  if (!member) {
    throw new AppError("Member profile not found", 404);
  }

  res.status(200).json({
    success: true,
    message: "Member profile retrieved successfully",
    data: member,
  });
});

/**
 * Update member profile (for the logged-in member)
 * @route PATCH /api/v1/members/profile
 * @access Private (Member)
 */
export const updateMemberProfile = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId, userId } = await getAuthWithOrgId(req);

  const member = await memberService.updateMemberProfile(userId as string, orgId, req.parsedBody as UpdateMemberData);

  res.status(200).json({
    success: true,
    message: "Profile updated successfully",
    data: member,
  });
});

// Webhook Handlers

/**
 * Sync Clerk user events
 * @route POST /api/v1/members/webhook
 * @access Public (Clerk webhook)
 */
export const syncClerkUser = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  try {
    logger.info("Webhook received, verifying...");
    const evt = await verifyWebhook(req);
    logger.info("Webhook verified successfully", { eventType: evt.type, dataKeys: Object.keys(evt.data) });

    if (evt.type === "user.created") {
      logger.info("Processing user.created event", { userId: evt.data.id });
      await memberService.createMemberFromWebhook(evt.data);
    }

    if (evt.type === "user.updated") {
      logger.info("Processing user.updated event", { userId: evt.data.id });
      await memberService.updateMemberFromWebhook(evt.data.id, evt.data);
    }

    if (evt.type === "user.deleted" && evt.data.deleted) {
      logger.info("Processing user.deleted event", { userId: evt.data.id });
      await memberService.deleteMemberFromWebhook(evt.data.id as string);
    }

    // Handle organization membership events for members
    if (evt.type === "organizationMembership.created") {
      logger.info("Processing organizationMembership.created event");
      const { organization, public_user_data, role } = evt.data;
      logger.debug("Organization membership details", {
        organizationId: organization?.id,
        userId: public_user_data?.user_id,
        role,
      });
      if (organization?.id && public_user_data?.user_id) {
        await memberService.handleOrganizationMembership(public_user_data.user_id, organization.id, "created", role);
      }
    }

    if (evt.type === "organizationMembership.updated") {
      logger.info("Processing organizationMembership.updated event");
      const { organization, public_user_data, role } = evt.data;
      logger.debug("Organization membership update details", {
        organizationId: organization?.id,
        userId: public_user_data?.user_id,
        role,
      });
      if (organization?.id && public_user_data?.user_id) {
        await memberService.handleOrganizationMembership(public_user_data.user_id, organization.id, "updated", role);
      }
    }

    if (evt.type === "organizationMembership.deleted") {
      logger.info("Processing organizationMembership.deleted event");
      const { organization, public_user_data } = evt.data;
      logger.debug("Organization membership deletion details", {
        organizationId: organization?.id,
        userId: public_user_data?.user_id,
      });
      if (organization?.id && public_user_data?.user_id) {
        await memberService.handleOrganizationMembership(public_user_data.user_id, organization.id, "deleted");
      }
    }

    logger.info("Webhook processed successfully");
    res.sendStatus(200);
  } catch (error) {
    // Handle Clerk webhook verification errors with proper messaging
    try {
      handleError(error, "webhook verification", "Webhook verification failed");
    } catch (handledError) {
      if (handledError instanceof AppError) {
        logger.error("Webhook verification failed:", handledError.message);
        res.status(handledError.statusCode).json({ error: handledError.message });
      } else {
        logger.error("Webhook verification failed:", error);
        res.status(400).json({ error: "Webhook verification failed" });
      }
    }
  }
});

// Analytics and Reporting Functions

/**
 * Get working hours activity analytics for team members
 * @route GET /api/v1/members/analytics/working-hours
 * @access Private (Admin/Member)
 */
export const getWorkingHoursActivity = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);
  const params = req.query as unknown as WorkingHoursActivityParams;
  const pagination = parsePaginationParams(req.query);

  const result = await memberService.getWorkingHoursActivity(orgId, params, pagination);

  res.status(200).json({
    success: true,
    message: "Working hours activity retrieved successfully",
    data: result.data,
    summary: result.summary,
    meta: result.meta,
    filters: params,
  });
});

/**
 * Get break activity analytics for team members
 * @route GET /api/v1/members/analytics/breaks
 * @access Private (Admin/Member)
 */
export const getBreakActivity = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);
  const params = req.query as unknown as BreakActivityParams;
  const pagination = parsePaginationParams(req.query);

  const result = await memberService.getBreakActivity(orgId, params, pagination);

  res.status(200).json({
    success: true,
    message: "Break activity retrieved successfully",
    data: result.data,
    summary: result.summary,
    meta: result.meta,
    filters: params,
  });
});

/**
 * Get attendance summary analytics for team members
 * @route GET /api/v1/members/analytics/attendance
 * @access Private (Admin/Member)
 */
export const getAttendanceSummary = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);
  const params = req.query as unknown as AttendanceSummaryParams;
  const pagination = parsePaginationParams(req.query);

  const result = await memberService.getAttendanceSummary(orgId, params, pagination);

  res.status(200).json({
    success: true,
    message: "Attendance summary retrieved successfully",
    data: result.data,
    summary: result.summary,
    meta: result.meta,
    filters: params,
  });
});

/**
 * Get detailed wages information for team members
 * @route GET /api/v1/members/analytics/wages/detail
 * @access Private (Admin/Member)
 */
export const getWagesDetail = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);
  const params = req.query as unknown as WagesDetailParams;
  const pagination = parsePaginationParams(req.query);

  const result = await memberService.getWagesDetail(orgId, params, pagination);

  res.status(200).json({
    success: true,
    message: "Wages detail retrieved successfully",
    data: result.data,
    summary: result.summary,
    meta: result.meta,
    filters: params,
  });
});

/**
 * Get wages summary analytics for team members
 * @route GET /api/v1/members/analytics/wages/summary
 * @access Private (Admin/Member)
 */
export const getWagesSummary = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);
  const params = req.query as unknown as WagesSummaryParams;

  const result = await memberService.getWagesSummary(orgId, params);

  res.status(200).json({
    success: true,
    message: "Wages summary retrieved successfully",
    data: result,
    filters: params,
  });
});

// New Analytics and Reporting Functions

/**
 * Get pay summary overview for team member compensation
 * @route GET /api/v1/members/analytics/pay-summary
 * @access Private (Admin/Member)
 */
export const getPaySummary = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);
  const params = req.query as unknown as PaySummaryParams;
  const pagination = parsePaginationParams(req.query);

  const result = await memberService.getPaySummary(orgId, params, pagination);

  res.status(200).json({
    success: true,
    message: "Pay summary retrieved successfully",
    data: result.data,
    meta: result.meta,
    filters: params,
  });
});

/**
 * Get detailed view of team members scheduled shifts
 * @route GET /api/v1/members/analytics/scheduled-shifts
 * @access Private (Admin/Member)
 */
export const getScheduledShifts = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);
  const params = req.query as unknown as ScheduledShiftsParams;
  const pagination = parsePaginationParams(req.query);

  const result = await memberService.getScheduledShifts(orgId, params, pagination);

  res.status(200).json({
    success: true,
    message: "Scheduled shifts retrieved successfully",
    data: result.data,
    meta: result.meta,
    filters: params,
  });
});

/**
 * Get working hours summary with operational hours and productivity overview
 * @route GET /api/v1/members/analytics/working-hours-summary
 * @access Private (Admin/Member)
 */
export const getWorkingHoursSummary = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);
  const params = req.query as unknown as WorkingHoursSummaryParams;
  const pagination = parsePaginationParams(req.query);

  const result = await memberService.getWorkingHoursSummary(orgId, params, pagination);

  res.status(200).json({
    success: true,
    message: "Working hours summary retrieved successfully",
    data: result.data,
    meta: result.meta,
    filters: params,
  });
});

/**
 * Get full list of sales with commission payable
 * @route GET /api/v1/members/analytics/commission-activity
 * @access Private (Admin/Member)
 */
export const getCommissionActivity = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);
  const params = req.query as unknown as CommissionActivityParams;
  const pagination = parsePaginationParams(req.query);

  const result = await memberService.getCommissionActivity(orgId, params, pagination);

  res.status(200).json({
    success: true,
    message: "Commission activity retrieved successfully",
    data: result.data,
    meta: result.meta,
    filters: params,
  });
});

/**
 * Get overview of commission earned by team members, locations and sales items
 * @route GET /api/v1/members/analytics/commission-summary
 * @access Private (Admin/Member)
 */
export const getCommissionSummary = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { orgId } = await getAuthWithOrgId(req);
  const params = req.query as unknown as CommissionSummaryParams;

  const result = await memberService.getCommissionSummary(orgId, params);

  res.status(200).json({
    success: true,
    message: "Commission summary retrieved successfully",
    data: result,
    filters: params,
  });
});
