import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const actor = "00000000-0000-4000-8000-000000000001";
const historic = "00000000-0000-4000-8000-000000000002";
let db: PGlite;

async function create(mode = "immediate") {
  const values = {
    topic: "word_of_day",
    title: "Kata hari ini",
    body: "Pelajari rumah sakit",
    destination: "word/rumah sakit",
    schedule_mode: mode,
    ...(mode !== "immediate" ? { start_date: "2026-10-05", local_time: "12:00" } : {}),
  };
  const { rows } = await db.query<{ id: string }>(
    "select * from public.notification_create_campaign($1::uuid, $2::jsonb)",
    [actor, JSON.stringify(values)],
  );
  return rows[0].id;
}

describe("notification PostgreSQL migration", () => {
  beforeAll(async () => {
    db = new PGlite();
    const base = readFileSync("supabase/migrations/20260927000000_admin_backoffice.sql", "utf8");
    const table = (name: string) => {
      const start = base.indexOf(`create table if not exists public.${name} (`);
      return base.slice(start, base.indexOf("\n);", start) + 3);
    };
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      ${table("admin_audit")}
      ${table("notification_campaigns")}
      insert into auth.users values ('${actor}');
      insert into public.notification_campaigns(id,topic,title,body,destination,status,created_by)
      values ('${historic}','word_of_day','Title','Body','word/term','sending','${actor}');
    `);
    await db.exec(readFileSync("supabase/migrations/20261005000000_notification_scheduling.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/20261008000000_notification_campaign_archive.sql", "utf8"));
  }, 30_000);

  beforeEach(async () => {
    await db.query("delete from public.notification_deliveries where campaign_id <> $1::uuid", [historic]);
    await db.query("delete from public.notification_campaigns where id <> $1::uuid", [historic]);
  });
  afterAll(async () => {
    await db?.close();
  });

  it("archives campaigns with version checks and permanently deletes only archived records", async () => {
    const id = await create();
    const archived = await db.query<{ status: string; version: number; archived_at: Date }>(
      "select * from notification_archive_campaign($1::uuid,1,$2::uuid)",
      [id, actor],
    );
    expect(archived.rows[0].status).toBe("archived");
    expect(archived.rows[0].version).toBe(2);
    expect(archived.rows[0].archived_at).toBeTruthy();
    await db.query(
      `insert into notification_deliveries(campaign_id,occurrence_key,occurrence_at,topic,title,body,destination,outcome)
       values ($1::uuid,'prior-attempt',now(),'word_of_day','Title','Body','word/term','sent')`,
      [id],
    );
    await expect(db.query("select notification_archive_campaign($1::uuid,1,$2::uuid)", [id, actor])).rejects.toThrow(
      "version_conflict",
    );
    await expect(
      db.query("select notification_delete_archived_campaign($1::uuid,1,$2::uuid)", [id, actor]),
    ).rejects.toThrow("version_conflict");
    const deleted = await db.query<{ result: { deleted: boolean } }>(
      "select notification_delete_archived_campaign($1::uuid,2,$2::uuid) as result",
      [id, actor],
    );
    expect(deleted.rows[0].result.deleted).toBe(true);
    await expect(db.query("select * from notification_campaigns where id=$1::uuid", [id])).resolves.toMatchObject({
      rows: [],
    });
    await expect(
      db.query("select * from notification_deliveries where campaign_id=$1::uuid", [id]),
    ).resolves.toMatchObject({ rows: [] });
  });

  it("rejects archiving active schedules and deleting campaigns before archiving", async () => {
    const id = await create("daily");
    await db.query("select * from notification_change_campaign('schedule',$1::uuid,1,$2::uuid)", [id, actor]);
    await expect(db.query("select notification_archive_campaign($1::uuid,2,$2::uuid)", [id, actor])).rejects.toThrow(
      "invalid_transition",
    );
    await expect(
      db.query("select notification_delete_archived_campaign($1::uuid,2,$2::uuid)", [id, actor]),
    ).rejects.toThrow("invalid_transition");
  });

  it("backfills historical attempts and recovers historical sending state", async () => {
    const { rows } = await db.query<{ status: string; outcome: string }>(
      "select c.status, d.outcome from notification_campaigns c join notification_deliveries d on d.campaign_id=c.id where c.id=$1::uuid",
      [historic],
    );
    expect(rows).toEqual([{ status: "unknown", outcome: "unknown" }]);
  });

  it("calculates daily and weekly Jakarta times, including inclusive end dates", async () => {
    const { rows } = await db.query<{ daily: Date; weekly: Date; ended: null }>(`
      select notification_next_occurrence('daily','2026-10-05','12:00',null,'2026-10-05','2026-10-05T04:59:59Z') as daily,
      notification_next_occurrence('weekly','2026-10-05','12:00',1,null,'2026-10-05T05:00:00Z') as weekly,
      notification_next_occurrence('daily','2026-10-05','12:00',null,'2026-10-05','2026-10-05T05:00:00Z') as ended
    `);
    expect(new Date(rows[0].daily).toISOString()).toBe("2026-10-05T05:00:00.000Z");
    expect(new Date(rows[0].weekly).toISOString()).toBe("2026-10-12T05:00:00.000Z");
    expect(rows[0].ended).toBeNull();
  });

  it("does not move a past one-time date to today", async () => {
    const { rows } = await db.query<{ occurrence: null }>(
      "select notification_next_occurrence('once','2026-10-04','12:00',null,null,'2026-10-05T04:00:00Z') as occurrence",
    );
    expect(rows[0].occurrence).toBeNull();
  });

  it("claims a manual occurrence once and rejects stale versions", async () => {
    const id = await create();
    const { rows } = await db.query<{ id: string }>("select * from notification_claim_manual($1::uuid,1,$2::uuid)", [
      id,
      actor,
    ]);
    await expect(db.query("select * from notification_claim_manual($1::uuid,1,$2::uuid)", [id, actor])).rejects.toThrow(
      "invalid_transition",
    );
    await db.query("select notification_complete_delivery($1::uuid,'sent','fcm-id',null)", [rows[0].id]);
    const completed = await db.query<{ status: string }>(
      "select status from notification_campaigns where id=$1::uuid",
      [id],
    );
    expect(completed.rows[0].status).toBe("sent");
    await expect(
      db.query("select * from notification_change_campaign('cancel',$1::uuid,1,$2::uuid)", [id, actor]),
    ).rejects.toThrow("version_conflict");
  });

  it("skips overdue occurrences and claims only the latest recurring one", async () => {
    const id = await create("daily");
    await db.query(
      `update notification_campaigns set status='scheduled',
      start_date=(now() at time zone 'Asia/Jakarta')::date - 4,
      local_time=((now() - interval '1 hour') at time zone 'Asia/Jakarta')::time,
      next_occurrence_at=now() - interval '73 hours' where id=$1::uuid`,
      [id],
    );
    const claim = await db.query<{ id: string; outcome: string }>("select * from notification_claim_due()");
    expect(claim.rows[0].outcome).toBe("sending");
    const counts = await db.query<{ outcome: string; count: number }>(
      "select outcome,count(*)::int as count from notification_deliveries where campaign_id=$1::uuid group by outcome",
      [id],
    );
    expect(counts.rows).toEqual(
      expect.arrayContaining([
        { outcome: "skipped", count: 3 },
        { outcome: "sending", count: 1 },
      ]),
    );
    const next = await db.query<{ future: boolean }>(
      "select next_occurrence_at > now() as future from notification_campaigns where id=$1::uuid",
      [id],
    );
    expect(next.rows[0].future).toBe(true);
  });

  it("recovers interrupted claims as unknown and never reclaims them", async () => {
    const id = await create();
    await db.query("select * from notification_claim_manual($1::uuid,1,$2::uuid)", [id, actor]);
    await db.query(
      "update notification_deliveries set claimed_at=now()-interval '6 minutes' where campaign_id=$1::uuid",
      [id],
    );
    await db.query("select notification_recover_stale()");
    const { rows } = await db.query<{ status: string }>("select status from notification_campaigns where id=$1::uuid", [
      id,
    ]);
    expect(rows[0].status).toBe("unknown");
    await expect(db.query("select * from notification_claim_manual($1::uuid,3,$2::uuid)", [id, actor])).rejects.toThrow(
      "invalid_transition",
    );
  });

  it("revokes public function execution and table access", async () => {
    const { rows } = await db.query<{ function_access: boolean; table_access: boolean }>(`
      select has_function_privilege('authenticated','notification_claim_due()','execute') as function_access,
      has_table_privilege('anon','notification_deliveries','select') as table_access
    `);
    expect(rows[0]).toEqual({ function_access: false, table_access: false });
  });

  it("requires pause for recurring edits and resumes in the future without replay", async () => {
    const id = await create("daily");
    await db.query(
      "update notification_campaigns set start_date=(now() at time zone 'Asia/Jakarta')::date+1 where id=$1::uuid",
      [id],
    );
    await db.query("select * from notification_change_campaign('schedule',$1::uuid,1,$2::uuid)", [id, actor]);
    await expect(
      db.query("select * from notification_change_campaign('edit',$1::uuid,2,$2::uuid,'{}')", [id, actor]),
    ).rejects.toThrow("invalid_transition");
    await db.query("select * from notification_change_campaign('pause',$1::uuid,2,$2::uuid)", [id, actor]);
    await db.query("select * from notification_change_campaign('resume',$1::uuid,3,$2::uuid)", [id, actor]);
    const resumed = await db.query<{ future: boolean }>(
      "select next_occurrence_at > now() as future from notification_campaigns where id=$1::uuid",
      [id],
    );
    expect(resumed.rows[0].future).toBe(true);
    await db.query("select * from notification_change_campaign('cancel',$1::uuid,4,$2::uuid)", [id, actor]);
    const cancelled = await db.query<{ status: string; next_occurrence_at: null }>(
      "select status,next_occurrence_at from notification_campaigns where id=$1::uuid",
      [id],
    );
    expect(cancelled.rows[0]).toEqual({ status: "cancelled", next_occurrence_at: null });
  });

  it("leaves the claimed content snapshot intact when a parent changes", async () => {
    const id = await create();
    await db.query("select * from notification_claim_manual($1::uuid,1,$2::uuid)", [id, actor]);
    await db.query("update notification_campaigns set body='New parent text' where id=$1::uuid", [id]);
    const { rows } = await db.query<{ body: string }>(
      "select body from notification_deliveries where campaign_id=$1::uuid",
      [id],
    );
    expect(rows[0].body).toBe("Pelajari rumah sakit");
  });

  it("rejects duplicate queued claims for the same manual occurrence", async () => {
    const id = await create();
    const claims = await Promise.allSettled([
      db.query("select * from notification_claim_manual($1::uuid,1,$2::uuid)", [id, actor]),
      db.query("select * from notification_claim_manual($1::uuid,1,$2::uuid)", [id, actor]),
    ]);
    expect(claims.filter((claim) => claim.status === "fulfilled")).toHaveLength(1);
    const { rows } = await db.query<{ count: number }>(
      "select count(*)::int as count from notification_deliveries where campaign_id=$1::uuid",
      [id],
    );
    expect(rows[0].count).toBe(1);
  });

  it("skips a one-time occurrence exactly 24 hours late", async () => {
    const id = await create("once");
    await db.transaction(async (tx) => {
      await tx.query(
        "update notification_campaigns set status='scheduled',next_occurrence_at=now()-interval '24 hours' where id=$1::uuid",
        [id],
      );
      const { rows } = await tx.query<{ outcome: string }>("select * from notification_claim_due()");
      expect(rows[0].outcome).toBe("skipped");
    });
  });
});
