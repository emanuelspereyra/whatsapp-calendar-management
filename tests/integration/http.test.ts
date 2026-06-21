import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp, type AppDependencies } from "../../src/app";
import { AlertService } from "../../src/modules/alerts/AlertService";
import { HealthService } from "../../src/modules/health/HealthService";
import { runPreflight } from "../../src/modules/health/preflight";
import {
  buildConversationHarness,
  CapturingAlertProvider,
  FakeAiService,
  FakeCalendarService,
  FakeWhatsAppProvider,
  InMemoryConversationRepository,
  testConfig,
  textRecord
} from "../testUtils";

function fakePrisma(databaseOk = true) {
  return {
    $queryRaw: vi.fn(async () => {
      if (!databaseOk) throw new Error("db down");
      return 1;
    }),
    healthCheckLog: {
      create: vi.fn(async () => ({}))
    }
  } as any;
}

function buildAppHarness() {
  const config = testConfig();
  const conversationHarness = buildConversationHarness(config);
  const prisma = fakePrisma();
  const health = new HealthService(
    prisma,
    conversationHarness.ai,
    conversationHarness.calendar,
    conversationHarness.whatsapp,
    conversationHarness.alerts
  );
  const deps: AppDependencies = {
    prisma,
    whatsapp: conversationHarness.whatsapp,
    ai: conversationHarness.ai,
    calendar: conversationHarness.calendar,
    conversationsRepository: conversationHarness.repo,
    usersRepository: conversationHarness.usersRepo,
    alerts: conversationHarness.alerts,
    health,
    conversations: conversationHarness.service,
    auth: conversationHarness.auth,
    rateLimiter: conversationHarness.rateLimiter
  };
  const app = createApp(config, deps);
  return { ...conversationHarness, app, config, deps };
}

describe("HTTP routes", () => {
  it("/health responds ok without external dependency checks", async () => {
    const { app, ai, calendar, whatsapp } = buildAppHarness();

    const response = await request(app).get("/health").expect(200);

    expect(response.body.status).toBe("ok");
    expect(ai.healthCheck).not.toHaveBeenCalled();
    expect(calendar.healthCheck).not.toHaveBeenCalled();
    expect(whatsapp.healthCheck).not.toHaveBeenCalled();
  });

  it("/ready returns degraded if one dependency fails", async () => {
    const { app, ai } = buildAppHarness();
    ai.health = { status: "down", message: "openai down" };

    const response = await request(app).get("/ready").expect(200);

    expect(response.body.status).toBe("degraded");
    expect(response.body.services.openai).toBe("down");
  });

  it("/ready returns down if the database is unavailable", async () => {
    const config = testConfig();
    const conversationHarness = buildConversationHarness(config);
    const prisma = fakePrisma(false);
    const health = new HealthService(
      prisma,
      conversationHarness.ai,
      conversationHarness.calendar,
      conversationHarness.whatsapp,
      conversationHarness.alerts
    );
    const app = createApp(config, {
      prisma,
      whatsapp: conversationHarness.whatsapp,
      ai: conversationHarness.ai,
      calendar: conversationHarness.calendar,
      conversationsRepository: conversationHarness.repo,
      usersRepository: conversationHarness.usersRepo,
      alerts: conversationHarness.alerts,
      health,
      conversations: conversationHarness.service,
      auth: conversationHarness.auth,
      rateLimiter: conversationHarness.rateLimiter
    });

    const response = await request(app).get("/ready").expect(503);

    expect(response.body.status).toBe("down");
    expect(response.body.services.database).toBe("down");
  });

  it("/ready does not persist health logs for probe traffic", async () => {
    const { app, deps } = buildAppHarness();

    await request(app).get("/ready");

    expect(deps.prisma.healthCheckLog.create).not.toHaveBeenCalled();
  });

  it("rejects admin endpoints without ADMIN_API_KEY", async () => {
    const { app } = buildAppHarness();

    await request(app).post("/admin/healthcheck/run").expect(401);
  });

  it("runs manual healthcheck with ADMIN_API_KEY", async () => {
    const { app, config } = buildAppHarness();

    const response = await request(app)
      .post("/admin/healthcheck/run")
      .set("x-admin-api-key", config.adminApiKey)
      .expect(200);

    expect(response.body.status).toBe("ok");
  });

  it("webhook POST processes known text payloads", async () => {
    const { app, whatsapp, repo } = buildAppHarness();
    (whatsapp.parseWebhookPayload as any) = vi.fn(() => [textRecord()]);

    await request(app).post("/webhooks/whatsapp").send({ ok: true }).expect(200);

    expect(repo.messages[0]).toMatchObject({ rawText: textRecord().text });
  });

  it("lists conversations for admin with status filter", async () => {
    const { app, whatsapp, config } = buildAppHarness();
    (whatsapp.parseWebhookPayload as any) = vi.fn(() => [textRecord()]);
    await request(app).post("/webhooks/whatsapp").send({ ok: true }).expect(200);

    const response = await request(app)
      .get("/admin/conversations?status=scheduled")
      .set("x-admin-api-key", config.adminApiKey)
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].status).toBe("scheduled");
    expect(response.body.pagination).toMatchObject({ skip: 0, take: 20, total: 1 });
  });

  it("lists recent calendar events with client info", async () => {
    const { app, whatsapp, config } = buildAppHarness();
    (whatsapp.parseWebhookPayload as any) = vi.fn(() => [textRecord()]);
    await request(app).post("/webhooks/whatsapp").send({ ok: true }).expect(200);

    const response = await request(app)
      .get("/admin/calendar-events?limit=10")
      .set("x-admin-api-key", config.adminApiKey)
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({ status: "created" });
    expect(response.body.data[0].client.name).toBe("Cliente");
  });

  it("rejects /admin/calendar-events without ADMIN_API_KEY", async () => {
    const { app } = buildAppHarness();

    await request(app).get("/admin/calendar-events").expect(401);
  });

  it("webhook POST ignores status and unknown events without breaking", async () => {
    const { app, whatsapp, repo } = buildAppHarness();
    (whatsapp.parseWebhookPayload as any) = vi.fn(() => [
      { kind: "status", status: "sent", providerMessageId: "m1", timestamp: new Date() },
      { kind: "unknown", reason: "unsupported" }
    ]);

    await request(app).post("/webhooks/whatsapp").send({ ok: true }).expect(200);

    expect(repo.messages).toHaveLength(0);
  });
});

