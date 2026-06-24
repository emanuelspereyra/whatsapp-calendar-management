import { describe, expect, it, vi } from "vitest";
import { InMemoryRateLimiter, PrismaRateLimiter } from "../../src/modules/ratelimit/RateLimiter";

describe("InMemoryRateLimiter", () => {
  it("allows requests under the limit and blocks once exceeded", async () => {
    const limiter = new InMemoryRateLimiter();
    expect(await limiter.consume("k", 2, 60_000)).toBe(true);
    expect(await limiter.consume("k", 2, 60_000)).toBe(true);
    expect(await limiter.consume("k", 2, 60_000)).toBe(false);
  });

  it("resets the count once the window has passed", async () => {
    const limiter = new InMemoryRateLimiter();
    expect(await limiter.consume("k", 1, -1)).toBe(true);
    expect(await limiter.consume("k", 1, 60_000)).toBe(true);
  });

  it("tracks separate keys independently", async () => {
    const limiter = new InMemoryRateLimiter();
    expect(await limiter.consume("a", 1, 60_000)).toBe(true);
    expect(await limiter.consume("b", 1, 60_000)).toBe(true);
    expect(await limiter.consume("a", 1, 60_000)).toBe(false);
  });
});

function fakePrismaForRateLimit() {
  const rows = new Map<string, { key: string; count: number; resetAt: Date }>();
  return {
    rateLimitCounter: {
      findUnique: vi.fn(async ({ where: { key } }: any) => rows.get(key) ?? null),
      upsert: vi.fn(async ({ where: { key }, create }: any) => {
        const row = { key, count: create.count, resetAt: create.resetAt };
        rows.set(key, row);
        return row;
      }),
      update: vi.fn(async ({ where: { key }, data }: any) => {
        const row = rows.get(key)!;
        row.count += data.count.increment;
        return row;
      })
    }
  } as any;
}

describe("PrismaRateLimiter", () => {
  it("persists counters across calls and enforces the limit", async () => {
    const prisma = fakePrismaForRateLimit();
    const limiter = new PrismaRateLimiter(prisma);

    expect(await limiter.consume("admin:1.1.1.1", 2, 60_000)).toBe(true);
    expect(await limiter.consume("admin:1.1.1.1", 2, 60_000)).toBe(true);
    expect(await limiter.consume("admin:1.1.1.1", 2, 60_000)).toBe(false);
  });

  it("resets the counter once the window expires", async () => {
    const prisma = fakePrismaForRateLimit();
    const limiter = new PrismaRateLimiter(prisma);

    expect(await limiter.consume("k", 1, -1)).toBe(true);
    expect(await limiter.consume("k", 1, 60_000)).toBe(true);
  });
});
