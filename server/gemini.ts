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
  athleteProfiles,
  injuries,
} from "../shared/schema";
import type { ReadinessLog } from "../shared/schema";

// ─── Constants ─────────────────────────────────────────────
const MODEL_NAME = "gemini-3-flash-preview";

// Training rules that apply to any athlete
const TRAINING_RULES = `ZASADY TRENINGOWE:
- Odpowiadaj ZAWSZE po polsku, krótko i konkretnie
- Bądź ostrożny — lepiej za mało niż za dużo przy ryzyku kontuzji
- Przy modyfikacji planu gym stosuj:
  * Ból > 7 → zamień compound na izometrię lub usuń ćwiczenie
  * Training Readiness < 40 LUB Body Battery < 30 → obniż objętość o 30%, zaproponuj lżejszy wariant
  * HRV niski + słaby sen (<50) → bez ekscentryki, lżejsze ciężary
  * Body Battery < 20 → sugeruj aktywną regenerację zamiast treningu
  * Zbliżający się mecz (2-3 dni) → tapering, zmniejsz objętość
- Uzasadniaj KAŻDĄ decyzję treningową
- Nie dodawaj zbędnych porad — skup się na konkretach`;

// ─── Context Types ─────────────────────────────────────────
export type ContextType = "chat" | "readiness" | "onboarding" | "weekly_planning" | "post_workout";

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenerativeAI(apiKey);
}

/** Wraps model.generateContent with a 30-second timeout */
async function generateWithTimeout(
  model: ReturnType<InstanceType<typeof GoogleGenerativeAI>["getGenerativeModel"]>,
  prompt: string,
  timeoutMs = 30_000,
): Promise<string> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Gemini timeout po 30 sekundach")), timeoutMs)
  );
  const result = await Promise.race([
    model.generateContent(prompt),
    timeoutPromise,
  ]);
  return result.response.text();
}

// ─── System Prompt Builder ─────────────────────────────────
async function buildSystemPrompt(userId: number): Promise<string> {
  const [profileRow] = await db
    .select()
    .from(athleteProfiles)
    .where(eq(athleteProfiles.userId, userId))
    .limit(1);

  const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  const activeInjuries = await db
    .select()
    .from(injuries)
    .where(and(eq(injuries.userId, userId), eq(injuries.isActive, true)));

  let prompt = `Jesteś osobistym trenerem i fizjoterapeutą sportowym.`;

  if (profileRow || userRow) {
    prompt += `\n\nTWÓJ PODOPIECZNY:`;
    if (profileRow?.age) prompt += `\n- Wiek: ${profileRow.age} lat`;
    if (profileRow?.heightCm) prompt += `\n- Wzrost: ${profileRow.heightCm} cm`;
    if (profileRow?.weightKg) prompt += `\n- Waga: ${profileRow.weightKg} kg`;
    if (profileRow?.sport) {
      prompt += `\n- Sport: ${profileRow.sport}`;
      if (profileRow.sportPosition) prompt += ` (${profileRow.sportPosition})`;
      if (profileRow.experienceYears) prompt += `, ${profileRow.experienceYears} lat doświadczenia`;
    }
    if (profileRow?.gymExperienceLevel) prompt += `\n- Doświadczenie gym: ${profileRow.gymExperienceLevel}`;
    if (profileRow?.trainingDaysPerWeek) prompt += `\n- Dostępność: ${profileRow.trainingDaysPerWeek} treningi/tyg.`;
    if (Array.isArray(profileRow?.availableFacilities) && profileRow.availableFacilities.length > 0) {
      prompt += `\n- Dostępne warunki: ${(profileRow.availableFacilities as string[]).join(", ")}`;
    }
    if (Array.isArray(profileRow?.fixedWeeklySchedule) && profileRow.fixedWeeklySchedule.length > 0) {
      const schedule = (profileRow.fixedWeeklySchedule as Array<Record<string, unknown>>)
        .map((s) => `${s.day} ${s.time || ""} (${s.type || "trening"})`)
        .join(", ");
      prompt += `\n- Stały grafik: ${schedule}`;
    }
    if (profileRow?.bio) prompt += `\n- Profil: ${profileRow.bio}`;
    if (userRow?.trainingGoal) prompt += `\n- Cel główny: ${userRow.trainingGoal}`;
    if (userRow?.seasonStart || userRow?.seasonEnd) {
      prompt += `\n- Sezon: od ${userRow.seasonStart || "?"} do ${userRow.seasonEnd || "?"}`;
    }
    if (userRow?.offSeasonStart || userRow?.offSeasonEnd) {
      prompt += `\n- Off-season: od ${userRow.offSeasonStart || "?"} do ${userRow.offSeasonEnd || "?"}`;
    }
    if (profileRow?.additionalNotes) prompt += `\n- Uwagi: ${profileRow.additionalNotes}`;
  }

  if (activeInjuries.length > 0) {
    prompt += `\n\nAKTYWNE KONTUZJE:`;
    for (const inj of activeInjuries) {
      prompt += `\n- ${inj.bodyPart}`;
      if (inj.injuryType) prompt += ` (${inj.injuryType})`;
      if (inj.severity) prompt += `, nasilenie: ${inj.severity}`;
      if (inj.dateOccurred) prompt += `, od ${inj.dateOccurred}`;
      if (inj.description) prompt += ` — ${inj.description}`;
      if (inj.managementNotes) prompt += ` [zarządzanie: ${inj.managementNotes}]`;
    }
  }

  prompt += `\n\n${TRAINING_RULES}`;

  return prompt;
}

