import type { PrismaClient } from "@prisma/client";

export interface RateLimiter {
  /** Returns true if the call is allowed, false if the limit was exceeded. */
  consume(key: string, limit: number, windowMs: number): Promise<boolean>;
}

/**
 * Best-effort, not perfectly atomic under heavy concurrency, but sufficient
 * for an internal admin dashboard. Persisting to Postgres (instead of an
 * in-process Map) means limits survive restarts and are shared across
 * multiple instances of the API.
 */
export class PrismaRateLimiter implements RateLimiter {
  constructor(private readonly prisma: PrismaClient) {}

  async consume(key: string, limit: number, windowMs: number): Promise<boolean> {
    const now = new Date();
    const existing = await this.prisma.rateLimitCounter.findUnique({ where: { key } });

    if (!existing || existing.resetAt < now) {
      await this.prisma.rateLimitCounter.upsert({
        where: { key },
        create: { key, count: 1, resetAt: new Date(now.getTime() + windowMs) },
        update: { count: 1, resetAt: new Date(now.getTime() + windowMs) }
      });
      return true;
    }

    if (existing.count >= limit) return false;

    await this.prisma.rateLimitCounter.update({ where: { key }, data: { count: { increment: 1 } } });
    return true;
  }
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly counters = new Map<string, { count: number; resetAt: number }>();

  async consume(key: string, limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const current = this.counters.get(key);
    if (!current || current.resetAt < now) {
      this.counters.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (current.count >= limit) return false;
    current.count += 1;
    return true;
  }
}
