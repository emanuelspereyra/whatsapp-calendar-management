import type { PrismaClient, UserRole } from "@prisma/client";

export type UserRecord = {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole | string;
  tokenVersion: number;
};

export type UserSummary = {
  id: string;
  username: string;
  role: UserRole | string;
  createdAt: Date;
};

export interface UserRepository {
  findById(id: string): Promise<UserRecord | null>;
  findByUsername(username: string): Promise<UserRecord | null>;
  countUsers(): Promise<number>;
  createUser(username: string, passwordHash: string, role: UserRole | string): Promise<UserRecord>;
  listUsers(): Promise<UserSummary[]>;
  updateRole(id: string, role: UserRole | string): Promise<UserSummary>;
  incrementTokenVersion(id: string): Promise<void>;
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { username } });
  }

  async countUsers(): Promise<number> {
    return this.prisma.user.count();
  }

  async createUser(username: string, passwordHash: string, role: UserRole | string): Promise<UserRecord> {
    return this.prisma.user.create({ data: { username, passwordHash, role: role as UserRole } });
  }

  async listUsers(): Promise<UserSummary[]> {
    return this.prisma.user.findMany({
      select: { id: true, username: true, role: true, createdAt: true },
      orderBy: { createdAt: "asc" }
    });
  }

  async updateRole(id: string, role: UserRole | string): Promise<UserSummary> {
    return this.prisma.user.update({
      where: { id },
      data: { role: role as UserRole, tokenVersion: { increment: 1 } },
      select: { id: true, username: true, role: true, createdAt: true }
    });
  }

  async incrementTokenVersion(id: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { tokenVersion: { increment: 1 } } });
  }
}
