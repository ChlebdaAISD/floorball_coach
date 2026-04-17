import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "./db";
import {
  aiInsights,
  calendarEvents,
  injuries,
  readinessLogs,
  workoutLogs,
  type AiInsight,
  type InsertAiInsight,
} from "../shared/schema";

type InsightKind =
  | "high_load"
  | "readiness_drop"
  | "injury_caution"
  | "missed_workout"
  | "consecutive_hard_days";

type InsightDraft = Omit<InsertAiInsight, "userId" | "expiresAt"> & {
  expiresInHours?: number;
};

const DEFAULT_EXPIRY_HOURS = 24;
const MAX_ACTIVE_INSIGHTS = 3;
const RESURFACE_AFTER_HOURS = 48;

function daysAgoYmd(n: number, tz = "Europe/Warsaw"): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("sv-SE", { timeZone: tz });
}

function todayYmd(tz = "Europe/Warsaw"): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: tz });
}

function hoursFromNow(h: number): Date {
  return new Date(Date.now() + h * 60 * 60 * 1000);
}

/** Return active (not dismissed, not accepted, not expired) insights for a user. */
export async function getActiveInsights(userId: number): Promise<AiInsight[]> {
  const rows = await db
    .select()
    .from(aiInsights)
    .where(
      and(
        eq(aiInsights.userId, userId),
        isNull(aiInsights.dismissedAt),
        isNull(aiInsights.acceptedAt),
        gte(aiInsights.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(aiInsights.generatedAt))
    .limit(MAX_ACTIVE_INSIGHTS);
  return rows;
}

/**
 * Has this dedupKey been dismissed/accepted recently? If so, do not re-surface
 * until RESURFACE_AFTER_HOURS has passed — prevents nagging.
 */
async function recentlySuppressed(
  userId: number,
  dedupKey: string,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - RESURFACE_AFTER_HOURS * 60 * 60 * 1000);
  const rows = await db
    .select({ id: aiInsights.id })
    .from(aiInsights)
    .where(
      and(
        eq(aiInsights.userId, userId),
        eq(aiInsights.dedupKey, dedupKey),
        gte(aiInsights.generatedAt, cutoff),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// ─── Detection rules (deterministic) ────────────────────────

// ACWR = acute (last 7 days) ÷ chronic (trailing 28-day avg of 7-day blocks).
// Computed on the fly from workout_logs — no denormalized summary table needed.
// Rule: fire when chronic > 0 AND ratio > 1.3 (standard injury-risk threshold).
async function detectHighLoad(userId: number): Promise<InsightDraft | null> {
  const today = todayYmd();
  const day28 = daysAgoYmd(27);
  const day7 = daysAgoYmd(6);

  const [row] = await db
    .select({
      acute: sql<number>`COALESCE(SUM(CASE WHEN date >= ${day7} THEN total_tonnage ELSE 0 END), 0)::float`,
      chronic: sql<number>`COALESCE(AVG(daily_tonnage) FILTER (WHERE daily_tonnage IS NOT NULL), 0)::float`,
    })
    .from(
      sql`(
        SELECT date, SUM(total_tonnage)::float AS daily_tonnage, SUM(total_tonnage) AS total_tonnage
        FROM ${workoutLogs}
        WHERE ${workoutLogs.userId} = ${userId}
          AND date >= ${day28}
          AND date <= ${today}
          AND total_tonnage IS NOT NULL
        GROUP BY date
      ) AS daily`,
    );

  if (!row || !row.chronic || row.chronic <= 0) return null;
  // Rescale: acute is a 7-day sum; chronic is a per-day avg. Convert to 7-day-equivalent.
  const acute7 = row.acute;
  const chronic7 = row.chronic * 7;
  if (chronic7 <= 0) return null;
  const ratio = acute7 / chronic7;
  if (ratio <= 1.3) return null;

  const tomorrow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" });
  })();
  return {
    kind: "high_load",
    dedupKey: `high_load:${today}`,
    headline: "Duże obciążenie w tym tygodniu",
    body: `Twój wskaźnik ACWR to ${ratio.toFixed(2)} — jesteś w strefie podwyższonego ryzyka kontuzji. Warto dodać dzień odpoczynku.`,
    actionKind: "add_rest_day",
    actionLabel: "Dodaj dzień odpoczynku jutro",
    actionPayload: { date: tomorrow, eventType: "rest", title: "Odpoczynek" },
  };
}

async function detectReadinessDrop(userId: number): Promise<InsightDraft | null> {
  const today = todayYmd();
  const sevenDaysAgo = daysAgoYmd(7);
  const [todays] = await db
    .select()
    .from(readinessLogs)
    .where(and(eq(readinessLogs.userId, userId), eq(readinessLogs.date, today)))
    .limit(1);
  if (!todays?.trainingReadiness) return null;

  const history = await db
    .select({ v: readinessLogs.trainingReadiness })
    .from(readinessLogs)
    .where(
      and(
        eq(readinessLogs.userId, userId),
        gte(readinessLogs.date, sevenDaysAgo),
        lte(readinessLogs.date, daysAgoYmd(1)),
      ),
    );
  const values = history.map((r) => r.v).filter((v): v is number => v != null);
  if (values.length < 3) return null;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  if (todays.trainingReadiness >= avg - 20) return null;

  return {
    kind: "readiness_drop",
    dedupKey: `readiness_drop:${today}`,
    headline: "Dziś masz wyraźny spadek gotowości",
    body: `Readiness ${todays.trainingReadiness} vs średnia ${avg.toFixed(0)} z ostatniego tygodnia. Rozważ lżejszą sesję.`,
    actionKind: "ease_today",
    actionLabel: "Odpuść dzisiejszą sesję",
    actionPayload: { date: today },
  };
}

async function detectInjuryCaution(userId: number): Promise<InsightDraft | null> {
  const today = todayYmd();
  const activeInjuries = await db
    .select()
    .from(injuries)
    .where(and(eq(injuries.userId, userId), eq(injuries.isActive, true)))
    .limit(5);
  if (activeInjuries.length === 0) return null;

  const todaysEvents = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.userId, userId),
        eq(calendarEvents.date, today),
        eq(calendarEvents.status, "planned"),
      ),
    );
  const todaysGym = todaysEvents.find((e) => e.eventType === "gym");
  if (!todaysGym) return null;

  const injury = activeInjuries[0];
  return {
    kind: "injury_caution",
    dedupKey: `injury_caution:${today}:${injury.id}`,
    headline: "Aktywna kontuzja + siłownia dzisiaj",
    body: `Masz aktywną kontuzję (${injury.bodyPart}). Przed treningiem sprawdź plan i omów zamiany ćwiczeń z trenerem AI.`,
    actionKind: "swap_exercises",
    actionLabel: "Zapytaj trenera o zamiany",
    actionPayload: { injuryId: injury.id, eventId: todaysGym.id },
  };
}

