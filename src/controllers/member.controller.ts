import { Request, Response, NextFunction } from "express";
import { MemberService } from "@/services/member.service";
import { getAuthWithOrgId } from "@/middlewares/auth.middleware";
import { asyncHandler, AppError } from "@/middlewares/error.middleware";
import { parsePaginationParams } from "@/utils/pagination";

export class MemberController {
  private memberService = new MemberService();

  // Create a new member
  public createMember = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const memberData = req.body;

    const member = await this.memberService.createMember(orgId, memberData);

    res.status(201).json({
      success: true,
      message: "Member created successfully",
      data: member
    });
  });

  // Get all members with pagination and filters
  public getAllMembers = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const pagination = parsePaginationParams(req.query);
    
    // Extract filters from query parameters
    const filters: {
      isActive?: boolean;
      search?: string;
      serviceId?: string;
    } = {};
    
    if (req.query.isActive !== undefined) {
      filters.isActive = req.query.isActive === 'true';
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
      pagination: result.pagination
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
      data: member
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
      data: member
    });
  });

  // Delete member
  public deleteMember = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const { id } = req.params;

    await this.memberService.deleteMember(id, orgId);

    res.status(200).json({
      success: true,
      message: "Member deleted successfully"
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
      message: "Services assigned successfully"
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
      data: members
    });
  });

  // Get member statistics
  public getMemberStats = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);

    const stats = await this.memberService.getMemberStats(orgId);

    res.status(200).json({
      success: true,
      message: "Member statistics retrieved successfully",
      data: stats
    });
  });

  // Toggle member status (activate/deactivate)
  public toggleMemberStatus = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const { id } = req.params;

    // Get current member status
    const currentMember = await this.memberService.getMemberById(id, orgId);
    
    // Toggle the status
    const member = await this.memberService.updateMember(id, orgId, {
      isActive: !currentMember.isActive
    });

    res.status(200).json({
      success: true,
      message: `Member ${member.isActive ? 'activated' : 'deactivated'} successfully`,
      data: member
    });
  });

  // Search members
  public searchMembers = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId } = getAuthWithOrgId(req);
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      throw new AppError("Search query is required", 400);
    }

    const pagination = parsePaginationParams(req.query);
    const result = await this.memberService.getAllMembers(orgId, pagination, {
      search: q
    });

    res.status(200).json({
      success: true,
      message: "Search completed successfully",
      data: result.members,
      pagination: result.pagination
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
      data: member
    });
  });

  // Update member profile (for the logged-in member)
  public updateMemberProfile = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { orgId, userId } = getAuthWithOrgId(req);
    
    const currentMember = await this.memberService.getMemberByClerkId(userId as string, orgId);
    
    if (!currentMember) {
      throw new AppError("Member profile not found", 404);
    }

    // Allow members to update only certain fields
    const allowedFields = [
      'phone', 'bio', 'profileImage', 'workingHours', 
      'dateOfBirth', 'address', 'emergencyContact'
    ];
    
    const updateData: Record<string, unknown> = {};
    Object.keys(req.body).forEach(key => {
      if (allowedFields.includes(key)) {
        updateData[key] = req.body[key];
      }
    });

    const member = await this.memberService.updateMember(currentMember.id, orgId, updateData);

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: member
    });
  });
}