// ─── Context Builder ───────────────────────────────────────
async function buildContext(type: ContextType, userId: number): Promise<string> {
  // Per-type configuration
  const config = {
    chat: { readinessDays: 14, workoutDays: 14, calendarDays: 7, chatLimit: 10 },
    readiness: { readinessDays: 14, workoutDays: 7, calendarDays: 1, chatLimit: 3 },
    onboarding: { readinessDays: 0, workoutDays: 0, calendarDays: 0, chatLimit: 15 },
    weekly_planning: { readinessDays: 14, workoutDays: 14, calendarDays: 30, chatLimit: 5 },
    post_workout: { readinessDays: 3, workoutDays: 3, calendarDays: 3, chatLimit: 3 },
  }[type];

  const now = new Date();
  const pastStart = new Date(now);
  pastStart.setDate(pastStart.getDate() - Math.max(config.readinessDays, config.workoutDays));
  const futureEnd = new Date(now);
  futureEnd.setDate(futureEnd.getDate() + config.calendarDays);

  const todayStr = now.toISOString().split("T")[0];
  const pastStartStr = pastStart.toISOString().split("T")[0];
  const futureEndStr = futureEnd.toISOString().split("T")[0];

  const chatWhere = type === "onboarding"
    ? and(eq(chatMessages.userId, userId), eq(chatMessages.contextType, "onboarding"))
    : eq(chatMessages.userId, userId);

  const [recentReadiness, recentWorkouts, upcomingEvents, recentChat] =
    await Promise.all([
      config.readinessDays > 0
        ? db
            .select()
            .from(readinessLogs)
            .where(and(eq(readinessLogs.userId, userId), gte(readinessLogs.date, pastStartStr)))
            .orderBy(desc(readinessLogs.date))
            .limit(config.readinessDays)
        : Promise.resolve([]),
      config.workoutDays > 0
        ? db
            .select()
            .from(workoutLogs)
            .where(and(eq(workoutLogs.userId, userId), gte(workoutLogs.date, pastStartStr)))
            .orderBy(desc(workoutLogs.date))
            .limit(config.workoutDays)
        : Promise.resolve([]),
      config.calendarDays > 0
        ? db
            .select()
            .from(calendarEvents)
            .where(
              and(
                eq(calendarEvents.userId, userId),
                gte(calendarEvents.date, todayStr),
                lte(calendarEvents.date, futureEndStr),
              ),
            )
            .orderBy(calendarEvents.date)
        : Promise.resolve([]),
      db
        .select()
        .from(chatMessages)
        .where(chatWhere)
        .orderBy(desc(chatMessages.createdAt))
        .limit(config.chatLimit),
    ]);

  let context = `\n--- DANE (dziś: ${todayStr}) ---\n`;

  if (recentReadiness.length > 0) {
    context += `\nGOTOWOŚĆ (ostatnie ${recentReadiness.length} dni):\n`;
    for (const r of [...recentReadiness].reverse()) {
      context += `${r.date}: TR=${r.trainingReadiness}, BB=${r.bodyBattery}, Sen=${r.sleepScore}, HRV=${r.hrvStatus}, Ból=${r.painLevel}, Stres=${r.stressLevel}\n`;
    }
  }

  if (recentWorkouts.length > 0) {
    context += `\nTRENINGI (ostatnie ${recentWorkouts.length} dni):\n`;
    for (const w of [...recentWorkouts].reverse()) {
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
    context += `\nKALENDARZ (najbliższe ${config.calendarDays} dni):\n`;
    for (const e of upcomingEvents) {
      context += `[ID:${e.id}] ${e.date} ${e.time || ""}: ${e.title} (${e.eventType}, status: ${e.status})\n`;
    }
  }

  // Chat history — FIX: previously fetched but never included in prompt
  if (recentChat.length > 0) {
    const chrono = [...recentChat].reverse();
    context += `\nHISTORIA ROZMOWY (ostatnie ${chrono.length}):\n`;
    for (const m of chrono) {
      const label = m.role === "user" ? "Użytkownik" : "Trener";
      // Trim overly long messages to keep context tight
      const content = m.content.length > 500 ? m.content.slice(0, 500) + "…" : m.content;
      context += `[${label}]: ${content}\n`;
    }
  }

  return context;
}

// ─── Helpers ───────────────────────────────────────────────
function getSoleUserId(userId?: number): Promise<number> {
  if (userId) return Promise.resolve(userId);
  // Fallback for routes that don't pass userId (single-user mode)
  return db
    .select({ id: users.id })
    .from(users)
    .limit(1)
    .then((rows) => {
      if (!rows[0]) throw new Error("No user found");
      return rows[0].id;
    });
}

function stripJsonFences(raw: string): string {
  return raw.replace(/^```json\s*\n?|\n?\s*```$/gm, "").trim();
}

async function buildChatPrompt(userMessage: string, userId: number): Promise<string> {
  const systemPrompt = await buildSystemPrompt(userId);
  const context = await buildContext("chat", userId);
  return `${systemPrompt}

${context}

WAŻNE - FORMAT ODPOWIEDZI:
Jeśli wykryjesz wzmiankę o bólu/kontuzji/urazie, LUB chcesz wprowadzić zmiany w kalendarzu,
odpowiedz WYŁĄCZNIE w formacie JSON (bez dodatkowego tekstu):
{
  "text": "Twoja odpowiedź tekstowa po polsku",
  "plan_suggestion": {
    "changes": [
      {"event_id": 42, "action": "cancel", "reason": "..."},
      {"date": "2026-04-15", "time": "18:00", "action": "add", "event_type": "rest", "title": "...", "reason": "..."},
      {"event_id": 43, "action": "modify", "title": "nowy tytuł", "time": "20:00", "date": "2026-04-12", "event_type": "gym", "reason": "..."}
    ]
  },
  "injury_update": {
    "body_part": "kolano_lewe",
    "injury_type": "ból",
    "severity": "lekka",
    "description": "ból po treningu",
    "is_active": true
  }
}

Pole "plan_suggestion" — pomiń jeśli nie proponujesz zmian.
Pole "injury_update" — pomiń jeśli użytkownik nie wspomina o bólu/kontuzji.
UWAGA: event_id MUSI być liczbą z pola [ID:...] z kalendarza powyżej. NIE wymyślaj ID.

Jeśli NIE proponujesz zmian ANI nie wykrywasz kontuzji, odpowiedz NORMALNYM TEKSTEM (bez JSON).

Wiadomość zawodnika: ${userMessage}`;
}

export function extractChatResponse(raw: string): { text: string; planSuggestion?: unknown; injuryUpdate?: unknown } {
  const stripped = stripJsonFences(raw);
  try {
    const parsed = JSON.parse(stripped);
    if (parsed.text) {
      return { text: parsed.text, planSuggestion: parsed.plan_suggestion, injuryUpdate: parsed.injury_update };
    }
  } catch { /* not pure JSON */ }

  const codeBlockMatch = raw.match(/```json\s*\n([\s\S]*?)\n\s*```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      const textBefore = raw.slice(0, raw.indexOf("```json")).trim();
      return {
        text: parsed.text || textBefore || raw,
        planSuggestion: parsed.plan_suggestion,
        injuryUpdate: parsed.injury_update,
      };
    } catch { /* malformed */ }
  }

  const jsonMatch = raw.match(/\{[\s\S]*"(plan_suggestion|injury_update)"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const textBefore = raw.slice(0, raw.indexOf(jsonMatch[0])).trim();
      return {
        text: parsed.text || textBefore || raw,
        planSuggestion: parsed.plan_suggestion,
        injuryUpdate: parsed.injury_update,
      };
    } catch { /* malformed */ }
  }

  return { text: raw };
}