describe("auth", () => {
  it("registers the first user without a code and returns a token", async () => {
    const { app } = buildAppHarness();

    const response = await request(app)
      .post("/auth/register")
      .send({ username: "owner", password: "supersecret" })
      .expect(201);

    expect(response.body.token).toBeTruthy();
    expect(response.body.username).toBe("owner");
    expect(response.body.role).toBe("admin");
  });

  it("requires the registration code for subsequent users and grants them the viewer role", async () => {
    const { app } = buildAppHarness();
    await request(app).post("/auth/register").send({ username: "owner", password: "supersecret" }).expect(201);

    await request(app).post("/auth/register").send({ username: "second", password: "supersecret" }).expect(403);
    const second = await request(app)
      .post("/auth/register")
      .send({ username: "second", password: "supersecret", code: "invite-code" })
      .expect(201);

    expect(second.body.role).toBe("viewer");
  });

  it("blocks viewers from approving or rejecting conversations", async () => {
    const { app } = buildAppHarness();
    await request(app).post("/auth/register").send({ username: "owner", password: "supersecret" }).expect(201);
    const viewer = await request(app)
      .post("/auth/register")
      .send({ username: "second", password: "supersecret", code: "invite-code" })
      .expect(201);

    await request(app)
      .post("/admin/conversations/any-id/approve")
      .set("authorization", `Bearer ${viewer.body.token}`)
      .expect(403);

    await request(app)
      .get("/admin/conversations")
      .set("authorization", `Bearer ${viewer.body.token}`)
      .expect(200);
  });

  it("logs in and reaches admin endpoints with the bearer token", async () => {
    const { app } = buildAppHarness();
    await request(app).post("/auth/register").send({ username: "owner", password: "supersecret" }).expect(201);

    const login = await request(app)
      .post("/auth/login")
      .send({ username: "owner", password: "supersecret" })
      .expect(200);

    await request(app)
      .post("/admin/healthcheck/run")
      .set("authorization", `Bearer ${login.body.token}`)
      .expect(200);
  });

  it("rejects login with the wrong password", async () => {
    const { app } = buildAppHarness();
    await request(app).post("/auth/register").send({ username: "owner", password: "supersecret" }).expect(201);

    await request(app).post("/auth/login").send({ username: "owner", password: "nope-nope" }).expect(401);
  });

  it("revoking a user's sessions invalidates their existing token", async () => {
    const { app } = buildAppHarness();
    const owner = await request(app)
      .post("/auth/register")
      .send({ username: "owner", password: "supersecret" })
      .expect(201);

    await request(app)
      .post("/admin/healthcheck/run")
      .set("authorization", `Bearer ${owner.body.token}`)
      .expect(200);

    await request(app)
      .post(`/admin/users/${owner.body.userId}/revoke`)
      .set("authorization", `Bearer ${owner.body.token}`)
      .expect(200);

    await request(app)
      .post("/admin/healthcheck/run")
      .set("authorization", `Bearer ${owner.body.token}`)
      .expect(401);
  });
});

