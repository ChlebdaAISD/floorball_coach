import type { Express, Request, Response, NextFunction } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import {
  calendarEvents,
  readinessLogs,
  users,
  workoutLogs,
} from "../shared/schema";
import {
  renderMorningReadiness,
  renderPostWorkout,
  sendEmailOnce,
} from "./email";
import { generateInsights } from "./insights";

/**
 * Shared-secret guard for cron endpoints. Railway cron hits these with a
 * static header we control.
 */
function requireCronSecret(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: "CRON_SECRET not configured" });
  if (req.headers["x-cron-secret"] !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

/** YYYY-MM-DD in a given timezone. */
function ymdInTz(d: Date, tz: string): string {
  return d.toLocaleDateString("sv-SE", { timeZone: tz });
}

/** Hour-of-day (0-23) in a given timezone. */
function hourInTz(d: Date, tz: string): number {
  const s = d.toLocaleString("en-GB", { timeZone: tz, hour: "2-digit", hour12: false });
  return parseInt(s, 10);
}

/** Parse HH:MM → minutes since midnight. Returns null if malformed. */
function parseTime(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export function registerCronRoutes(app: Express) {
  // ─── Morning insight generation ──────────────────────────
  // Call hourly; generates insights for users whose local time == 6:00.
  app.post(
    "/internal/cron/insights-morning",
    requireCronSecret,
    async (_req, res) => {
      const now = new Date();
      const allUsers = await db.select().from(users);
      const targets = allUsers.filter((u) => hourInTz(now, u.timezone) === 6);
      let generated = 0;
      for (const u of targets) {
        try {
          const rows = await generateInsights(u.id);
          generated += rows.length;
        } catch (err) {
          console.error(`insights-morning failed for user ${u.id}:`, err);
        }
      }
      res.json({ processed: targets.length, generated });
    },
  );

  // ─── Morning readiness email ─────────────────────────────
  // Call hourly; sends to users whose local time == 8:00 who haven't logged
  // readiness yet today and have email nudges enabled.
  app.post(
    "/internal/cron/email-morning",
    requireCronSecret,
    async (_req, res) => {
      const now = new Date();
      const allUsers = await db.select().from(users);
      const targets = allUsers.filter(
        (u) =>
          u.emailNudges &&
          u.email &&
          hourInTz(now, u.timezone) === 8,
      );

      const results: Array<{ userId: number; sent: boolean; reason?: string }> = [];
      for (const u of targets) {
        const today = ymdInTz(now, u.timezone);
        const [existing] = await db
          .select({ id: readinessLogs.id })
          .from(readinessLogs)
          .where(
            and(
              eq(readinessLogs.userId, u.id),
              eq(readinessLogs.date, today),
            ),
          )
          .limit(1);
        if (existing) continue;

        const tpl = renderMorningReadiness(u.username);
        const result = await sendEmailOnce({
          userId: u.id,
          to: u.email!,
          kind: "morning_readiness",
          dedupKey: `morning_readiness:${today}`,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
        });
        results.push({
          userId: u.id,
          sent: result.sent,
          reason: result.sent ? undefined : result.reason,
        });
      }
      res.json({ processed: targets.length, results });
    },
  );

  // ─── Post-workout follow-up email ────────────────────────
  // Call hourly; for each planned event that ended > 30 min ago and has no
  // workout log, email the user (rate-limited via email_sends dedup).
  app.post(
    "/internal/cron/email-postworkout",
    requireCronSecret,
    async (_req, res) => {
      const now = new Date();
      const allUsers = await db.select().from(users);
      const active = allUsers.filter((u) => u.emailNudges && u.email);

      const results: Array<{ eventId: number; sent: boolean; reason?: string }> = [];
      for (const u of active) {
        const today = ymdInTz(now, u.timezone);
        const yesterday = ymdInTz(
          new Date(now.getTime() - 24 * 60 * 60 * 1000),
          u.timezone,
        );

        const events = await db
          .select()
          .from(calendarEvents)
          .where(
            and(
              eq(calendarEvents.userId, u.id),
              eq(calendarEvents.status, "planned"),
              sql`${calendarEvents.date} in (${today}, ${yesterday})`,
            ),
          );

        for (const ev of events) {
          if (ev.eventType === "rest") continue;
          // Only nudge events that already ended (time is set and at least 30
          // minutes in the past in the user's timezone).
          const tMinutes = parseTime(ev.time);
          if (tMinutes == null) continue;
          const eventEndLocal = new Date(
            `${ev.date}T${String(Math.floor(tMinutes / 60)).padStart(2, "0")}:${String(tMinutes % 60).padStart(2, "0")}:00`,
          );
          // Treat the parsed time as local-to-user by converting via offset:
          // we use current tz hour diff to approximate. Simpler: require
          // current-day event hour to have passed by ≥1 hour.
          const nowHourLocal = hourInTz(now, u.timezone);
          const eventHour = Math.floor(tMinutes / 60);
          const isYesterday = ev.date === yesterday;
          const oneHourPast =
            isYesterday || nowHourLocal >= eventHour + 1;
          if (!oneHourPast) continue;

          // Skip if workout already logged
          const [logged] = await db
            .select({ id: workoutLogs.id })
            .from(workoutLogs)
            .where(eq(workoutLogs.calendarEventId, ev.id))
            .limit(1);
          if (logged) continue;

          const tpl = renderPostWorkout(u.username, ev.title, ev.id);
          const result = await sendEmailOnce({
            userId: u.id,
            to: u.email!,
            kind: "post_workout",
            dedupKey: `post_workout:event:${ev.id}`,
            subject: tpl.subject,
            html: tpl.html,
            text: tpl.text,
          });
          results.push({
            eventId: ev.id,
            sent: result.sent,
            reason: result.sent ? undefined : result.reason,
          });
        }
      }
      res.json({ processed: active.length, results });
    },
  );
}
