import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import jwt from "jsonwebtoken";
import type { AppConfig } from "../../config/env";
import { AppError } from "../../utils/errors";
import type { UserRecord, UserRepository } from "./UserRepository";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;
const TOKEN_TTL = "12h";

export type AuthResult = { token: string; userId: string; username: string; role: string };

export type AuthTokenPayload = { sub: string; username: string; role: string };

type SignedPayload = { username: string; role: string; tokenVersion: number };

export class AuthService {
  constructor(
    private readonly config: AppConfig,
    private readonly users: UserRepository
  ) {}

  async register(username: string, password: string, code?: string): Promise<AuthResult> {
    const normalized = username.trim().toLowerCase();
    const existing = await this.users.findByUsername(normalized);
    if (existing) {
      throw new AppError("El usuario ya existe", 409, true);
    }

    const userCount = await this.users.countUsers();
    let role: "admin" | "viewer" = "admin";
    if (userCount > 0) {
      if (!this.config.registrationCode || code !== this.config.registrationCode) {
        throw new AppError("Código de registro inválido", 403, true);
      }
      role = "viewer";
    }

    const passwordHash = await this.hashPassword(password);
    const user = await this.users.createUser(normalized, passwordHash, role);
    return { token: this.signToken(user), userId: user.id, username: user.username, role: String(user.role) };
  }

  async login(username: string, password: string): Promise<AuthResult> {
    const normalized = username.trim().toLowerCase();
    const user = await this.users.findByUsername(normalized);
    if (!user || !(await this.verifyPassword(password, user.passwordHash))) {
      throw new AppError("Credenciales inválidas", 401, true);
    }
    return { token: this.signToken(user), userId: user.id, username: user.username, role: String(user.role) };
  }

  async verifyToken(token: string): Promise<AuthTokenPayload> {
    let payload: jwt.JwtPayload & Partial<SignedPayload>;
    try {
      const decoded = jwt.verify(token, this.config.jwtSecret);
      if (
        typeof decoded === "string" ||
        !decoded.sub ||
        typeof decoded.username !== "string" ||
        typeof decoded.role !== "string" ||
        typeof decoded.tokenVersion !== "number"
      ) {
        throw new AppError("Token inválido", 401, true);
      }
      payload = decoded;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("Token inválido o expirado", 401, true);
    }

    const user = await this.users.findById(String(payload.sub));
    if (!user || user.tokenVersion !== payload.tokenVersion) {
      throw new AppError("Sesión revocada, volvé a iniciar sesión", 401, true);
    }

    return { sub: user.id, username: payload.username!, role: payload.role! };
  }

  async revokeUserSessions(userId: string): Promise<void> {
    await this.users.incrementTokenVersion(userId);
  }

  private signToken(user: UserRecord): string {
    const payload: SignedPayload = { username: user.username, role: String(user.role), tokenVersion: user.tokenVersion };
    return jwt.sign(payload, this.config.jwtSecret, {
      subject: user.id,
      expiresIn: TOKEN_TTL
    });
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString("hex");
    const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
    return `${salt}:${derived.toString("hex")}`;
  }

  private async verifyPassword(password: string, stored: string): Promise<boolean> {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
    const hashBuffer = Buffer.from(hash, "hex");
    if (hashBuffer.length !== derived.length) return false;
    return timingSafeEqual(hashBuffer, derived);
  }
}
