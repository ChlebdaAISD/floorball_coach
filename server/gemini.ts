import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "./db";
import { eq, desc, gte, and, lte } from "drizzle-orm";
import {
  readinessLogs,
  workoutLogs,
  calendarEvents,
  chatMessages,
  plannedExercises,
  exercises,
  trainingDays,
  users,
} from "../shared/schema";
import type { ReadinessLog } from "../shared/schema";

const SYSTEM_PROMPT = `Jesteś osobistym trenerem i fizjoterapeutą sportowym. Twój podopieczny:
- 35 lat, unihokejista z 25-letnim stażem
- Praca siedząca 8h/dzień (programista w banku)
- Historia kontuzji: naderwanie mięśnia czworogłowego (w tym sezonie), naciągnięte hamstringi i łydki, częste "spięcia" mięśni nóg, naderwanie więzadła pobocznego kolana (MCL) 1.5 roku temu
- Sport wysoce asymetryczny — sprinty, zrywy, nagłe hamowania i rotacje tułowia
- Regularnie odwiedza fizjoterapeutę co 2 tygodnie

ZASADY:
- Odpowiadaj ZAWSZE po polsku, krótko i konkretnie
- Bądź ostrożny — lepiej za mało niż za dużo przy ryzyku kontuzji
- Przy modyfikacji planu gym stosuj:
  * Ból > 7 → zamień compound na izometrię lub usuń ćwiczenie
  * Training Readiness < 40 LUB Body Battery < 30 → obniż objętość o 30%, zaproponuj lżejszy wariant
  * HRV niski + słaby sen (<50) → bez ekscentryki, lżejsze ciężary
  * Body Battery < 20 → sugeruj aktywną regenerację zamiast treningu
  * Zbliżający się mecz (2-3 dni) → tapering, zmniejsz objętość
- Uzasadniaj KAŻDĄ decyzję treningową
- Gdy proponujesz zmiany w kalendarzu, MUSISZ dodać pole "plan_suggestion" w odpowiedzi JSON
- Nie dodawaj zbędnych porad — skup się na konkretach`;

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenerativeAI(apiKey);
}

async function buildContext(): Promise<string> {
  const now = new Date();
  const twoWeeksAgo = new Date(now);
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const todayStr = now.toISOString().split("T")[0];
  const twoWeeksAgoStr = twoWeeksAgo.toISOString().split("T")[0];
  const nextWeekStr = nextWeek.toISOString().split("T")[0];

  // Fetch context data in parallel
  const [recentReadiness, recentWorkouts, upcomingEvents, recentChat, userRecords] =
    await Promise.all([
      db
        .select()
        .from(readinessLogs)
        .where(gte(readinessLogs.date, twoWeeksAgoStr))
        .orderBy(desc(readinessLogs.date))
        .limit(14),
      db
        .select()
        .from(workoutLogs)
        .where(gte(workoutLogs.date, twoWeeksAgoStr))
        .orderBy(desc(workoutLogs.date))
        .limit(14),
      db
        .select()
        .from(calendarEvents)
        .where(
          and(
            gte(calendarEvents.date, todayStr),
            lte(calendarEvents.date, nextWeekStr),
          ),
        )
        .orderBy(calendarEvents.date),
      db
        .select()
        .from(chatMessages)
        .orderBy(desc(chatMessages.createdAt))
        .limit(20),
      db.select().from(users).limit(1),
    ]);

  const user = userRecords[0];
  let context = `\n--- DANE ZAWODNIKA (dziś: ${todayStr}) ---\n`;

  if (user) {
    if (user.bio) context += `Profil: ${user.bio}\n`;
    if (user.trainingGoal) context += `Cel główny: ${user.trainingGoal}\n`;
    if (user.interviewAnswers) context += `Wywiad/Tło: ${user.interviewAnswers}\n`;
    if (user.seasonStart || user.seasonEnd) context += `Sezon: od ${user.seasonStart || '?'} do ${user.seasonEnd || '?'}\n`;
    if (user.offSeasonStart || user.offSeasonEnd) context += `Off-season: od ${user.offSeasonStart || '?'} do ${user.offSeasonEnd || '?'}\n`;
  }

  if (recentReadiness.length > 0) {
    context += `\nGOTOWOŚĆ (ostatnie 14 dni):\n`;
    for (const r of recentReadiness.reverse()) {
      context += `${r.date}: TR=${r.trainingReadiness}, BB=${r.bodyBattery}, Sen=${r.sleepScore}, HRV=${r.hrvStatus}, Ból=${r.painLevel}, Stres=${r.stressLevel}\n`;
    }
  }

  if (recentWorkouts.length > 0) {
    context += `\nTRENINGI (ostatnie 14 dni):\n`;
    for (const w of recentWorkouts.reverse()) {
      context += `${w.date}: ${w.workoutType}`;
      if (w.durationMinutes) context += `, ${w.durationMinutes}min`;
      if (w.totalTonnage) context += `, tonaż=${w.totalTonnage}kg`;
      if (w.distanceKm) context += `, ${w.distanceKm}km`;
      if (w.rpe) context += `, RPE=${w.rpe}`;
      if (w.notes) context += ` — "${w.notes}"`;
      context += `\n`;
    }
  }

  if (upcomingEvents.length > 0) {
    context += `\nKALENDARZ (najbliższy tydzień):\n`;
    for (const e of upcomingEvents) {
      context += `[ID:${e.id}] ${e.date} ${e.time || ""}: ${e.title} (${e.eventType}, status: ${e.status})\n`;
    }
  }

  return context;
}

