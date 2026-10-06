import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import config from "../../config";
import { conflictError, notFoundError, serviceUnavailableError, validationError } from "../../lib/api-error";

const uuid = z.uuid();
const topic = z.enum(["word_of_day", "trending_words", "proverbs"]);
const environment = z.enum(["development", "production"]).default(config.notificationEnvironment);
const date = z.iso.date();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
const content = z.strictObject({
  topic,
  environment,
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(500),
  destination: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .regex(/^(word\/[^/]+|proverb\/[^/]+)$/)
    .refine((value) => value.split("/")[1].trim().length > 0, "Destination term is required"),
});
export const campaignInput = z
  .discriminatedUnion("schedule_mode", [
    content.extend({ schedule_mode: z.literal("immediate") }),
    content.extend({ schedule_mode: z.literal("once"), start_date: date, local_time: time }),
    content.extend({
      schedule_mode: z.literal("daily"),
      start_date: date,
      local_time: time,
      end_date: date.optional(),
    }),
    content.extend({
      schedule_mode: z.literal("weekly"),
      start_date: date,
      local_time: time,
      weekday: z.number().int().min(0).max(6),
      end_date: date.optional(),
    }),
  ])
  .superRefine((input, context) => {
    if ("end_date" in input && input.end_date && input.end_date < input.start_date) {
      context.addIssue({ code: "custom", path: ["end_date"], message: "End date precedes start date" });
    }
    const payload = {
      schema_version: "1",
      campaign_id: "0".repeat(36),
      delivery_id: "0".repeat(36),
      topic: input.topic,
      title: input.title,
      body: input.body,
      destination: input.destination,
      expires_at: new Date().toISOString(),
    };
    const message = {
      topic: `${input.environment}_${input.topic}`,
      environment: input.environment,
      data: payload,
      android: { priority: "normal", ttl: 86_400_000 },
    };
    if (Buffer.byteLength(JSON.stringify(message), "utf8") > 2048) {
      context.addIssue({ code: "custom", path: ["body"], message: "FCM payload is too large" });
    }
  });

export type CampaignInput = z.infer<typeof campaignInput>;
export type Delivery = {
  id: string;
  campaign_id: string;
  occurrence_at: string;
  topic: string;
  environment: "development" | "production";
  title: string;
  body: string;
  destination: string;
  outcome: string;
};
export type Sender = (delivery: Delivery, expiresAt: string) => Promise<string>;

function requireClient(): SupabaseClient {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey)
    throw serviceUnavailableError("Notification storage is not configured");
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000),
        }),
    },
  });
}

function checkDatabase(error: { code?: string; message: string } | null): void {
  if (!error) return;
  if (error.code === "P0002") throw notFoundError("Campaign not found");
  if (error.code === "P0001" || error.code === "23505") throw conflictError();
  throw serviceUnavailableError("Notification storage is unavailable", error);
}

function requireEnabled(): void {
  if (!config.notificationSendingEnabled) throw serviceUnavailableError("Notification sending is disabled");
}

const definiteFcmCodes = new Set([
  "messaging/invalid-argument",
  "messaging/invalid-payload",
  "messaging/invalid-data-payload-key",
  "messaging/payload-size-limit-exceeded",
  "messaging/invalid-recipient",
  "messaging/invalid-options",
  "messaging/message-rate-exceeded",
  "messaging/topics-message-rate-exceeded",
  "messaging/mismatched-credential",
  "messaging/authentication-error",
]);