export async function* chatWithCoachStream(
  userMessage: string,
  userId?: number,
): AsyncGenerator<string, void, unknown> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });
  const resolvedUserId = await getSoleUserId(userId);
  const prompt = await buildChatPrompt(userMessage, resolvedUserId);

  const result = await model.generateContentStream(prompt);
  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) yield text;
  }
}

// ─── Chat with Coach ───────────────────────────────────────
export async function chatWithCoach(
  userMessage: string,
  userId?: number,
): Promise<{ text: string; planSuggestion?: unknown; injuryUpdate?: unknown }> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const resolvedUserId = await getSoleUserId(userId);
  const prompt = await buildChatPrompt(userMessage, resolvedUserId);

  const response = await generateWithTimeout(model, prompt);

  function tryExtract(raw: string): { text: string; planSuggestion?: unknown; injuryUpdate?: unknown } | null {
    // 1. Try parsing the whole thing as JSON (after stripping fences)
    const stripped = stripJsonFences(raw);
    try {
      const parsed = JSON.parse(stripped);
      if (parsed.text) {
        return {
          text: parsed.text,
          planSuggestion: parsed.plan_suggestion,
          injuryUpdate: parsed.injury_update,
        };
      }
    } catch { /* not pure JSON */ }

    // 2. Extract from ```json ... ``` code block
    const codeBlockMatch = raw.match(/```json\s*\n([\s\S]*?)\n\s*```/);
    if (codeBlockMatch) {
      try {
        const parsed = JSON.parse(codeBlockMatch[1].trim());
        const textBefore = raw.slice(0, raw.indexOf("```json")).trim();
        const displayText = parsed.text || textBefore || response;
        return {
          text: displayText,
          planSuggestion: parsed.plan_suggestion,
          injuryUpdate: parsed.injury_update,
        };
      } catch { /* malformed */ }
    }

    // 3. Try to find a raw JSON object with plan_suggestion or injury_update
    const jsonMatch = raw.match(/\{[\s\S]*"(plan_suggestion|injury_update)"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const textBefore = raw.slice(0, raw.indexOf(jsonMatch[0])).trim();
        return {
          text: parsed.text || textBefore || response,
          planSuggestion: parsed.plan_suggestion,
          injuryUpdate: parsed.injury_update,
        };
      } catch { /* malformed */ }
    }

    return null;
  }

  const extracted = tryExtract(response);
  if (extracted) return extracted;

  return { text: response };
}