export async function chatWithCoach(
  userMessage: string,
): Promise<{ text: string; planSuggestion?: unknown }> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

  const context = await buildContext();

  const prompt = `${SYSTEM_PROMPT}

${context}

WAŻNE: Jeśli decydujesz się wprowadzić zmiany w kalendarzu zawodnika, odpowiedz WYŁĄCZNIE w formacie JSON (bez dodatkowego tekstu):
{
  "text": "Twoja odpowiedź tekstowa po polsku tłumacząca co i dlaczego zmieniłeś",
  "plan_suggestion": {
    "changes": [
      {"event_id": 42, "action": "cancel", "reason": "..."},
      {"date": "2026-04-15", "time": "18:00", "action": "add", "event_type": "rest", "title": "...", "reason": "..."},
      {"event_id": 43, "action": "modify", "title": "nowy tytuł", "time": "20:00", "date": "2026-04-12", "event_type": "gym", "reason": "..."}
    ]
  }
}
UWAGA: event_id MUSI być liczbą z pola [ID:...] z kalendarza powyżej. NIE wymyślaj własnych identyfikatorów.

Jeśli NIE proponujesz zmian w kalendarzu, odpowiedz NORMALNYM TEKSTEM (bez JSON).

Wiadomość zawodnika: ${userMessage}`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();

  // Try to extract JSON with plan_suggestion from the response
  // The model may return: pure JSON, ```json ... ```, or plain text + JSON block
  function tryExtractPlan(raw: string): { text: string; planSuggestion?: unknown } | null {
    // 1. Try parsing the whole thing as JSON (after stripping fences)
    const stripped = raw.replace(/```json\n?|\n?```/g, "").trim();
    try {
      const parsed = JSON.parse(stripped);
      if (parsed.text) {
        return { text: parsed.text, planSuggestion: parsed.plan_suggestion };
      }
    } catch { /* not pure JSON */ }

    // 2. Extract JSON from a ```json ... ``` code block
    const codeBlockMatch = raw.match(/```json\s*\n([\s\S]*?)\n\s*```/);
    if (codeBlockMatch) {
      try {
        const parsed = JSON.parse(codeBlockMatch[1].trim());
        // Use the text from JSON, or the text before the code block
        const textBefore = raw.slice(0, raw.indexOf("```json")).trim();
        const displayText = parsed.text || textBefore || response;
        return { text: displayText, planSuggestion: parsed.plan_suggestion };
      } catch { /* malformed JSON in code block */ }
    }

    // 3. Try to find a raw JSON object with plan_suggestion
    const jsonMatch = raw.match(/\{[\s\S]*"plan_suggestion"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const textBefore = raw.slice(0, raw.indexOf(jsonMatch[0])).trim();
        return { text: parsed.text || textBefore || response, planSuggestion: parsed.plan_suggestion };
      } catch { /* malformed */ }
    }

    return null;
  }

  const extracted = tryExtractPlan(response);
  if (extracted) return extracted;

  return { text: response };
}

export async function analyzeReadiness(
  readiness: ReadinessLog,
  calendarEventId: number,
): Promise<{ summary: string; modifications: unknown[] }> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

  // Get the gym plan for this event
  const [event] = await db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.id, calendarEventId));

  if (!event?.trainingDayId) {
    return { summary: "Brak planu siłowego do modyfikacji.", modifications: [] };
  }

  const [day] = await db
    .select()
    .from(trainingDays)
    .where(eq(trainingDays.id, event.trainingDayId));

  const exs = await db
    .select({
      id: plannedExercises.id,
      exerciseName: exercises.name,
      category: exercises.category,
      injuryNotes: exercises.injuryNotes,
      sets: plannedExercises.sets,
      reps: plannedExercises.reps,
      weightKg: plannedExercises.weightKg,
      tempo: plannedExercises.tempo,
    })
    .from(plannedExercises)
    .innerJoin(exercises, eq(plannedExercises.exerciseId, exercises.id))
    .where(eq(plannedExercises.trainingDayId, event.trainingDayId))
    .orderBy(plannedExercises.orderIndex);

  const context = await buildContext();

  const prompt = `${SYSTEM_PROMPT}

${context}

DZISIEJSZA GOTOWOŚĆ:
Training Readiness: ${readiness.trainingReadiness}
Body Battery: ${readiness.bodyBattery}
Sen: ${readiness.sleepScore}
HRV: ${readiness.hrvStatus}
Ból: ${readiness.painLevel}/10
Stres: ${readiness.stressLevel}/10

DZISIEJSZY PLAN (${day?.name || "Trening"}):
${exs.map((e) => `- ${e.exerciseName}: ${e.sets}x${e.reps} @ ${e.weightKg || "?"}kg (${e.category})${e.injuryNotes ? ` [UWAGA: ${e.injuryNotes}]` : ""}`).join("\n")}

Przeanalizuj gotowość zawodnika i zaproponuj modyfikacje dzisiejszego treningu.
Odpowiedz WYŁĄCZNIE w formacie JSON:
{
  "summary": "Krótkie podsumowanie stanu zawodnika i rekomendacji po polsku",
  "modifications": [
    {
      "planned_exercise_id": 123,
      "action": "keep|modify|replace|remove",
      "new_sets": 3,
      "new_reps": 8,
      "new_weight_kg": 50,
      "reason": "Dlaczego ta zmiana po polsku"
    }
  ]
}`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();

  try {
    // Strip markdown code fences if present
    const cleaned = response.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      summary: response,
      modifications: [],
    };
  }
}