export class NotificationService {
  constructor(
    private readonly client: SupabaseClient = requireClient(),
    private readonly sender: Sender,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async adminFromToken(token: string): Promise<string | null> {
    const { data: user, error: userError } = await this.client.auth.getUser(token);
    if (userError || !user.user) return null;
    const { data, error } = await this.client
      .from("admin_users")
      .select("user_id")
      .eq("user_id", user.user.id)
      .maybeSingle();
    checkDatabase(error);
    return data ? user.user.id : "";
  }

  async list(status: string | undefined, page: number, limit: number) {
    let query = this.client.from("notification_campaigns").select("*", { count: "exact" });
    if (status) query = query.eq("status", status);
    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    checkDatabase(error);
    return { items: data, total: count ?? 0, page, limit };
  }

  async listDestinations() {
    const { data, error } = await this.client
      .from("notification_saved_destinations")
      .select("value,created_at,updated_at")
      .order("value", { ascending: true });
    checkDatabase(error);
    return data ?? [];
  }

  async saveDestination(actor: string, value: string) {
    const { error } = await this.client
      .from("notification_saved_destinations")
      .upsert({ value, created_by: actor, updated_at: new Date().toISOString() }, { onConflict: "value" });
    checkDatabase(error);
    return this.listDestinations();
  }

  async deleteDestination(value: string) {
    const { error } = await this.client.from("notification_saved_destinations").delete().eq("value", value);
    checkDatabase(error);
    return this.listDestinations();
  }

  async get(id: string) {
    const { data, error } = await this.client.from("notification_campaigns").select("*").eq("id", id).maybeSingle();
    checkDatabase(error);
    if (!data) throw notFoundError("Campaign not found");
    return data;
  }

  async deliveries(id: string, page: number, limit: number) {
    await this.get(id);
    const { data, count, error } = await this.client
      .from("notification_deliveries")
      .select("*", { count: "exact" })
      .eq("campaign_id", id)
      .order("occurrence_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    checkDatabase(error);
    return { items: data, total: count ?? 0, page, limit };
  }

  async create(actor: string, input: CampaignInput) {
    const { data, error } = await this.client.rpc("notification_create_campaign", { p_actor: actor, p_values: input });
    checkDatabase(error);
    return data;
  }

  async archive(id: string, version: number, actor: string) {
    const { data, error } = await this.client.rpc("notification_archive_campaign", {
      p_id: id,
      p_version: version,
      p_actor: actor,
    });
    checkDatabase(error);
    return data;
  }

  async deleteArchived(id: string, version: number, actor: string) {
    const { data, error } = await this.client.rpc("notification_delete_archived_campaign", {
      p_id: id,
      p_version: version,
      p_actor: actor,
    });
    checkDatabase(error);
    return data;
  }

  async change(action: string, id: string, version: number, actor: string, input?: CampaignInput) {
    const { data, error } = await this.client.rpc("notification_change_campaign", {
      p_action: action,
      p_id: id,
      p_version: version,
      p_actor: actor,
      p_values: input ?? {},
    });
    checkDatabase(error);
    return data;
  }

  async send(id: string, version: number, actor: string) {
    requireEnabled();
    const { data, error } = await this.client.rpc("notification_claim_manual", {
      p_id: id,
      p_version: version,
      p_actor: actor,
    });
    checkDatabase(error);
    await this.process(data as Delivery);
    return this.get(id);
  }

  async dispatch() {
    requireEnabled();
    const started = this.now().getTime();
    const recovered = await this.client.rpc("notification_recover_stale");
    checkDatabase(recovered.error);
    const processed: Array<{ id: string; outcome: string }> = [];
    for (let i = 0; i < 5 && this.now().getTime() - started < 20_000; i++) {
      const { data, error } = await this.client.rpc("notification_claim_due");
      checkDatabase(error);
      if (!data) break;
      const delivery = data as Delivery;
      const outcome =
        delivery.outcome === "sending"
          ? await this.process(delivery, Math.min(10_000, Math.max(1, 20_000 - (this.now().getTime() - started))))
          : delivery.outcome;
      processed.push({ id: delivery.id, outcome });
    }
    const { error: heartbeatError } = await this.client
      .from("notification_dispatcher_state")
      .update({ last_heartbeat_at: this.now().toISOString(), last_error_code: null })
      .eq("singleton", true);
    checkDatabase(heartbeatError);
    return { recovered: recovered.data, processed };
  }

  async health() {
    const { data, error } = await this.client.rpc("notification_dispatcher_health", {
      p_now: this.now().toISOString(),
    });
    checkDatabase(error);
    const lastHeartbeat = data.last_heartbeat_at as string | null;
    return {
      ...data,
      warning:
        !lastHeartbeat || this.now().getTime() - new Date(lastHeartbeat).getTime() > 300_000 || data.overdue_count > 0,
    };
  }

  private async process(delivery: Delivery, timeoutMs = 10_000): Promise<"sent" | "failed" | "unknown"> {
    let outcome: "sent" | "failed" | "unknown";
    let messageId: string | null = null;
    let errorCode: string | null = null;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const expiresAt = new Date(
        Math.min(this.now().getTime(), new Date(delivery.occurrence_at).getTime()) + 86_400_000,
      ).toISOString();
      messageId = await Promise.race([
        this.sender(delivery, expiresAt),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(Object.assign(new Error("FCM send timed out"), { code: "send_uncertain" })),
            timeoutMs,
          );
          timeout.unref();
        }),
      ]);
      outcome = "sent";
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "send_uncertain";
      errorCode = /^[a-z0-9/_-]{1,80}$/.test(code) ? code : "send_uncertain";
      outcome = definiteFcmCodes.has(errorCode) ? "failed" : "unknown";
    } finally {
      clearTimeout(timeout);
    }
    const result = await this.client.rpc("notification_complete_delivery", {
      p_id: delivery.id,
      p_outcome: outcome,
      p_message_id: messageId,
      p_error_code: errorCode,
    });
    checkDatabase(result.error);
    return outcome;
  }
}

export function parseCampaign(value: unknown): CampaignInput {
  const parsed = campaignInput.safeParse(value);
  if (!parsed.success)
    throw validationError(
      "Invalid campaign",
      parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        location: "body",
        reason: issue.message,
      })),
    );
  return parsed.data;
}

export function parseUuid(value: unknown): string {
  const parsed = uuid.safeParse(value);
  if (!parsed.success) throw validationError("Invalid campaign ID");
  return parsed.data;
}
