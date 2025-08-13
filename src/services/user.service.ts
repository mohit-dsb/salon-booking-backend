import { prisma } from "@/config/prisma";
import { User, Role } from "@prisma/client";
import { UserJSON } from "@clerk/express";

export class UserService {
  // Create user from Clerk data
  public async createUser(userData: UserJSON): Promise<void> {
    const { id } = userData;

    await prisma.user.create({
      data: {
        clerkId: id,
        role: Role.MEMBER,
      },
    });
  }

  // Get user by ID
  public async getUserById(id: string): Promise<User | null> {
    return await prisma.user.findUnique({
      where: { id },
    });
  }

  // Get user by Clerk ID
  public async getUserByClerkId(clerkId: string): Promise<User | null> {
    return await prisma.user.findUnique({
      where: { clerkId },
    });
  }

  // Get all users
  public async getAllUsers(): Promise<User[]> {
    return await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  // Update user
  public async updateUser(id: string, data: UserJSON): Promise<User> {
    return await prisma.user.update({
      where: { id },
      data,
    });
  }

  // Delete user
  public async deleteUser(id: string): Promise<User> {
    return await prisma.user.delete({
      where: { clerkId: id },
    });
  }

  // Check if user exists
  public async userExists(clerkId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    return !!user;
  }
}