// ─── Analyze Readiness ─────────────────────────────────────
export async function analyzeReadiness(
  readiness: ReadinessLog,
  calendarEventId: number,
  userId?: number,
): Promise<{ summary: string; modifications: unknown[] }> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const resolvedUserId = await getSoleUserId(userId);

  const [event] = await db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.id, calendarEventId), eq(calendarEvents.userId, resolvedUserId)));

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

  const systemPrompt = await buildSystemPrompt(resolvedUserId);
  const context = await buildContext("readiness", resolvedUserId);

  const prompt = `${systemPrompt}

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

  const response = await generateWithTimeout(model, prompt);

  try {
    const cleaned = stripJsonFences(response);
    return JSON.parse(cleaned);
  } catch {
    return { summary: response, modifications: [] };
  }
}

// ─── Onboarding Chat ───────────────────────────────────────
// List of onboarding topics the AI must cover
export const ONBOARDING_TOPICS = [
  "sport",          // Sport, pozycja, doświadczenie
  "goals",          // Cele treningowe/sezonowe
  "body",           // Wzrost, waga, wiek
  "injuries",       // Historia kontuzji
  "season",         // Sezon/off-season
  "availability",   // Dostępność + sprzęt
  "schedule",       // Stały grafik
] as const;

export type OnboardingTopic = typeof ONBOARDING_TOPICS[number];

const ONBOARDING_SYSTEM_PROMPT = `Jesteś osobistym trenerem sportowym, prowadzisz ONBOARDING nowego zawodnika.
Twoje zadanie: w naturalnej rozmowie zebrać informacje potrzebne do zbudowania planu treningowego.

