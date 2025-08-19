import { prisma } from "@/config/prisma";
import { clerkClient } from "@clerk/express";
import { AppError } from "@/middlewares/error.middleware";
import type { PaginationParams } from "@/utils/pagination";
import { Member, MemberService as PrismaMemberService } from "@prisma/client";

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
  firstName: string;
  lastName: string;
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
  firstName?: string;
  lastName?: string;
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
        firstName: data.firstName,
        lastName: data.lastName,
        skipPasswordRequirement: true, // They'll set password via invitation email
        skipPasswordChecks: true,
      });

      // Create invitation for the user to join the organization
      await clerkClient.organizations.createOrganizationInvitation({
        organizationId: orgId,
        emailAddress: data.email,
        role: "basic_member",
      });

      // Create member in our database
      const member = await prisma.member.create({
        data: {
          clerkId: clerkUser.id,
          orgId,
          firstName: data.firstName,
          lastName: data.lastName,
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
        firstName?: { contains: string; mode: "insensitive" };
        lastName?: { contains: string; mode: "insensitive" };
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
        { firstName: { contains: filters.search, mode: "insensitive" } },
        { lastName: { contains: filters.search, mode: "insensitive" } },
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
      // Update Clerk user if email, firstName, or lastName changed
      if (data.email || data.firstName || data.lastName) {
        const updateData: {
          firstName?: string;
          lastName?: string;
          primaryEmailAddressID?: string;
        } = {};
        if (data.firstName) updateData.firstName = data.firstName;
        if (data.lastName) updateData.lastName = data.lastName;
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
      orderBy: { firstName: "asc" },
    });
  }

  // Sync member data from Clerk webhook
  public async syncMemberFromClerk(
    clerkUserId: string,
    orgId: string,
    userData: {
      firstName?: string;
      lastName?: string;
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
          firstName: userData.firstName || existingMember.firstName,
          lastName: userData.lastName || existingMember.lastName,
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
}
