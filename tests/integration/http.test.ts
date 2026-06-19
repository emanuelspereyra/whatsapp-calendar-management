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
    alerts: conversationHarness.alerts,
    health,
    conversations: conversationHarness.service
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