ZASADY:
- Mów po polsku, przyjaźnie ale profesjonalnie
- Jedno pytanie na raz, nie przeciążaj
- Dostosowuj kolejne pytania do tego co użytkownik już powiedział
- Gdy użytkownik wspomni o kontuzji — dopytaj o szczegóły (kiedy, jak się to dzieje, jak zarządza)
- NIE pytaj o wszystko naraz — jedna wiadomość = jeden temat
- Jeśli pierwsza wiadomość — przedstaw się krótko i zadaj pierwsze pytanie o sport

TEMATY DO POKRYCIA (w takiej kolejności, ale adaptacyjnie):
1. sport — jaki sport, pozycja, jak długo trenuje, doświadczenie gym
2. goals — jakie cele na sezon/rok, co chce poprawić
3. body — wzrost, waga, wiek
4. injuries — historia kontuzji (ostatnie, przewlekłe)
5. season — kiedy sezon startuje, kiedy off-season
6. availability — ile dni/tydzień może trenować, jakie ma warunki (siłownia, basen, dom)
7. schedule — stały grafik (treningi drużynowe, regularne zajęcia)

Gdy pokryjesz WSZYSTKIE tematy, zakończ rozmowę podsumowaniem i ustaw "is_complete": true.`;

export async function chatOnboarding(
  userMessage: string | null, // null = start onboarding
  userId: number,
  coveredTopics: Record<string, boolean> = {},
): Promise<{
  text: string;
  extractedData?: {
    profile?: Partial<{
      sport: string;
      sportPosition: string;
      experienceYears: number;
      gymExperienceLevel: string;
      heightCm: number;
      weightKg: number;
      age: number;
      trainingDaysPerWeek: number;
      availableFacilities: string[];
      fixedWeeklySchedule: Array<{ day: string; time?: string; type?: string }>;
      additionalNotes: string;
    }>;
    user?: Partial<{
      bio: string;
      trainingGoal: string;
      seasonStart: string;
      seasonEnd: string;
      offSeasonStart: string;
      offSeasonEnd: string;
    }>;
    injuries?: Array<{
      bodyPart: string;
      injuryType?: string;
      severity?: string;
      description?: string;
      dateOccurred?: string;
      isActive?: boolean;
      managementNotes?: string;
    }>;
  };
  topicsCovered?: string[];
  isComplete?: boolean;
}> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  // For onboarding, only chat history matters
  const recentChat = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.contextType, "onboarding"))
    .orderBy(desc(chatMessages.createdAt))
    .limit(15);

  let chatHistory = "";
  if (recentChat.length > 0) {
    chatHistory = "\nHISTORIA ROZMOWY:\n";
    for (const m of [...recentChat].reverse()) {
      const label = m.role === "user" ? "Użytkownik" : "Trener";
      chatHistory += `[${label}]: ${m.content}\n`;
    }
  }

  const coveredList = Object.entries(coveredTopics)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(", ") || "(żadne)";
  const remainingList = ONBOARDING_TOPICS
    .filter((t) => !coveredTopics[t])
    .join(", ") || "(wszystkie pokryte)";

  const prompt = `${ONBOARDING_SYSTEM_PROMPT}

TEMATY POKRYTE: ${coveredList}
TEMATY POZOSTAŁE: ${remainingList}
${chatHistory}

