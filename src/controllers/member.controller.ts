import { Request, Response, NextFunction } from "express";
import { MemberService } from "@/services/member.service";
import { parsePaginationParams } from "@/utils/pagination";
import { verifyWebhook } from "@clerk/express/webhooks";
import { getAuthWithOrgId } from "@/middlewares/auth.middleware";
import { asyncHandler, AppError } from "@/middlewares/error.middleware";

export class MemberController {
  private memberService = new MemberService();

  // Create a new member
  public createMember = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const memberData = req.body;

    const member = await this.memberService.createMember(orgId, memberData);

    res.status(201).json({
      success: true,
      data: member,
      message: "Member created successfully",
    });
  });

  // Get all members with pagination and filters
  public getAllMembers = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
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

    const result = await this.memberService.getAllMembers(orgId, pagination, filters);

    res.status(200).json({
      success: true,
      message: "Members retrieved successfully",
      data: result.members,
      pagination: result.pagination,
    });
  });

  // Get member by ID
  public getMemberById = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const { id } = req.params;

    const member = await this.memberService.getMemberById(id, orgId);

    res.status(200).json({
      success: true,
      message: "Member retrieved successfully",
      data: member,
    });
  });

  // Update member
  public updateMember = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const { id } = req.params;
    const updateData = req.body;

    const member = await this.memberService.updateMember(id, orgId, updateData);

    res.status(200).json({
      success: true,
      message: "Member updated successfully",
      data: member,
    });
  });

  // Delete member
  public deleteMember = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const { id } = req.params;

    await this.memberService.deleteMember(id, orgId);

    res.status(200).json({
      success: true,
      message: "Member deleted successfully",
    });
  });

  // Assign services to member
  public assignServices = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const { id } = req.params;
    const { serviceIds } = req.body;

    await this.memberService.assignServicesToMember(id, orgId, serviceIds);

    res.status(200).json({
      success: true,
      message: "Services assigned successfully",
    });
  });

  // Get members by service
  public getMembersByService = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const { serviceId } = req.params;

    const members = await this.memberService.getMembersByService(serviceId, orgId);

    res.status(200).json({
      success: true,
      message: "Members retrieved successfully",
      data: members,
    });
  });

  // Get member statistics
  public getMemberStats = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);

    const stats = await this.memberService.getMemberStats(orgId);

    res.status(200).json({
      success: true,
      message: "Member statistics retrieved successfully",
      data: stats,
    });
  });

  // Toggle member status (activate/deactivate)
  public toggleMemberStatus = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const { id } = req.params;

    const member = await this.memberService.toggleMemberStatus(id, orgId);

    res.status(200).json({
      success: true,
      message: `Member ${member.isActive ? "activated" : "deactivated"} successfully`,
      data: member,
    });
  });

  // Search members
  public searchMembers = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const { q } = req.query;

    const pagination = parsePaginationParams(req.query);
    const result = await this.memberService.searchMembers(orgId, q as string, pagination);

    res.status(200).json({
      success: true,
      message: "Search completed successfully",
      data: result.members,
      pagination: result.pagination,
    });
  });

  // Get member profile (for the logged-in member)
  public getMemberProfile = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId, userId } = getAuthWithOrgId(req);

    const member = await this.memberService.getMemberByClerkId(userId as string, orgId);

    if (!member) {
      throw new AppError("Member profile not found", 404);
    }

    res.status(200).json({
      success: true,
      message: "Member profile retrieved successfully",
      data: member,
    });
  });

  // Update member profile (for the logged-in member)
  public updateMemberProfile = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId, userId } = getAuthWithOrgId(req);

    const member = await this.memberService.updateMemberProfile(userId as string, orgId, req.body);

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: member,
    });
  });

  public syncClerkUser = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    try {
      console.log("Webhook received, verifying...");
      const evt = await verifyWebhook(req);
      console.log("Webhook verified successfully, event type:", evt.type);
      console.log("Event data keys:", Object.keys(evt.data));

      if (evt.type === "user.created") {
        console.log("Processing user.created event for user:", evt.data.id);
        await this.memberService.createMemberFromWebhook(evt.data);
      }

      if (evt.type === "user.updated") {
        console.log("Processing user.updated event for user:", evt.data.id);
        await this.memberService.updateMemberFromWebhook(evt.data.id, evt.data);
      }

      if (evt.type === "user.deleted" && evt.data.deleted) {
        console.log("Processing user.deleted event for user:", evt.data.id);
        await this.memberService.deleteMemberFromWebhook(evt.data.id as string);
      }

      // Handle organization membership events for members
      if (evt.type === "organizationMembership.created") {
        console.log("Processing organizationMembership.created event");
        const { organization, public_user_data, role } = evt.data;
        console.log("Organization ID:", organization?.id, "User ID:", public_user_data?.user_id, "Role:", role);
        if (organization?.id && public_user_data?.user_id) {
          await this.memberService.handleOrganizationMembership(
            public_user_data.user_id,
            organization.id,
            "created",
            role,
          );
        }
      }

      if (evt.type === "organizationMembership.updated") {
        console.log("Processing organizationMembership.updated event");
        const { organization, public_user_data, role } = evt.data;
        console.log("Organization ID:", organization?.id, "User ID:", public_user_data?.user_id, "Role:", role);
        if (organization?.id && public_user_data?.user_id) {
          await this.memberService.handleOrganizationMembership(
            public_user_data.user_id,
            organization.id,
            "updated",
            role,
          );
        }
      }

      if (evt.type === "organizationMembership.deleted") {
        console.log("Processing organizationMembership.deleted event");
        const { organization, public_user_data } = evt.data;
        console.log("Organization ID:", organization?.id, "User ID:", public_user_data?.user_id);
        if (organization?.id && public_user_data?.user_id) {
          await this.memberService.handleOrganizationMembership(public_user_data.user_id, organization.id, "deleted");
        }
      }

      console.log("Webhook processed successfully");
      res.sendStatus(200);
    } catch (error) {
      console.error("Webhook verification failed:", error);
      res.status(400).json({ error: "Webhook verification failed" });
    }
  });
}
