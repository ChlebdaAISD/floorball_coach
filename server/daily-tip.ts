import { GoogleGenerativeAI } from "@google/generative-ai";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "./db";
import {
  athleteProfiles,
  calendarEvents,
  injuries,
  readinessLogs,
  users,
} from "../shared/schema";

const MODEL_NAME = "gemini-3-flash-preview";

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenerativeAI(apiKey);
}

function stripJsonFences(raw: string): string {
  return raw.replace(/^```json\s*\n?|\n?\s*```$/gm, "").trim();
}

function ymdInTz(d: Date, tz: string): string {
  return d.toLocaleDateString("sv-SE", { timeZone: tz });
}

export interface DailyTip {
  headline: string;
  body: string;
}

export async function generateDailyTip(userId: number): Promise<DailyTip> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error(`user ${userId} not found`);

  const [profile] = await db
    .select()
    .from(athleteProfiles)
    .where(eq(athleteProfiles.userId, userId))
    .limit(1);

  const today = ymdInTz(new Date(), user.timezone);
  const weekAgo = ymdInTz(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    user.timezone,
  );

  const todayEvents = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.userId, userId),
        eq(calendarEvents.date, today),
      ),
    );

  const [latestReadiness] = await db
    .select()
    .from(readinessLogs)
    .where(
      and(
        eq(readinessLogs.userId, userId),
        gte(readinessLogs.date, weekAgo),
        lte(readinessLogs.date, today),
      ),
    )
    .orderBy(desc(readinessLogs.date))
    .limit(1);

  const activeInjuries = await db
    .select()
    .from(injuries)
    .where(and(eq(injuries.userId, userId), eq(injuries.isActive, true)));

  const eventsText = todayEvents.length
    ? todayEvents
        .map(
          (e) =>
            `- ${e.time ?? "bez godziny"} ${e.title} (${e.eventType}, status: ${e.status})`,
        )
        .join("\n")
    : "- brak zaplanowanych wydarzeń";

  const readinessText = latestReadiness
    ? `Ostatnia gotowość (${latestReadiness.date}): TR=${latestReadiness.trainingReadiness ?? "?"}, BB=${latestReadiness.bodyBattery ?? "?"}, sen=${latestReadiness.sleepScore ?? "?"}, HRV=${latestReadiness.hrvStatus ?? "?"}, ból=${latestReadiness.painLevel ?? 0}/10`
    : "Brak świeżych danych o gotowości.";

  const injuriesText = activeInjuries.length
    ? activeInjuries
        .map(
          (i) =>
            `- ${i.bodyPart} (${i.severity ?? "?"}, ${i.injuryType ?? ""})${i.description ? ": " + i.description : ""}`,
        )
        .join("\n")
    : "- brak aktywnych kontuzji";

  const sportLine = profile?.sport
    ? `Sport: ${profile.sport}${profile.sportPosition ? " · " + profile.sportPosition : ""}`
    : "";

  const prompt = `Jesteś osobistym trenerem i fizjoterapeutą sportowym. Pisz po polsku, konkretnie, bez ogólników.

Podopieczny: ${user.username}
${sportLine}
Cel: ${user.trainingGoal ?? "brak"}

Dzisiejszy plan (${today}):
${eventsText}

${readinessText}

Aktywne kontuzje:
${injuriesText}

Zadanie: Wygeneruj krótką poranną wskazówkę od trenera na dziś. Ma być konkretna: co zrobić dziś najlepiej (np. jak się rozgrzać, na co zwrócić uwagę pod kątem kontuzji, jak pracować z intensywnością, co zjeść/wypić przed/po). Max 4 zdania w polu body. Headline max 8 słów.

Odpowiedz WYŁĄCZNIE w formacie JSON (bez dodatkowego tekstu):
{
  "headline": "Krótki nagłówek (max 8 słów)",
  "body": "3-4 zdania konkretnej wskazówki"
}`;

  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });
  const result = await Promise.race([
    model.generateContent(prompt),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini timeout po 30 sekundach")), 30_000),
    ),
  ]);
  const raw = result.response.text();
  const cleaned = stripJsonFences(raw);
  const parsed = JSON.parse(cleaned);
  if (typeof parsed.headline !== "string" || typeof parsed.body !== "string") {
    throw new Error("invalid daily tip shape from Gemini");
  }
  return { headline: parsed.headline, body: parsed.body };
}