${userMessage === null
  ? "To jest POCZĄTEK rozmowy — przedstaw się i zadaj pierwsze pytanie."
  : `Ostatnia wiadomość użytkownika: ${userMessage}`}

Odpowiedz WYŁĄCZNIE w formacie JSON:
{
  "text": "Twoja odpowiedź konwersacyjna po polsku",
  "extracted_data": {
    "profile": { /* pola athleteProfiles: sport, sportPosition, experienceYears, gymExperienceLevel, heightCm, weightKg, age, trainingDaysPerWeek, availableFacilities: string[], fixedWeeklySchedule: [{day, time, type}], additionalNotes */ },
    "user": { /* pola users: bio, trainingGoal, seasonStart (YYYY-MM-DD), seasonEnd, offSeasonStart, offSeasonEnd */ },
    "injuries": [ { "bodyPart": "...", "injuryType": "...", "severity": "...", "description": "...", "dateOccurred": "YYYY-MM-DD", "isActive": true, "managementNotes": "..." } ]
  },
  "topics_covered": ["sport", "goals", ...],
  "is_complete": false
}

Reguły:
- Wszystkie pola w "extracted_data" są OPCJONALNE — podawaj tylko to, co wyciągnąłeś z tej wiadomości
- "topics_covered" — lista tematów które ZOSTAŁY POKRYTE w tej wiadomości (z listy: ${ONBOARDING_TOPICS.join(", ")})
- "is_complete": true TYLKO gdy pokryto WSZYSTKIE tematy i użytkownik potwierdził podsumowanie
- Jeśli brak danych do wyciągnięcia, daj "extracted_data": {}`;

  const response = await generateWithTimeout(model, prompt);

  try {
    const cleaned = stripJsonFences(response);
    const parsed = JSON.parse(cleaned);
    return {
      text: parsed.text || response,
      extractedData: parsed.extracted_data,
      topicsCovered: parsed.topics_covered || [],
      isComplete: parsed.is_complete === true,
    };
  } catch {
    return { text: response };
  }
}

// ─── Post-workout Analysis ─────────────────────────────────
export async function analyzeWorkout(
  workoutLogId: number,
  userId?: number,
): Promise<{ feedback: string; injuryUpdate?: unknown }> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const resolvedUserId = await getSoleUserId(userId);

  const [workout] = await db
    .select()
    .from(workoutLogs)
    .where(and(eq(workoutLogs.id, workoutLogId), eq(workoutLogs.userId, resolvedUserId)));

  if (!workout) {
    return { feedback: "Nie znaleziono treningu." };
  }

  const systemPrompt = await buildSystemPrompt(resolvedUserId);
  const context = await buildContext("post_workout", resolvedUserId);

  const prompt = `${systemPrompt}

${context}

WŁAŚNIE ZAKOŃCZONY TRENING:
Data: ${workout.date}
Typ: ${workout.workoutType}
${workout.durationMinutes ? `Czas: ${workout.durationMinutes} min` : ""}
${workout.totalTonnage ? `Tonaż: ${workout.totalTonnage} kg` : ""}
${workout.distanceKm ? `Dystans: ${workout.distanceKm} km` : ""}
${workout.rpe ? `RPE: ${workout.rpe}/10` : ""}
${workout.avgHr ? `Średni puls: ${workout.avgHr}` : ""}
${workout.maxHr ? `Max puls: ${workout.maxHr}` : ""}
${workout.notes ? `Notatki: ${workout.notes}` : ""}

Zadanie: krótki feedback (max 3 zdania) + ewentualna kontuzja jeśli wspomniana w notatkach.
Format JSON:
{
  "feedback": "Krótki feedback po polsku + sugestia na najbliższe 24-48h",
  "injury_update": { "body_part": "...", "injury_type": "...", "severity": "...", "description": "...", "is_active": true } // pomiń jeśli brak
}`;

  const response = await generateWithTimeout(model, prompt);

  try {
    const cleaned = stripJsonFences(response);
    const parsed = JSON.parse(cleaned);
    return {
      feedback: parsed.feedback || response,
      injuryUpdate: parsed.injury_update,
    };
  } catch {
    return { feedback: response };
  }
}