async function detectMissedWorkout(userId: number): Promise<InsightDraft | null> {
  const yesterday = daysAgoYmd(1);
  const events = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.userId, userId),
        eq(calendarEvents.date, yesterday),
        eq(calendarEvents.status, "planned"),
      ),
    );
  const pending = events.filter((e) => e.eventType !== "rest");
  if (pending.length === 0) return null;
  const ev = pending[0];
  return {
    kind: "missed_workout",
    dedupKey: `missed_workout:${ev.id}`,
    headline: "Niezarejestrowany trening z wczoraj",
    body: `"${ev.title}" nadal jest w stanie zaplanowany. Zaznacz jak poszło.`,
    actionKind: "log_workout",
    actionLabel: "Uzupełnij wpis",
    actionPayload: { eventId: ev.id },
  };
}

async function detectConsecutiveHardDays(
  userId: number,
): Promise<InsightDraft | null> {
  const since = daysAgoYmd(3);
  const recent = await db
    .select({ date: workoutLogs.date, rpe: workoutLogs.rpe })
    .from(workoutLogs)
    .where(
      and(eq(workoutLogs.userId, userId), gte(workoutLogs.date, since)),
    )
    .orderBy(desc(workoutLogs.date));
  const hardDays = new Set(
    recent.filter((w) => (w.rpe ?? 0) >= 8).map((w) => w.date),
  );
  if (hardDays.size < 3) return null;
  const today = todayYmd();
  return {
    kind: "consecutive_hard_days",
    dedupKey: `consecutive_hard_days:${today}`,
    headline: "Trzy ciężkie dni z rzędu",
    body: `Ostatnie sesje miały RPE ≥ 8. Czas zaplanować dzień regeneracji.`,
    actionKind: "schedule_recovery",
    actionLabel: "Dodaj recovery jutro",
    actionPayload: {
      date: (() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" });
      })(),
      eventType: "rest",
      title: "Recovery",
    },
  };
}

