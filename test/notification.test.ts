import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import config from "../src/config";
import { createNotificationRouter } from "../src/features/notifications/notification.routes";
import { NotificationService, parseCampaign } from "../src/features/notifications/notification.service";
import { conflictError } from "../src/lib/api-error";
import { errorMiddleware } from "../src/middlewares/error.middleware";

const input = {
  topic: "word_of_day",
  title: "  Kata hari ini  ",
  body: "  Pelajari demokrasi  ",
  destination: "word/rumah sakit",
  schedule_mode: "immediate",
};

describe("notification validation", () => {
  it("trims content and preserves multiword destinations", () => {
    expect(parseCampaign(input)).toMatchObject({ title: "Kata hari ini", destination: "word/rumah sakit" });
  });

  it("rejects malformed schedule and destination", () => {
    expect(() => parseCampaign({ ...input, destination: "https://example.com" })).toThrow();
    expect(() =>
      parseCampaign({ ...input, schedule_mode: "weekly", start_date: "2026-10-05", local_time: "25:00", weekday: 7 }),
    ).toThrow();
    expect(() =>
      parseCampaign({
        ...input,
        schedule_mode: "daily",
        start_date: "2026-10-05",
        local_time: "12:00",
        end_date: "2026-10-04",
      }),
    ).toThrow();
  });

  it("rejects a topic payload exceeding the 2048-byte limit", () => {
    expect(() => parseCampaign({ ...input, body: "漢".repeat(500), title: "漢".repeat(100) })).toThrow(
      "Invalid campaign",
    );
  });
});

describe("notification routes", () => {
  const fake = {
    adminFromToken: vi.fn(async (token: string) => (token === "admin" ? "actor-id" : token === "member" ? "" : null)),
    list: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20 })),
    change: vi.fn(async () => {
      throw conflictError();
    }),
  };
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1",
    createNotificationRouter(() => fake as unknown as NotificationService),
  );
  app.use(errorMiddleware);

  it.each([
    ["get", ""],
    ["post", ""],
    ["get", "/health"],
    ["get", "/id"],
    ["patch", "/id"],
    ["get", "/id/deliveries"],
    ["post", "/id/send"],
    ["post", "/id/schedule"],
    ["post", "/id/pause"],
    ["post", "/id/resume"],
    ["post", "/id/cancel"],
  ] as const)("requires authentication for %s %s", async (method, suffix) => {
    const path = `/api/v1/admin/notification-campaigns${suffix}`;
    const response = await request(app)[method](path);
    expect(response.status).toBe(401);
  });

  it("distinguishes a valid non-admin token", async () => {
    const response = await request(app)
      .get("/api/v1/admin/notification-campaigns")
      .set("Authorization", "Bearer member");
    expect(response.status).toBe(403);
  });

  it("reports a version conflict", async () => {
    const response = await request(app)
      .post("/api/v1/admin/notification-campaigns/00000000-0000-4000-8000-000000000001/pause")
      .set("Authorization", "Bearer admin")
      .send({ version: 1 });
    expect(response.status).toBe(409);
  });

  it("rejects missing Cron authentication", async () => {
    const response = await request(app).post("/api/v1/internal/notifications/dispatch");
    expect(response.status).toBe(401);
  });
});

describe("notification send outcome", () => {
  const previous = config.notificationSendingEnabled;
  afterEach(() => {
    config.notificationSendingEnabled = previous;
  });

  it.each([
    ["messaging/internal-error", "unknown"],
    ["messaging/invalid-argument", "failed"],
    ["messaging/topics-message-rate-exceeded", "failed"],
    [undefined, "sent"],
  ])("records %s as %s without retrying", async (code, expectedOutcome) => {
    config.notificationSendingEnabled = true;
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const delivery = {
      id: "delivery",
      campaign_id: "campaign",
      occurrence_at: "2026-10-05T00:00:00Z",
      topic: "proverbs",
      title: "Title",
      body: "Body",
      destination: "proverb/Some_slug",
      outcome: "sending",
    };
    const client = {
      rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        return { data: name === "notification_claim_manual" ? delivery : null, error: null };
      }),
      from: vi.fn(() => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: "unknown" }, error: null }) }) }),
      })),
    };
    const sender = vi.fn(async () => {
      if (code) throw Object.assign(new Error("FCM error"), { code });
      return "fcm-message-id";
    });
    const service = new NotificationService(client as never, sender, () => new Date("2026-10-05T00:00:00Z"));
    await service.send("campaign", 1, "actor");
    expect(sender).toHaveBeenCalledOnce();
    expect(calls.find((call) => call.name === "notification_complete_delivery")?.args.p_outcome).toBe(expectedOutcome);
  });

  it("does not claim a manual send when sending is disabled", async () => {
    config.notificationSendingEnabled = false;
    const client = { rpc: vi.fn() };
    const sender = vi.fn();
    await expect(new NotificationService(client as never, sender).send("campaign", 1, "actor")).rejects.toThrow(
      "sending is disabled",
    );
    expect(client.rpc).not.toHaveBeenCalled();
    expect(sender).not.toHaveBeenCalled();
  });

  it("does not resend after a database failure following FCM acceptance", async () => {
    config.notificationSendingEnabled = true;
    const client = {
      rpc: vi.fn(async (name: string) =>
        name === "notification_claim_manual"
          ? { data: { id: "delivery", occurrence_at: "2026-10-05T00:00:00Z" }, error: null }
          : { data: null, error: { code: "08006", message: "Connection failed" } },
      ),
    };
    const sender = vi.fn(async () => "fcm-message-id");
    await expect(new NotificationService(client as never, sender).send("campaign", 1, "actor")).rejects.toThrow(
      "storage is unavailable",
    );
    expect(sender).toHaveBeenCalledOnce();
    expect(client.rpc).toHaveBeenCalledTimes(2);
  });
});
