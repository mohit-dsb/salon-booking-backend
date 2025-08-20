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
  // Create a new member and sync with Clerk
  public async createMember(orgId: string, data: CreateMemberData): Promise<MemberWithServices> {
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
        username: data.username || "",
        skipPasswordRequirement: true, // They'll set password via invitation email
        skipPasswordChecks: true,
      });

      // Create invitation for the user to join the organization
      await clerkClient.organizations.createOrganizationInvitation({
        organizationId: orgId,
        emailAddress: data.email,
        role: "MEMBER",
      });

      // Create member in our database
      const member = await prisma.member.create({
        data: {
          clerkId: clerkUser.id,
          orgId,
          username: data.username,
          email: data.email,
          phone: data.phone,
          jobTitle: data.jobTitle,
          bio: data.bio,
          workingHours: data.workingHours,
          commissionRate: data.commissionRate,
          hourlyRate: data.hourlyRate,
          dateOfBirth: data.dateOfBirth,
          address: data.address,
          emergencyContact: data.emergencyContact,
          startDate: data.startDate || new Date(),
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
      });

      // Assign services if provided
      if (data.serviceIds && data.serviceIds.length > 0) {
        await this.assignServicesToMember(member.id, orgId, data.serviceIds);
      }

      return this.getMemberById(member.id, orgId);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("Failed to create member", 500);
    }
  }

  // Get member by ID with services
  public async getMemberById(id: string, orgId: string): Promise<MemberWithServices> {
    const member = await prisma.member.findFirst({
      where: { id, orgId },
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
    });

    if (!member) {
      throw new AppError("Member not found", 404);
    }

    return member;
  }

  // Get member by Clerk ID
  public async getMemberByClerkId(clerkId: string, orgId: string): Promise<MemberWithServices | null> {
    return await prisma.member.findFirst({
      where: { clerkId, orgId },
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
    const { page, limit, skip } = pagination;

    // Build where clause
    const where: {
      orgId: string;
      isActive?: boolean;
      OR?: Array<{
        username?: { contains: string; mode: "insensitive" };
        email?: { contains: string; mode: "insensitive" };
        jobTitle?: { contains: string; mode: "insensitive" };
      }>;
      memberServices?: {
        some: {
          serviceId: string;
        };
      };
    } = { orgId };

    if (filters?.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters?.search) {
      where.OR = [
        { username: { contains: filters.search, mode: "insensitive" } },
        { email: { contains: filters.search, mode: "insensitive" } },
        { jobTitle: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    if (filters?.serviceId) {
      where.memberServices = {
        some: {
          serviceId: filters.serviceId,
        },
      };
    }

    const [members, total] = await Promise.all([
      prisma.member.findMany({
        where,
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
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.member.count({ where }),
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
  }

  // Update member
  public async updateMember(id: string, orgId: string, data: UpdateMemberData): Promise<MemberWithServices> {
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

      // Update member in database
      await prisma.member.update({
        where: { id },
        data: {
          ...memberData,
          dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
          endDate: data.endDate ? new Date(data.endDate) : undefined,
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

  // ========== USER-RELATED METHODS (replacing UserService) ==========

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

    const orgId = organization_memberships?.[0]?.id || "";
    const role = organization_memberships?.[0]?.role || Role.MEMBER;
    await prisma.member.create({
      data: {
        clerkId: id,
        orgId: orgId,
        role: role as Role,
        username: username || "",
        email: primaryEmail,
        profileImage: image_url,
        isActive: Boolean(orgId),
      },
    });
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

  // Get member by Clerk ID (first match across organizations)
  public async getMemberByClerkIdAny(clerkId: string): Promise<Member | null> {
    return await prisma.member.findFirst({
      where: { clerkId },
    });
  }

  // Handle organization membership events
  public async handleOrganizationMembership(
    clerkUserId: string,
    orgId: string,
    action: "created" | "updated" | "deleted",
  ): Promise<void> {
    if (action === "created") {
      // Check if this user already exists as a member
      const existingMember = await this.getMemberByClerkId(clerkUserId, orgId);

      if (!existingMember) {
        // Check if they exist in another organization
        const memberInOtherOrg = await this.getMemberByClerkIdAny(clerkUserId);

        if (memberInOtherOrg) {
          // Create a new member record for this organization based on existing data
          await prisma.member.create({
            data: {
              clerkId: clerkUserId,
              orgId,
              role: memberInOtherOrg.role || Role.MEMBER,
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
              role: Role.MEMBER,
              username: `${clerkUserId}@temp.local`, // Temporary username
              email: `${clerkUserId}@temp.local`, // Temporary email
              isActive: true,
            },
          });
        }
      } else {
        // Reactivate existing member
        await prisma.member.update({
          where: { id: existingMember.id },
          data: { isActive: true },
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