describe("user management", () => {
  it("records which user approved or rejected a conversation", async () => {
    const { app, whatsapp } = buildAppHarness();
    (whatsapp.parseWebhookPayload as any) = vi.fn(() => [textRecord()]);
    await request(app).post("/webhooks/whatsapp").send({ ok: true }).expect(200);

    const owner = await request(app)
      .post("/auth/register")
      .send({ username: "owner", password: "supersecret" })
      .expect(201);

    const list = await request(app)
      .get("/admin/conversations")
      .set("authorization", `Bearer ${owner.body.token}`)
      .expect(200);
    const conversationId = list.body.data[0].id;

    await request(app)
      .post(`/admin/conversations/${conversationId}/reject`)
      .set("authorization", `Bearer ${owner.body.token}`)
      .expect(200);

    const after = await request(app)
      .get("/admin/conversations")
      .set("authorization", `Bearer ${owner.body.token}`)
      .expect(200);

    expect(after.body.data[0].rejectedByUserId).toBe(owner.body.userId);
  });

  it("lists users and updates roles, but blocks demoting the last admin", async () => {
    const { app } = buildAppHarness();
    const owner = await request(app)
      .post("/auth/register")
      .send({ username: "owner", password: "supersecret" })
      .expect(201);
    const viewer = await request(app)
      .post("/auth/register")
      .send({ username: "second", password: "supersecret", code: "invite-code" })
      .expect(201);

    const list = await request(app)
      .get("/admin/users")
      .set("authorization", `Bearer ${owner.body.token}`)
      .expect(200);
    expect(list.body.data).toHaveLength(2);

    await request(app)
      .patch(`/admin/users/${viewer.body.userId}/role`)
      .set("authorization", `Bearer ${owner.body.token}`)
      .send({ role: "admin" })
      .expect(200);

    await request(app)
      .patch(`/admin/users/${owner.body.userId}/role`)
      .set("authorization", `Bearer ${owner.body.token}`)
      .send({ role: "viewer" })
      .expect(200);

    await request(app)
      .patch(`/admin/users/${viewer.body.userId}/role`)
      .set("authorization", `Bearer ${owner.body.token}`)
      .send({ role: "viewer" })
      .expect(409);
  });

  it("blocks viewers from listing or changing users", async () => {
    const { app } = buildAppHarness();
    await request(app).post("/auth/register").send({ username: "owner", password: "supersecret" }).expect(201);
    const viewer = await request(app)
      .post("/auth/register")
      .send({ username: "second", password: "supersecret", code: "invite-code" })
      .expect(201);

    await request(app)
      .get("/admin/users")
      .set("authorization", `Bearer ${viewer.body.token}`)
      .expect(403);
  });
});

describe("preflight", () => {
  it("blocks startup when STRICT_PREFLIGHT=true and a dependency is down", async () => {
    const config = testConfig({ strictPreflight: true });
    const prisma = fakePrisma();
    const ai = new FakeAiService();
    ai.health = { status: "down", message: "openai down" };
    const calendar = new FakeCalendarService();
    const whatsapp = new FakeWhatsAppProvider();
    const alerts = new AlertService(config, new CapturingAlertProvider(), new CapturingAlertProvider());
    const health = new HealthService(prisma, ai, calendar, whatsapp, alerts);

    await expect(runPreflight(config, health, alerts)).rejects.toThrow("Preflight readiness failed");
  });

  it("allows degraded startup when STRICT_PREFLIGHT=false", async () => {
    const config = testConfig({ strictPreflight: false });
    const prisma = fakePrisma();
    const ai = new FakeAiService();
    ai.health = { status: "down", message: "openai down" };
    const calendar = new FakeCalendarService();
    const whatsapp = new FakeWhatsAppProvider();
    const alerts = new AlertService(config, new CapturingAlertProvider(), new CapturingAlertProvider());
    const health = new HealthService(prisma, ai, calendar, whatsapp, alerts);

    await expect(runPreflight(config, health, alerts)).resolves.toMatchObject({ mode: "degraded" });
  });

  it("blocks startup when required environment variables are missing", async () => {
    const config = testConfig({ openaiApiKey: "" });
    const prisma = fakePrisma();
    const health = new HealthService(
      prisma,
      new FakeAiService(),
      new FakeCalendarService(),
      new FakeWhatsAppProvider(),
      new AlertService(config, new CapturingAlertProvider(), new CapturingAlertProvider())
    );
    const alerts = new AlertService(config, new CapturingAlertProvider(), new CapturingAlertProvider());

    await expect(runPreflight(config, health, alerts)).rejects.toThrow("OPENAI_API_KEY");
  });
});
