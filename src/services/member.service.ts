import { logger } from "@/utils/logger";
import { prisma } from "@/config/prisma";
import type { UserJSON } from "@clerk/express";
import { cacheService } from "./cache.service";
import { clerkClient } from "@/config/clerkClient";
import { AppError } from "@/middlewares/error.middleware";
import type { PaginationParams } from "@/utils/pagination";
import { createPaginatedResponse, type PaginatedResponse } from "@/utils/pagination";
import { handleError, executeClerkOperation } from "@/utils/errorHandler";
import { Member, MemberService as PrismaMemberService, Role, Prisma } from "@prisma/client";
import type {
  WorkingHoursActivityParams,
  BreakActivityParams,
  AttendanceSummaryParams,
  WagesDetailParams,
  WagesSummaryParams,
} from "@/validations/member.schema";

// Type definitions for better type safety
export interface WorkingHours {
  [key: string]:
    | {
        isWorking: boolean;
        startTime?: string;
        endTime?: string;
        breaks?: Array<{
          startTime: string;
          endTime: string;
        }>;
      }
    | undefined;
}

export interface Address {
  [key: string]: string | undefined;
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}

export interface EmergencyContact {
  [key: string]: string | undefined;
  name: string;
  relationship: string;
  phone: string;
  email?: string;
}

export interface CreateMemberData {
  username: string;
  email: string;
  phone?: string;
  role?: Role;
  jobTitle?: string;
  bio?: string;
  workingHours?: WorkingHours;
  commissionRate?: number;
  hourlyRate?: number;
  dateOfBirth?: Date;
  address?: Address;
  emergencyContact?: EmergencyContact;
  startDate?: Date;
  serviceIds?: string[];
}

export interface UpdateMemberData {
  username?: string;
  email?: string;
  phone?: string;
  profileImage?: string;
  role?: Role;
  jobTitle?: string;
  bio?: string;
  workingHours?: WorkingHours;
  isActive?: boolean;
  commissionRate?: number;
  hourlyRate?: number;
  dateOfBirth?: Date;
  address?: Address;
  emergencyContact?: EmergencyContact;
  endDate?: Date;
  serviceIds?: string[];
}

export interface MemberWithServices extends Member {
  memberServices: (PrismaMemberService & {
    service: {
      id: string;
      name: string;
      slug: string;
      category: {
        name: string;
      };
    };
  })[];
}

interface ShiftData {
  duration?: number;
  status?: string;
}

interface AppointmentData {
  price?: number;
  status?: string;
}

interface MemberWithShiftsAndAppointments {
  shifts: Array<ShiftData>;
  appointments: Array<AppointmentData>;
  hourlyRate?: number | null;
  commissionRate?: number | null;
}