// ─── Optional Gemini wording layer ──────────────────────────
// Rewrites headline/body in a warmer, more coach-like voice. Deterministic
// text is always computed first and used as fallback on any failure.
async function rewordWithGemini(
  draft: InsightDraft,
): Promise<{ headline: string; body: string } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || process.env.INSIGHTS_AI_WORDING !== "true") return null;
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `Jesteś trenerem floorballa. Przepisz poniższy insight w cieplejszy, bardziej motywujący ton (polski, "Ty").
Zwróć TYLKO JSON: {"headline": "...", "body": "..."}. Bez żadnego innego tekstu, bez kodowych ogrodzeń.
Zachowaj konkrety liczbowe z oryginału. Maks 60 znaków headline, maks 180 znaków body.

Oryginał:
headline: ${draft.headline}
body: ${draft.body}`;
    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("wording timeout")), 8000),
      ),
    ]);
    const text = result.response
      .text()
      .replace(/^```json\s*\n?|\n?```$/g, "")
      .trim();
    const parsed = JSON.parse(text) as { headline?: string; body?: string };
    if (!parsed.headline || !parsed.body) return null;
    return { headline: parsed.headline, body: parsed.body };
  } catch (err) {
    console.error("Insight reword failed, using deterministic:", err);
    return null;
  }
}

// ─── Generator ──────────────────────────────────────────────

const DETECTORS: Array<(userId: number) => Promise<InsightDraft | null>> = [
  detectHighLoad,
  detectReadinessDrop,
  detectInjuryCaution,
  detectMissedWorkout,
  detectConsecutiveHardDays,
];

/**
 * Generate and persist up to MAX_ACTIVE_INSIGHTS insights for a user.
 * Skips any draft whose dedupKey was surfaced within RESURFACE_AFTER_HOURS.
 * Returns the newly-inserted rows.
 */
export async function generateInsights(userId: number): Promise<AiInsight[]> {
  const drafts: InsightDraft[] = [];
  for (const detect of DETECTORS) {
    try {
      const d = await detect(userId);
      if (d) drafts.push(d);
    } catch (err) {
      console.error(`Insight detector failed (${detect.name}):`, err);
    }
  }

  const inserted: AiInsight[] = [];
  for (const d of drafts.slice(0, MAX_ACTIVE_INSIGHTS)) {
    if (await recentlySuppressed(userId, d.dedupKey)) continue;
    const reworded = await rewordWithGemini(d);
    const [row] = await db
      .insert(aiInsights)
      .values({
        userId,
        kind: d.kind,
        dedupKey: d.dedupKey,
        headline: reworded?.headline ?? d.headline,
        body: reworded?.body ?? d.body,
        actionKind: d.actionKind,
        actionLabel: d.actionLabel,
        actionPayload: d.actionPayload,
        expiresAt: hoursFromNow(d.expiresInHours ?? DEFAULT_EXPIRY_HOURS),
      })
      .returning();
    inserted.push(row);
  }
  return inserted;
}

/**
 * Fetch active insights. If none fresh (< 6h) exist, regenerate first.
 */
export async function getOrGenerateInsights(
  userId: number,
): Promise<AiInsight[]> {
  const existing = await getActiveInsights(userId);
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const fresh = existing.filter((i) => i.generatedAt >= sixHoursAgo);
  if (fresh.length > 0) return existing;
  await generateInsights(userId);
  return getActiveInsights(userId);
}

export async function dismissInsight(
  userId: number,
  id: number,
): Promise<boolean> {
  const result = await db
    .update(aiInsights)
    .set({ dismissedAt: new Date() })
    .where(and(eq(aiInsights.id, id), eq(aiInsights.userId, userId)))
    .returning({ id: aiInsights.id });
  return result.length > 0;
}

export async function acceptInsight(
  userId: number,
  id: number,
): Promise<AiInsight | null> {
  const [row] = await db
    .update(aiInsights)
    .set({ acceptedAt: new Date() })
    .where(and(eq(aiInsights.id, id), eq(aiInsights.userId, userId)))
    .returning();
  return row ?? null;
}

export async function getInsight(
  userId: number,
  id: number,
): Promise<AiInsight | null> {
  const [row] = await db
    .select()
    .from(aiInsights)
    .where(and(eq(aiInsights.id, id), eq(aiInsights.userId, userId)))
    .limit(1);
  return row ?? null;
}
