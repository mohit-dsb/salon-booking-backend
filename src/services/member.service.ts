import { prisma } from "@/config/prisma";
import { clerkClient, type UserJSON } from "@clerk/express";
import { AppError } from "@/middlewares/error.middleware";
import type { PaginationParams } from "@/utils/pagination";
import { Member, MemberService as PrismaMemberService, Role } from "@prisma/client";

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
      // Create user in Clerk with minimal information
      const clerkUser = await clerkClient.users.createUser({
        emailAddress: [data.email],
        username: data.username,
        skipPasswordRequirement: true, // They'll set password via invitation email
        skipPasswordChecks: true,
      });

      // Create invitation for the user to join the organization
      await clerkClient.organizations.createOrganizationInvitation({
        organizationId: orgId,
        emailAddress: data.email,
        role: data.role === Role.ADMIN ? "admin" : "basic_member",
      });

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
        return this.getMemberById(member.id, orgId);
      }

      return member;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      console.error("Error creating member:", error);
      throw new AppError("Failed to create member", 500);
    }
  }

  // Get member by ID with services
  public async getMemberById(id: string, orgId: string): Promise<MemberWithServices> {
    await this.validateOrgMembership(orgId);

    if (!id || id.trim() === "") {
      throw new AppError("Member ID is required", 400);
    }

    const member = await prisma.member.findFirst({
      where: { id, orgId },
      include: this.memberInclude,
    });

    if (!member) {
      throw new AppError("Member not found", 404);
    }

    return member;
  }

  // Get member by Clerk ID
  public async getMemberByClerkId(clerkId: string, orgId: string): Promise<MemberWithServices | null> {
    await this.validateOrgMembership(orgId);

    if (!clerkId || clerkId.trim() === "") {
      throw new AppError("Clerk ID is required", 400);
    }

    return await prisma.member.findFirst({
      where: { clerkId, orgId },
      include: this.memberInclude,
    });
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
  ) {
    await this.validateOrgMembership(orgId);

    const { page, limit, skip } = pagination;

    // Build where clause
    const whereConditions = {
      orgId,
      // Exclude global users (empty orgId)
      AND: [{ orgId: { not: "" } }],
      ...(filters?.isActive !== undefined && { isActive: filters.isActive }),
      ...(filters?.search &&
        filters.search.trim() !== "" && {
          OR: [
            { username: { contains: filters.search.trim(), mode: "insensitive" as const } },
            { email: { contains: filters.search.trim(), mode: "insensitive" as const } },
            { jobTitle: { contains: filters.search.trim(), mode: "insensitive" as const } },
          ],
        }),
      ...(filters?.serviceId &&
        filters.serviceId.trim() !== "" && {
          memberServices: {
            some: {
              serviceId: filters.serviceId.trim(),
            },
          },
        }),
    };

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

      return {
        members,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error("Error fetching members:", error);
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
          primaryEmailAddressID?: string;
        } = {};
        if (data.username) updateData.username = data.username;
        if (data.email) updateData.primaryEmailAddressID = data.email;

        await clerkClient.users.updateUser(existingMember.clerkId, updateData);
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

      return this.getMemberById(id, orgId);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      console.error("Error updating member:", error);
      throw new AppError("Failed to update member", 500);
    }
  }

  // Delete member and remove from Clerk
  public async deleteMember(id: string, orgId: string): Promise<void> {
    const member = await this.getMemberById(id, orgId);

    try {
      // Remove member from Clerk organization
      // Note: In production, you might want to just disable the user instead
      await clerkClient.users.deleteUser(member.clerkId);

      // Delete member from database (this will cascade delete memberServices)
      await prisma.member.delete({
        where: { id },
      });
    } catch (_error) {
      throw new AppError("Failed to delete member", 500);
    }
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
  }

  // Get members by service
  public async getMembersByService(serviceId: string, orgId: string): Promise<MemberWithServices[]> {
    return await prisma.member.findMany({
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
  }

  // Sync member data from Clerk webhook
  public async syncMemberFromClerk(
    clerkUserId: string,
    orgId: string,
    userData: {
      username?: string;
      emailAddresses?: Array<{ emailAddress: string }>;
      imageUrl?: string;
    },
  ): Promise<void> {
    const existingMember = await prisma.member.findFirst({
      where: { clerkId: clerkUserId, orgId },
    });

    if (existingMember) {
      // Update existing member with Clerk data
      await prisma.member.update({
        where: { id: existingMember.id },
        data: {
          username: userData.username || existingMember.username,
          email: userData.emailAddresses?.[0]?.emailAddress || existingMember.email,
          profileImage: userData.imageUrl || existingMember.profileImage,
        },
      });
    }
  }

  // Check if member exists
  public async memberExists(clerkId: string, orgId: string): Promise<boolean> {
    const member = await prisma.member.findFirst({
      where: { clerkId, orgId },
      select: { id: true },
    });
    return !!member;
  }

  // Get member statistics
  public async getMemberStats(orgId: string) {
    const [totalMembers, activeMembers, inactiveMembers] = await Promise.all([
      prisma.member.count({ where: { orgId } }),
      prisma.member.count({ where: { orgId, isActive: true } }),
      prisma.member.count({ where: { orgId, isActive: false } }),
    ]);

    return {
      totalMembers,
      activeMembers,
      inactiveMembers,
    };
  }

  // Toggle member status
  public async toggleMemberStatus(id: string, orgId: string): Promise<MemberWithServices> {
    const currentMember = await this.getMemberById(id, orgId);

    return await this.updateMember(id, orgId, {
      isActive: !currentMember.isActive,
    });
  }

  // Search members with pagination
  public async searchMembers(orgId: string, query: string, pagination: PaginationParams) {
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
      console.warn(`No primary email found for user ${id}, skipping member creation`);
      return;
    }

    // Check if user has organization memberships
    if (!organization_memberships || organization_memberships.length === 0) {
      console.log(`User ${id} created without organization membership, creating a global user record`);

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
        console.log(`Created global user record for ${id} without organization`);
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
        console.log(`Updated existing global user record for ${id}`);
      }
      return;
    }

    // Create member for each organization they belong to
    for (const membership of organization_memberships) {
      const orgId = membership.id;
      const role = membership.role === "org:admin" ? Role.ADMIN : Role.MEMBER;

      // Check if member already exists in this organization
      const existingMember = await this.getMemberByClerkId(id, orgId);

      if (!existingMember) {
        console.log(`Creating member for user ${id} in organization ${orgId} with role ${role}`);
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
      } else {
        console.log(`Member already exists for user ${id} in organization ${orgId}, updating details`);
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
    }
  }

  // Delete member from Clerk webhook data
  public async deleteMemberFromWebhook(clerkId: string): Promise<void> {
    // Delete all instances of this member across organizations
    await prisma.member.deleteMany({
      where: { clerkId },
    });
  }

  // Check if member exists by Clerk ID (across all organizations)
  public async memberExistsByClerkId(clerkId: string): Promise<boolean> {
    const member = await prisma.member.findFirst({
      where: { clerkId },
      select: { id: true },
    });
    return !!member;
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
          console.log(`Found global user record for ${clerkUserId}, converting to organization member`);
          // Update the global user record to be part of this organization
          await prisma.member.update({
            where: { id: globalUser.id },
            data: {
              orgId: orgId,
              role: membershipRole === "org:admin" ? Role.ADMIN : Role.MEMBER,
              isActive: true,
            },
          });
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
          }
        }
      } else {
        // Member already exists - update with organization membership details
        console.log(`Member already exists for user ${clerkUserId} in org ${orgId}, updating with membership details`);
        await prisma.member.update({
          where: { id: existingMember.id },
          data: {
            isActive: true,
            role: membershipRole === "org:admin" ? Role.ADMIN : Role.MEMBER,
            orgId: orgId, // Ensure orgId is properly set
          },
        });
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
      }
    } else if (action === "deleted") {
      // Deactivate member in this organization
      const member = await this.getMemberByClerkId(clerkUserId, orgId);
      if (member) {
        await prisma.member.update({
          where: { id: member.id },
          data: { isActive: false },
        });
      }
    }
  }
}