export class MemberService {
  // Private helper to build member include object (for reusability)
  private readonly memberInclude = {
    memberServices: {
      include: {
        service: {
          include: {
            category: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    },
  };

  // Cache key generators
  private getCacheKey(orgId: string, suffix: string): string {
    return `member:${orgId}:${suffix}`;
  }

  private getMemberCacheKey(memberId: string, orgId: string): string {
    return this.getCacheKey(orgId, `id:${memberId}`);
  }

  private getMemberByClerkIdCacheKey(clerkId: string, orgId: string): string {
    return this.getCacheKey(orgId, `clerk:${clerkId}`);
  }

  private getAllMembersCacheKey(
    orgId: string,
    pagination: PaginationParams,
    filters?: {
      isActive?: boolean;
      search?: string;
      serviceId?: string;
    },
  ): string {
    const filterKey = filters ? `filters:${JSON.stringify(filters)}` : "all";
    return this.getCacheKey(orgId, `list:${pagination.page}:${pagination.limit}:${filterKey}`);
  }

  private getMemberStatsCacheKey(orgId: string): string {
    return this.getCacheKey(orgId, "stats");
  }

  private getMembersByServiceCacheKey(serviceId: string, orgId: string): string {
    return this.getCacheKey(orgId, `service:${serviceId}`);
  }

  // Cache invalidation helper
  private async invalidateMemberCache(orgId: string): Promise<void> {
    await cacheService.invalidatePattern(`member:${orgId}:*`);
  }

  // Private helper to validate organization membership
  private async validateOrgMembership(orgId: string): Promise<void> {
    if (!orgId || orgId.trim() === "") {
      throw new AppError("Organization ID is required", 400);
    }
  }

  // Private helper to parse date strings
  private parseDate(dateString?: string): Date | undefined {
    if (!dateString) return undefined;

    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      throw new AppError("Invalid date format", 400);
    }
    return date;
  }
  // Create a new member and sync with Clerk
  public async createMember(orgId: string, data: CreateMemberData): Promise<MemberWithServices> {
    await this.validateOrgMembership(orgId);

    // Validate required fields
    if (!data.email || !data.username) {
      throw new AppError("Email and username are required", 400);
    }

    // First, check if member with this email already exists in the organization
    const existingMember = await prisma.member.findUnique({
      where: {
        email_orgId: {
          email: data.email,
          orgId,
        },
      },
    });

    if (existingMember) {
      throw new AppError("A member with this email already exists in your organization", 400);
    }

    try {
      const clerkUser = await executeClerkOperation(
        () =>
          clerkClient.users.createUser({
            emailAddress: [data.email],
            username: data.username,
            password: "SecureTemp@2024!", // Secure temporary password - user will be invited to change it
          }),
        "createUser",
        "Failed to create user account",
      );

      // Create membership for the user in the organization
      await executeClerkOperation(
        () =>
          clerkClient.organizations.createOrganizationMembership({
            organizationId: orgId,
            userId: clerkUser.id,
            role: "org:member",
          }),
        "createOrganizationMembership",
        "Failed to add user to organization",
      );

      // Create member in our database
      const member = await prisma.member.create({
        data: {
          clerkId: clerkUser.id,
          orgId,
          role: data.role || Role.MEMBER,
          username: data.username,
          email: data.email,
          phone: data.phone,
          jobTitle: data.jobTitle,
          bio: data.bio,
          workingHours: data.workingHours,
          commissionRate: data.commissionRate,
          hourlyRate: data.hourlyRate,
          dateOfBirth: typeof data.dateOfBirth === "string" ? this.parseDate(data.dateOfBirth) : data.dateOfBirth,
          address: data.address,
          emergencyContact: data.emergencyContact,
          startDate: typeof data.startDate === "string" ? this.parseDate(data.startDate) : data.startDate || new Date(),
        },
        include: this.memberInclude,
      });

      // Assign services if provided
      if (data.serviceIds && data.serviceIds.length > 0) {
        await this.assignServicesToMember(member.id, orgId, data.serviceIds);
        // Return updated member with services
        const updatedMember = await this.getMemberById(member.id, orgId);

        // Cache the created member
        const memberCacheKey = this.getMemberCacheKey(member.id, orgId);
        await cacheService.set(memberCacheKey, updatedMember, 3600); // 1 hour cache

        // Invalidate list caches
        await this.invalidateMemberCache(orgId);

        return updatedMember;
      }

      // Cache the created member
      const memberCacheKey = this.getMemberCacheKey(member.id, orgId);
      await cacheService.set(memberCacheKey, member, 3600); // 1 hour cache

      // Invalidate list caches
      await this.invalidateMemberCache(orgId);

      return member;
    } catch (error: unknown) {
      if (error instanceof AppError) {
        throw error;
      }
      handleError(error, "createMember", "Failed to create member");
    }
  }

  // Get member by ID with services
  public async getMemberById(id: string, orgId: string): Promise<MemberWithServices> {
    await this.validateOrgMembership(orgId);

    if (!id || id.trim() === "") {
      throw new AppError("Member ID is required", 400);
    }

    // Check cache first
    const cacheKey = this.getMemberCacheKey(id, orgId);
    const cached = await cacheService.get<MemberWithServices>(cacheKey);

    if (cached) {
      return cached;
    }

    const member = await prisma.member.findFirst({
      where: { id, orgId },
      include: this.memberInclude,
    });

    if (!member) {
      throw new AppError("Member not found", 404);
    }

    // Cache the result for 1 hour
    await cacheService.set(cacheKey, member, 3600);

    return member;
  }

  // Get member by Clerk ID
  public async getMemberByClerkId(clerkId: string, orgId: string): Promise<MemberWithServices | null> {
    await this.validateOrgMembership(orgId);

    if (!clerkId || clerkId.trim() === "") {
      throw new AppError("Clerk ID is required", 400);
    }

    // Check cache first
    const cacheKey = this.getMemberByClerkIdCacheKey(clerkId, orgId);
    const cached = await cacheService.get<MemberWithServices | null>(cacheKey);

    if (cached !== undefined) {
      return cached;
    }

    const member = await prisma.member.findFirst({
      where: { clerkId, orgId },
      include: this.memberInclude,
    });

    // Cache the result for 1 hour (cache null results with shorter TTL)
    const ttl = member ? 3600 : 300; // 5 minutes for null results
    await cacheService.set(cacheKey, member, ttl);

    return member;
  }

  // Get all members for an organization with pagination
  public async getAllMembers(
    orgId: string,
    pagination: PaginationParams,
    filters?: {
      isActive?: boolean;
      search?: string;
      serviceId?: string;
    },
  ): Promise<PaginatedResponse<MemberWithServices>> {
    await this.validateOrgMembership(orgId);

    const { page, limit, skip } = pagination;

    // Check cache first
    const cacheKey = this.getAllMembersCacheKey(orgId, pagination, filters);
    const cached = await cacheService.get<PaginatedResponse<MemberWithServices>>(cacheKey);

    if (cached) {
      return cached;
    }

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whereConditions: Record<string, any> = {
      // Filter by organization and exclude global users (empty orgId)
      AND: [{ orgId }, { orgId: { not: "" } }],
    };

    // Add filters conditionally
    if (filters?.isActive !== undefined) {
      whereConditions.isActive = filters.isActive;
    }

    if (filters?.search && filters.search.trim() !== "") {
      whereConditions.OR = [
        { username: { contains: filters.search.trim(), mode: "insensitive" as const } },
        { email: { contains: filters.search.trim(), mode: "insensitive" as const } },
        { jobTitle: { contains: filters.search.trim(), mode: "insensitive" as const } },
      ];
    }

    if (filters?.serviceId && filters.serviceId.trim() !== "") {
      whereConditions.memberServices = {
        some: {
          serviceId: filters.serviceId.trim(),
        },
      };
    }

    try {
      const [members, total] = await Promise.all([
        prisma.member.findMany({
          where: whereConditions,
          include: this.memberInclude,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.member.count({ where: whereConditions }),
      ]);

      const result = createPaginatedResponse(members, total, page, limit);

      // Cache the result for 30 minutes (shorter TTL for paginated lists)
      await cacheService.set(cacheKey, result, 1800);

      return result;
    } catch (error) {
      logger.error("Error fetching members:", error);
      throw new AppError("Failed to fetch members", 500);
    }
  }

  // Update member
  public async updateMember(id: string, orgId: string, data: UpdateMemberData): Promise<MemberWithServices> {
    await this.validateOrgMembership(orgId);

    // Check if member exists
    const existingMember = await this.getMemberById(id, orgId);

    // If email is being updated, check for duplicates
    if (data.email && data.email !== existingMember.email) {
      const duplicateMember = await prisma.member.findUnique({
        where: {
          email_orgId: {
            email: data.email,
            orgId,
          },
        },
      });

      if (duplicateMember) {
        throw new AppError("A member with this email already exists in your organization", 400);
      }
    }

    try {
      // Update Clerk user if email or username changed
      if (data.email || data.username) {
        const updateData: {
          username?: string;
          primaryEmailAddressId?: string;
        } = {};
        if (data.username) updateData.username = data.username;

        // For email updates, we need to handle it properly
        if (data.email) {
          // First, add the new email address and mark it as verified for admin updates
          const newEmailAddress = await executeClerkOperation(
            () =>
              clerkClient.emailAddresses.createEmailAddress({
                userId: existingMember.clerkId,
                emailAddress: data.email!,
                verified: true, // Skip verification for admin-created emails
              }),
            "createEmailAddress",
            "Failed to update email address",
          );

          // Set the new email as primary
          updateData.primaryEmailAddressId = newEmailAddress.id;
        }

        // Update the user with any other changes
        if (Object.keys(updateData).length > 0) {
          await executeClerkOperation(
            () => clerkClient.users.updateUser(existingMember.clerkId, updateData),
            "updateUser",
            "Failed to update user account",
          );
        }
      }

      // Extract serviceIds before updating member
      const { serviceIds, ...memberData } = data;

      // Parse dates properly
      const parsedData = {
        ...memberData,
        dateOfBirth:
          typeof memberData.dateOfBirth === "string" ? this.parseDate(memberData.dateOfBirth) : memberData.dateOfBirth,
        endDate: typeof memberData.endDate === "string" ? this.parseDate(memberData.endDate) : memberData.endDate,
      };

      // Update member in database
      await prisma.member.update({
        where: { id },
        data: parsedData,
      });

      // Update service assignments if provided
      if (serviceIds !== undefined) {
        await this.assignServicesToMember(id, orgId, serviceIds);
      }

      const updatedMember = await this.getMemberById(id, orgId);

      // Invalidate all member-related caches for this organization
      await this.invalidateMemberCache(orgId);

      return updatedMember;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      handleError(error, "updateMember", "Failed to update member");
    }
  }

  // Delete member and remove from Clerk
  public async deleteMember(id: string, orgId: string): Promise<void> {
    const member = await this.getMemberById(id, orgId);

    try {
      // Remove member from Clerk organization
      // Note: In production, you might want to just disable the user instead
      await executeClerkOperation(
        () => clerkClient.users.deleteUser(member.clerkId),
        "deleteUser",
        "Failed to remove user account",
      );

      // Delete member from database (this will cascade delete memberServices)
      await prisma.member.delete({
        where: { id },
      });

      // Invalidate all member-related caches for this organization
      await this.invalidateMemberCache(orgId);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      handleError(error, "deleteMember", "Failed to delete member");
    }
  }

  // Bulk delete members
  public async bulkDeleteMembers(
    memberIds: string[],
    orgId: string,
  ): Promise<{
    deleted: string[];
    failed: Array<{ id: string; error: string }>;
  }> {
    await this.validateOrgMembership(orgId);

    if (memberIds.length === 0) {
      throw new AppError("At least one member ID is required", 400);
    }

    if (memberIds.length > 50) {
      throw new AppError("Cannot delete more than 50 members at once", 400);
    }

    const deleted: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    // Process deletions one by one to handle individual failures
    for (const memberId of memberIds) {
      try {
        await this.deleteMember(memberId, orgId);
        deleted.push(memberId);
      } catch (error) {
        const errorMessage = error instanceof AppError ? error.message : "Unknown error occurred";
        failed.push({ id: memberId, error: errorMessage });
        logger.error(`Failed to delete member ${memberId}:`, error);
      }
    }

    // Invalidate all member-related caches for this organization
    await this.invalidateMemberCache(orgId);

    logger.info(`Bulk delete completed. Deleted: ${deleted.length}, Failed: ${failed.length}`, {
      orgId,
      deleted,
      failed: failed.map((f) => f.id),
    });

    return { deleted, failed };
  }

  // Assign services to member
  public async assignServicesToMember(memberId: string, orgId: string, serviceIds: string[]): Promise<void> {
    // Verify member exists
    await this.getMemberById(memberId, orgId);

    // Verify all services exist and belong to the organization
    const services = await prisma.service.findMany({
      where: {
        id: { in: serviceIds },
        orgId,
      },
    });

    if (services.length !== serviceIds.length) {
      throw new AppError("One or more services not found", 404);
    }

    // Remove existing service assignments
    await prisma.memberService.deleteMany({
      where: { memberId },
    });

    // Create new service assignments
    if (serviceIds.length > 0) {
      await prisma.memberService.createMany({
        data: serviceIds.map((serviceId) => ({
          memberId,
          serviceId,
          orgId,
        })),
      });
    }

    // Invalidate member-related caches as service assignments have changed
    await this.invalidateMemberCache(orgId);
  }

  // Get members by service
  public async getMembersByService(serviceId: string, orgId: string): Promise<MemberWithServices[]> {
    // Check cache first
    const cacheKey = this.getMembersByServiceCacheKey(serviceId, orgId);
    const cached = await cacheService.get<MemberWithServices[]>(cacheKey);

    if (cached) {
      return cached;
    }

    const members = await prisma.member.findMany({
      where: {
        orgId,
        isActive: true,
        memberServices: {
          some: {
            serviceId,
          },
        },
      },
      include: {
        memberServices: {
          include: {
            service: {
              include: {
                category: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { username: "asc" },
    });

    // Cache the result for 1 hour
    await cacheService.set(cacheKey, members, 3600);

    return members;
  }

  // Get member statistics
  public async getMemberStats(orgId: string) {
    // Check cache first
    const cacheKey = this.getMemberStatsCacheKey(orgId);
    const cached = await cacheService.get<{
      totalMembers: number;
      activeMembers: number;
      inactiveMembers: number;
    }>(cacheKey);

    if (cached) {
      return cached;
    }

    const [totalMembers, activeMembers, inactiveMembers] = await Promise.all([
      prisma.member.count({ where: { orgId } }),
      prisma.member.count({ where: { orgId, isActive: true } }),
      prisma.member.count({ where: { orgId, isActive: false } }),
    ]);

    const stats = {
      totalMembers,
      activeMembers,
      inactiveMembers,
    };

    // Cache the result for 15 minutes (stats change less frequently)
    await cacheService.set(cacheKey, stats, 900);

    return stats;
  }

  // Toggle member status
  public async toggleMemberStatus(id: string, orgId: string): Promise<MemberWithServices> {
    const currentMember = await this.getMemberById(id, orgId);

    const updatedMember = await this.updateMember(id, orgId, {
      isActive: !currentMember.isActive,
    });

    // Note: updateMember already invalidates cache, so no need to do it again
    return updatedMember;
  }

  // Search members with pagination
  public async searchMembers(
    orgId: string,
    query: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResponse<MemberWithServices>> {
    return await this.getAllMembers(orgId, pagination, {
      search: query,
    });
  }

  // Update member profile with restricted fields
  public async updateMemberProfile(
    clerkId: string,
    orgId: string,
    updateData: Record<string, unknown>,
  ): Promise<MemberWithServices> {
    const currentMember = await this.getMemberByClerkId(clerkId, orgId);

    if (!currentMember) {
      throw new AppError("Member profile not found", 404);
    }

    // Allow members to update only certain fields
    const allowedFields = [
      "username",
      "phone",
      "bio",
      "profileImage",
      "workingHours",
      "dateOfBirth",
      "address",
      "emergencyContact",
    ];

    const filteredUpdateData: Record<string, unknown> = {};
    Object.keys(updateData).forEach((key) => {
      if (allowedFields.includes(key)) {
        filteredUpdateData[key] = updateData[key];
      }
    });

    return await this.updateMember(currentMember.id, orgId, filteredUpdateData);
  }

  // ========== USER-RELATED METHODS ==========

  // Create member from Clerk webhook data
  public async createMemberFromWebhook(userData: UserJSON): Promise<void> {
    const { id, email_addresses, username, image_url, organization_memberships } = userData;

    // Extract primary email
    const primaryEmail = email_addresses?.find(
      (email) => email.id === userData.primary_email_address_id,
    )?.email_address;

    if (!primaryEmail) {
      logger.warn(`No primary email found for user ${id}, skipping member creation`);
      return;
    }

    // Check if user has organization memberships
    if (!organization_memberships || organization_memberships.length === 0) {
      logger.info(`User ${id} created without organization membership, creating a global user record`);

      // Create a global user record without organization (orgId will be empty)
      // This will be updated later when they're added to an organization via organizationMembership.created
      const existingGlobalUser = await prisma.member.findFirst({
        where: { clerkId: id, orgId: "" },
      });

      if (!existingGlobalUser) {
        await prisma.member.create({
          data: {
            clerkId: id,
            orgId: "", // Empty orgId for users not yet in any organization
            role: Role.MEMBER, // Default role
            username: username || "",
            email: primaryEmail,
            profileImage: image_url,
            isActive: false, // Inactive until they join an organization
          },
        });
        logger.info(`Created global user record for ${id} without organization`);
      } else {
        // Update existing global user record
        await prisma.member.update({
          where: { id: existingGlobalUser.id },
          data: {
            username: username || existingGlobalUser.username,
            email: primaryEmail,
            profileImage: image_url || existingGlobalUser.profileImage,
          },
        });
        logger.info(`Updated existing global user record for ${id}`);
      }

      // No cache invalidation needed for global users as they're not org-specific
      return;
    }

    // Create member for each organization they belong to
    for (const membership of organization_memberships) {
      const orgId = membership.id;
      const role = membership.role === "org:admin" ? Role.ADMIN : Role.MEMBER;

      // Check if member already exists in this organization
      const existingMember = await this.getMemberByClerkId(id, orgId);

      if (!existingMember) {
        logger.info(`Creating member for user ${id} in organization ${orgId} with role ${role}`);
        await prisma.member.create({
          data: {
            clerkId: id,
            orgId: orgId,
            role: role,
            username: username || "",
            email: primaryEmail,
            profileImage: image_url,
            isActive: true,
          },
        });

        // Invalidate cache for this organization
        await this.invalidateMemberCache(orgId);
      } else {
        logger.info(`Member already exists for user ${id} in organization ${orgId}, updating details`);
        await prisma.member.update({
          where: { id: existingMember.id },
          data: {
            username: username || existingMember.username,
            email: primaryEmail,
            profileImage: image_url || existingMember.profileImage,
            role: role,
            isActive: true,
            orgId: orgId, // Ensure orgId is properly set
          },
        });

        // Invalidate cache for this organization
        await this.invalidateMemberCache(orgId);
      }
    }
  }

  // Update member from Clerk webhook data
  public async updateMemberFromWebhook(clerkId: string, userData: UserJSON): Promise<void> {
    const { email_addresses, username, image_url } = userData;

    // Extract primary email
    const primaryEmail = email_addresses?.find(
      (email) => email.id === userData.primary_email_address_id,
    )?.email_address;

    // Find all members with this clerkId (they might be in multiple organizations)
    const members = await prisma.member.findMany({
      where: { clerkId },
    });

    // Update all instances of this member across organizations
    for (const member of members) {
      await prisma.member.update({
        where: { id: member.id },
        data: {
          username: username || member.username,
          email: primaryEmail || member.email,
          profileImage: image_url || member.profileImage,
        },
      });

      // Invalidate cache for each organization
      if (member.orgId && member.orgId !== "") {
        await this.invalidateMemberCache(member.orgId);
      }
    }
  }

  // Delete member from Clerk webhook data
  public async deleteMemberFromWebhook(clerkId: string): Promise<void> {
    // Get all organizations this member belongs to before deletion
    const members = await prisma.member.findMany({
      where: { clerkId },
      select: { orgId: true },
    });

    // Delete all instances of this member across organizations
    await prisma.member.deleteMany({
      where: { clerkId },
    });

    // Invalidate cache for all affected organizations
    for (const member of members) {
      if (member.orgId && member.orgId !== "") {
        await this.invalidateMemberCache(member.orgId);
      }
    }
  }

  // Get member by Clerk ID (first match across organizations, excluding global users)
  public async getMemberByClerkIdAny(clerkId: string): Promise<Member | null> {
    return await prisma.member.findFirst({
      where: {
        clerkId,
        orgId: { not: "" }, // Exclude global users (empty orgId)
      },
    });
  }

  // Handle organization membership events
  public async handleOrganizationMembership(
    clerkUserId: string,
    orgId: string,
    action: "created" | "updated" | "deleted",
    membershipRole?: string,
  ): Promise<void> {
    if (action === "created") {
      // Check if this user already exists as a member in this organization
      const existingMember = await this.getMemberByClerkId(clerkUserId, orgId);

      if (!existingMember) {
        // Check if they exist as a global user (empty orgId) or in another organization
        const globalUser = await prisma.member.findFirst({
          where: { clerkId: clerkUserId, orgId: "" },
        });

        if (globalUser) {
          logger.info(`Found global user record for ${clerkUserId}, converting to organization member`);
          // Update the global user record to be part of this organization
          await prisma.member.update({
            where: { id: globalUser.id },
            data: {
              orgId: orgId,
              role: membershipRole === "org:admin" ? Role.ADMIN : Role.MEMBER,
              isActive: true,
            },
          });

          // Invalidate cache for this organization
          await this.invalidateMemberCache(orgId);
        } else {
          // Check if they exist in another organization
          const memberInOtherOrg = await this.getMemberByClerkIdAny(clerkUserId);

          if (memberInOtherOrg) {
            // Create a new member record for this organization based on existing data
            await prisma.member.create({
              data: {
                clerkId: clerkUserId,
                orgId,
                role: memberInOtherOrg.role || (membershipRole === "org:admin" ? Role.ADMIN : Role.MEMBER),
                username: memberInOtherOrg.username,
                email: memberInOtherOrg.email,
                profileImage: memberInOtherOrg.profileImage,
                isActive: true,
              },
            });

            // Invalidate cache for this organization
            await this.invalidateMemberCache(orgId);
          } else {
            // Create a minimal member record - will be updated when they complete profile
            await prisma.member.create({
              data: {
                clerkId: clerkUserId,
                orgId,
                role: membershipRole === "org:admin" ? Role.ADMIN : Role.MEMBER,
                username: `${clerkUserId}@temp.local`, // Temporary username
                email: `${clerkUserId}@temp.local`, // Temporary email
                isActive: true,
              },
            });

            // Invalidate cache for this organization
            await this.invalidateMemberCache(orgId);
          }
        }
      } else {
        // Member already exists - update with organization membership details
        logger.info(`Member already exists for user ${clerkUserId} in org ${orgId}, updating with membership details`);
        await prisma.member.update({
          where: { id: existingMember.id },
          data: {
            isActive: true,
            role: membershipRole === "org:admin" ? Role.ADMIN : Role.MEMBER,
            orgId: orgId, // Ensure orgId is properly set
          },
        });

        // Invalidate cache for this organization
        await this.invalidateMemberCache(orgId);
      }
    } else if (action === "updated") {
      // Update member role if membership role changed
      const member = await this.getMemberByClerkId(clerkUserId, orgId);
      if (member && membershipRole) {
        await prisma.member.update({
          where: { id: member.id },
          data: {
            role: membershipRole === "org:admin" ? Role.ADMIN : Role.MEMBER,
          },
        });

        // Invalidate cache for this organization
        await this.invalidateMemberCache(orgId);
      }
    } else if (action === "deleted") {
      // Deactivate member in this organization
      const member = await this.getMemberByClerkId(clerkUserId, orgId);
      if (member) {
        await prisma.member.update({
          where: { id: member.id },
          data: { isActive: false },
        });

        // Invalidate cache for this organization
        await this.invalidateMemberCache(orgId);
      }
    }
  }

  // Analytics and Reporting Methods

  /**
   * Get working hours activity analytics for team members
   */
  async getWorkingHoursActivity(orgId: string, params: WorkingHoursActivityParams, pagination: PaginationParams) {
    try {
      const {
        period,
        startDate,
        endDate,
        memberIds,
        departments,
        roles,
        isActive,
        sortBy = "name",
        sortOrder = "asc",
        includeDetails = [],
        minHours,
        maxHours,
        shiftStatus,
        includeBreakdown = false,
        groupBy: _groupBy = "member",
      } = params;

      // Calculate date range
      const dateRange = this.calculateDateRange(period, startDate, endDate);

      // Build member filter
      const memberWhere: Prisma.MemberWhereInput = {
        orgId,
        ...(isActive !== undefined && { isActive }),
        ...(memberIds && { id: { in: memberIds } }),
        ...(roles && { role: { in: roles } }),
        ...(departments && { jobTitle: { in: departments } }),
      };

      // Build shift filter
      const shiftWhere: Prisma.ShiftWhereInput = {
        orgId,
        date: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
        ...(shiftStatus && { status: { in: shiftStatus } }),
      };

      // Get members with their shifts
      const members = await prisma.member.findMany({
        where: memberWhere,
        include: {
          shifts: {
            where: shiftWhere,
            orderBy: { date: "desc" },
          },
        },
        orderBy: this.buildMemberOrderBy(sortBy, sortOrder),
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      });

      // Calculate working hours analytics for each member
      const enrichedMembers = (
        await Promise.all(
          members.map(async (member) => {
            const hoursAnalysis = await this.calculateWorkingHoursAnalysis(
              member.shifts,
              includeDetails,
              includeBreakdown,
            );

            // Apply hours filters if specified
            if (minHours !== undefined && hoursAnalysis.totalHours < minHours) return null;
            if (maxHours !== undefined && hoursAnalysis.totalHours > maxHours) return null;

            return {
              id: member.id,
              name: member.username,
              email: member.email,
              jobTitle: member.jobTitle,
              role: member.role,
              isActive: member.isActive,
              ...hoursAnalysis,
            };
          }),
        )
      ).filter(Boolean) as Array<Record<string, unknown>>;

      // Calculate summary statistics
      const summary = this.calculateWorkingHoursSummary(enrichedMembers);

      // Get total count for pagination
      const total = await prisma.member.count({ where: memberWhere });

      return {
        data: enrichedMembers,
        summary,
        meta: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          totalPages: Math.ceil(total / pagination.limit),
        },
      };
    } catch (error) {
      handleError(error, "getWorkingHoursActivity", "Failed to get working hours activity");
    }
  }

  /**
   * Get break activity analytics for team members
   */
  async getBreakActivity(orgId: string, params: BreakActivityParams, pagination: PaginationParams) {
    try {
      const {
        period,
        startDate,
        endDate,
        memberIds,
        roles,
        isActive,
        sortBy = "name",
        sortOrder = "asc",
        includeDetails = [],
        breakType,
        minBreakDuration,
        maxBreakDuration,
        adherenceThreshold = 90,
        includeViolations = false,
        groupBy: _groupBy2 = "member",
      } = params;

      const dateRange = this.calculateDateRange(period, startDate, endDate);

      const memberWhere: Prisma.MemberWhereInput = {
        orgId,
        ...(isActive !== undefined && { isActive }),
        ...(memberIds && { id: { in: memberIds } }),
        ...(roles && { role: { in: roles } }),
      };

      const shiftWhere: Prisma.ShiftWhereInput = {
        orgId,
        date: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
        breaks: { not: null },
      };

      const members = await prisma.member.findMany({
        where: memberWhere,
        include: {
          shifts: {
            where: shiftWhere,
            orderBy: { date: "desc" },
          },
        },
        orderBy: this.buildMemberOrderBy(sortBy, sortOrder),
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      });

      const enrichedMembers = await Promise.all(
        members.map(async (member) => {
          const breakAnalysis = await this.calculateBreakAnalysis(
            member.shifts,
            includeDetails,
            breakType,
            minBreakDuration,
            maxBreakDuration,
            adherenceThreshold,
            includeViolations,
          );

          return {
            id: member.id,
            name: member.username,
            email: member.email,
            jobTitle: member.jobTitle,
            role: member.role,
            isActive: member.isActive,
            ...breakAnalysis,
          };
        }),
      );

      const summary = this.calculateBreakSummary(enrichedMembers);
      const total = await prisma.member.count({ where: memberWhere });

      return {
        data: enrichedMembers,
        summary,
        meta: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          totalPages: Math.ceil(total / pagination.limit),
        },
      };
    } catch (error) {
      handleError(error, "getBreakActivity", "Failed to get break activity");
    }
  }

  /**
   * Get attendance summary analytics for team members
   */
  async getAttendanceSummary(orgId: string, params: AttendanceSummaryParams, pagination: PaginationParams) {
    try {
      const {
        period,
        startDate,
        endDate,
        memberIds,
        roles,
        isActive,
        sortBy = "name",
        sortOrder = "asc",
        includeMetrics = [],
        punctualityThreshold = 15, // 15 minutes grace period
        includePatterns = false,
        includeTrends = false,
        compareWithPrevious = false,
        groupBy: _groupBy3 = "member",
      } = params;

      const dateRange = this.calculateDateRange(period, startDate, endDate);

      const memberWhere: Prisma.MemberWhereInput = {
        orgId,
        ...(isActive !== undefined && { isActive }),
        ...(memberIds && { id: { in: memberIds } }),
        ...(roles && { role: { in: roles } }),
      };

      const members = await prisma.member.findMany({
        where: memberWhere,
        include: {
          shifts: {
            where: {
              orgId,
              date: {
                gte: dateRange.start,
                lte: dateRange.end,
              },
            },
            orderBy: { date: "desc" },
          },
        },
        orderBy: this.buildMemberOrderBy(sortBy, sortOrder),
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      });

      const enrichedMembers = await Promise.all(
        members.map(async (member) => {
          const attendanceAnalysis = await this.calculateAttendanceAnalysis(
            member.shifts,
            includeMetrics,
            punctualityThreshold,
            includePatterns,
            includeTrends,
          );

          return {
            id: member.id,
            name: member.username,
            email: member.email,
            jobTitle: member.jobTitle,
            role: member.role,
            isActive: member.isActive,
            ...attendanceAnalysis,
          };
        }),
      );

      const summary = this.calculateAttendanceSummary(enrichedMembers);
      const total = await prisma.member.count({ where: memberWhere });

      // Add previous period comparison if requested
      let comparison = {};
      if (compareWithPrevious) {
        comparison = await this.getPreviousPeriodAttendanceComparison(orgId, dateRange, params);
      }

      return {
        data: enrichedMembers,
        summary: {
          ...summary,
          comparison,
        },
        meta: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          totalPages: Math.ceil(total / pagination.limit),
        },
      };
    } catch (error) {
      handleError(error, "getAttendanceSummary", "Failed to get attendance summary");
    }
  }

  /**
   * Get detailed wages information for team members
   */
  async getWagesDetail(orgId: string, params: WagesDetailParams, pagination: PaginationParams) {
    try {
      const {
        period,
        startDate,
        endDate,
        memberIds,
        roles,
        isActive,
        sortBy = "name",
        sortOrder = "asc",
        includeComponents = [],
        minWage,
        maxWage,
        payPeriod = "monthly",
        includeBreakdown = false,
        includeProjections = false,
        groupBy: _groupBy4 = "member",
      } = params;

      const dateRange = this.calculateDateRange(period, startDate, endDate);

      const memberWhere: Prisma.MemberWhereInput = {
        orgId,
        ...(isActive !== undefined && { isActive }),
        ...(memberIds && { id: { in: memberIds } }),
        ...(roles && { role: { in: roles } }),
      };

      const members = await prisma.member.findMany({
        where: memberWhere,
        include: {
          shifts: {
            where: {
              orgId,
              date: {
                gte: dateRange.start,
                lte: dateRange.end,
              },
              status: "COMPLETED",
            },
          },
          appointments: {
            where: {
              orgId,
              startTime: {
                gte: dateRange.start,
                lte: dateRange.end,
              },
              status: "COMPLETED",
            },
          },
        },
        orderBy: this.buildMemberOrderBy(sortBy, sortOrder),
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      });

      const enrichedMembers = (
        await Promise.all(
          members.map(async (member) => {
            const wagesAnalysis = await this.calculateWagesAnalysis(
              member,
              includeComponents,
              payPeriod,
              includeBreakdown,
              includeProjections,
              dateRange,
            );

            // Apply wage filters if specified
            if (minWage !== undefined && wagesAnalysis.totalWages < minWage) return null;
            if (maxWage !== undefined && wagesAnalysis.totalWages > maxWage) return null;

            return {
              id: member.id,
              name: member.username,
              email: member.email,
              jobTitle: member.jobTitle,
              role: member.role,
              isActive: member.isActive,
              hourlyRate: member.hourlyRate,
              commissionRate: member.commissionRate,
              ...wagesAnalysis,
            };
          }),
        )
      ).filter(Boolean) as Array<Record<string, unknown>>;
      const summary = this.calculateWagesSummary(enrichedMembers);
      const total = await prisma.member.count({ where: memberWhere });

      return {
        data: enrichedMembers,
        summary,
        meta: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          totalPages: Math.ceil(total / pagination.limit),
        },
      };
    } catch (error) {
      handleError(error, "getWagesDetail", "Failed to get wages detail");
    }
  }

  /**
   * Get wages summary analytics for team members
   */
  async getWagesSummary(orgId: string, params: WagesSummaryParams) {
    try {
      const {
        period,
        startDate,
        endDate,
        memberIds,
        roles,
        isActive,
        includeMetrics = [],
        includeTrends = false,
        includeComparisons = false,
        includeForecasting = false,
        compareWithBudget = false,
        budgetAmount,
        groupBy = "department",
      } = params;

      const dateRange = this.calculateDateRange(period, startDate, endDate);

      const memberWhere: Prisma.MemberWhereInput = {
        orgId,
        ...(isActive !== undefined && { isActive }),
        ...(memberIds && { id: { in: memberIds } }),
        ...(roles && { role: { in: roles } }),
      };

      const members = await prisma.member.findMany({
        where: memberWhere,
        include: {
          shifts: {
            where: {
              orgId,
              date: {
                gte: dateRange.start,
                lte: dateRange.end,
              },
              status: "COMPLETED",
            },
          },
          appointments: {
            where: {
              orgId,
              startTime: {
                gte: dateRange.start,
                lte: dateRange.end,
              },
              status: "COMPLETED",
            },
          },
        },
      });

      // Calculate comprehensive wages summary
      const summary: Record<string, unknown> = await this.calculateComprehensiveWagesSummary(
        members,
        includeMetrics,
        groupBy,
        dateRange,
      );

      // Add trends if requested
      if (includeTrends) {
        summary.trends = await this.calculateWagesTrends(orgId, dateRange, memberWhere);
      }

      // Add comparisons if requested
      if (includeComparisons) {
        summary.comparisons = await this.calculateWagesComparisons(orgId, dateRange, memberWhere);
      }

      // Add forecasting if requested
      if (includeForecasting) {
        summary.forecasting = await this.calculateWagesForecasting(summary.trends as Array<Record<string, unknown>>);
      }

      // Add budget comparison if requested
      if (compareWithBudget && budgetAmount) {
        const totalWages = (summary.totalWages as number) || 0;
        summary.budgetComparison = {
          budgetAmount,
          actualAmount: totalWages,
          variance: totalWages - budgetAmount,
          variancePercentage: ((totalWages - budgetAmount) / budgetAmount) * 100,
        };
      }

      return summary;
    } catch (error) {
      handleError(error, "getWagesSummary", "Failed to get wages summary");
    }
  }

  // Helper methods for analytics

  private calculateDateRange(period?: string, startDate?: string, endDate?: string) {
    const now = new Date();
    let start: Date;
    let end: Date;

    if (period) {
      switch (period) {
        case "today":
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
          break;
        case "yesterday": {
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          start = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
          end = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59);
          break;
        }
        case "this_week": {
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - now.getDay());
          start = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate());
          end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
          break;
        }
        case "last_week": {
          const lastWeekStart = new Date(now);
          lastWeekStart.setDate(now.getDate() - now.getDay() - 7);
          const lastWeekEnd = new Date(lastWeekStart);
          lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
          start = new Date(lastWeekStart.getFullYear(), lastWeekStart.getMonth(), lastWeekStart.getDate());
          end = new Date(lastWeekEnd.getFullYear(), lastWeekEnd.getMonth(), lastWeekEnd.getDate(), 23, 59, 59);
          break;
        }
        case "this_month":
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
          break;
        case "last_month":
          start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
          break;
        case "this_year":
          start = new Date(now.getFullYear(), 0, 1);
          end = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
          break;
        case "last_year":
          start = new Date(now.getFullYear() - 1, 0, 1);
          end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
          break;
        default:
          start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          end = now;
      }
    } else {
      start = startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      end = endDate ? new Date(endDate) : now;
    }

    return { start, end };
  }

  private buildMemberOrderBy(sortBy: string, sortOrder: string): Prisma.MemberOrderByWithRelationInput {
    const order = sortOrder as "asc" | "desc";

    switch (sortBy) {
      case "name":
        return { username: order };
      case "email":
        return { email: order };
      case "totalHours":
      case "earnings":
      case "attendance":
        // These will be calculated after fetching, so use default sort
        return { username: order };
      case "date":
        return { createdAt: order };
      default:
        return { username: order };
    }
  }

  // Placeholder methods for complex analytics calculations
  private async calculateWorkingHoursAnalysis(
    shifts: Array<Record<string, unknown>>,
    _includeDetails: string[],
    _includeBreakdown: boolean,
  ) {
    // Implementation for working hours analysis
    const totalHours = shifts.reduce((sum, shift) => sum + ((shift.duration as number) || 0), 0);
    const regularHours = Math.min(totalHours, 40); // Assuming 40 hours is regular
    const overtimeHours = Math.max(totalHours - 40, 0);

    return {
      totalHours,
      regularHours,
      overtimeHours,
      shiftsCount: shifts.length,
      averageHoursPerShift: shifts.length > 0 ? totalHours / shifts.length : 0,
    };
  }

  private calculateWorkingHoursSummary(_members: Array<Record<string, unknown>>) {
    return {
      totalMembers: _members.length,
      averageHours: 0,
      totalOvertime: 0,
    };
  }

  private async calculateBreakAnalysis(
    _shifts: Array<Record<string, unknown>>,
    _includeDetails: string[],
    _breakType?: string[],
    _minBreakDuration?: number,
    _maxBreakDuration?: number,
    _adherenceThreshold?: number,
    _includeViolations?: boolean,
  ) {
    return {
      totalBreaks: 0,
      totalBreakDuration: 0,
      averageBreakDuration: 0,
      adherenceRate: 100,
    };
  }

  private calculateBreakSummary(_members: Array<Record<string, unknown>>) {
    return {
      totalMembers: _members.length,
      averageBreakDuration: 0,
      averageAdherence: 100,
    };
  }

  private async calculateAttendanceAnalysis(
    shifts: Array<Record<string, unknown>>,
    _includeMetrics: string[],
    _punctualityThreshold: number,
    _includePatterns: boolean,
    _includeTrends: boolean,
  ) {
    const totalShifts = shifts.length;
    const completedShifts = shifts.filter((shift) => (shift.status as string) === "COMPLETED").length;
    const attendanceRate = totalShifts > 0 ? (completedShifts / totalShifts) * 100 : 0;

    return {
      totalShifts,
      completedShifts,
      attendanceRate,
      punctualityRate: 95, // Placeholder
      lateArrivals: 0,
      earlyDepartures: 0,
      noShows: shifts.filter((shift) => (shift.status as string) === "NO_SHOW").length,
    };
  }

  private calculateAttendanceSummary(_members: Array<Record<string, unknown>>) {
    return {
      totalMembers: _members.length,
      averageAttendanceRate: 95,
      averagePunctualityRate: 90,
    };
  }

  private async getPreviousPeriodAttendanceComparison(
    _orgId: string,
    _dateRange: { start: Date; end: Date },
    _params: AttendanceSummaryParams,
  ) {
    return {
      attendanceChange: 0,
      punctualityChange: 0,
    };
  }

  private async calculateWagesAnalysis(
    member: MemberWithShiftsAndAppointments,
    _includeComponents: string[],
    _payPeriod: string,
    _includeBreakdown: boolean,
    _includeProjections: boolean,
    _dateRange: { start: Date; end: Date },
  ) {
    const hourlyRate = member.hourlyRate || 0;
    const commissionRate = member.commissionRate || 0;

    const totalHours = member.shifts.reduce((sum: number, shift) => sum + ((shift.duration as number) || 0), 0);
    const baseWage = totalHours * hourlyRate;

    const commission = member.appointments.reduce((sum: number, appointment) => {
      return sum + (((appointment.price as number) || 0) * commissionRate) / 100;
    }, 0);

    const totalWages = baseWage + commission;

    return {
      totalWages,
      baseWage,
      commission,
      totalHours,
      overtime: Math.max(totalHours - 40, 0) * hourlyRate * 1.5, // 1.5x for overtime
    };
  }

  private calculateWagesSummary(_members: Array<Record<string, unknown>>) {
    return {
      totalMembers: _members.length,
      totalWages: 0,
      averageWage: 0,
      totalCommission: 0,
    };
  }

  private async calculateComprehensiveWagesSummary(
    members: Array<Record<string, unknown>>,
    _includeMetrics: string[],
    _groupBy: string,
    _dateRange: { start: Date; end: Date },
  ) {
    return {
      totalMembers: members.length,
      totalWages: 0,
      averageWage: 0,
      medianWage: 0,
      overtimeCosts: 0,
      commissionTotal: 0,
      costPerHour: 0,
    };
  }

  private async calculateWagesTrends(
    _orgId: string,
    _dateRange: { start: Date; end: Date },
    _memberWhere: Prisma.MemberWhereInput,
  ) {
    return [];
  }

  private async calculateWagesComparisons(
    _orgId: string,
    _dateRange: { start: Date; end: Date },
    _memberWhere: Prisma.MemberWhereInput,
  ) {
    return {};
  }

  private async calculateWagesForecasting(_trends: Array<Record<string, unknown>>) {
    return {};
  }
}
