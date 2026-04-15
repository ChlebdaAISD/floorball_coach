import type { Express, Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import { db } from "./db";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import {
  users,
  exercises,
  trainingPlans,
  trainingDays,
  plannedExercises,
  calendarEvents,
  readinessLogs,
  workoutLogs,
  exerciseLogs,
  chatMessages,
  weeklySummaries,
} from "../shared/schema";
import type {
  InsertCalendarEvent,
  InsertWorkoutLog,
  InsertExerciseLog,
  InsertReadinessLog,
} from "../shared/schema";
import { analyzeReadiness, chatWithCoach } from "./gemini";

/** Return today's date as YYYY-MM-DD in Europe/Warsaw timezone */
function todayInWarsaw(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" });
}

/** Return a date N days ago as YYYY-MM-DD in Europe/Warsaw timezone */
function daysAgoInWarsaw(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" });
}

// Extend express-session
declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Nie zalogowany" });
  }
  next();
}

export function registerRoutes(app: Express) {
  // ─── Auth ────────────────────────────────────────────────
  app.post("/api/login", async (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: "Brak hasła" });

    const [user] = await db.select().from(users).limit(1);
    if (!user) return res.status(401).json({ error: "Brak użytkownika" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Nieprawidłowe hasło" });

    req.session.userId = user.id;
    res.json({ id: user.id, username: user.username });
  });

  app.post("/api/logout", (req, res) => {
    req.session.destroy(() => res.status(204).end());
  });

  app.get("/api/me", requireAuth, async (req, res) => {
    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        bio: users.bio,
        trainingGoal: users.trainingGoal,
        seasonStart: users.seasonStart,
        seasonEnd: users.seasonEnd,
        offSeasonStart: users.offSeasonStart,
        offSeasonEnd: users.offSeasonEnd,
        interviewAnswers: users.interviewAnswers,
      })
      .from(users)
      .where(eq(users.id, req.session.userId!));
    if (!user) return res.status(401).json({ error: "Nie znaleziono" });
    res.json(user);
  });

  app.post("/api/settings", requireAuth, async (req, res) => {
    const {
      bio, trainingGoal, seasonStart, seasonEnd, offSeasonStart, offSeasonEnd, interviewAnswers
    } = req.body;

    const [updated] = await db
      .update(users)
      .set({
        bio,
        trainingGoal,
        seasonStart: seasonStart || null,
        seasonEnd: seasonEnd || null,
        offSeasonStart: offSeasonStart || null,
        offSeasonEnd: offSeasonEnd || null,
        interviewAnswers,
      })
      .where(eq(users.id, req.session.userId!))
      .returning();

    res.json(updated);
  });

  // ─── Readiness / Samopoczucie ────────────────────────────
  app.get("/api/readiness/today", requireAuth, async (req, res) => {
    const today = todayInWarsaw();
    const [log] = await db
      .select()
      .from(readinessLogs)
      .where(eq(readinessLogs.date, today))
      .limit(1);
    res.json(log || null);
  });

  app.post("/api/readiness", requireAuth, async (req, res) => {
    const today = todayInWarsaw();
    const { trainingReadiness, bodyBattery, sleepScore, hrvStatus, painLevel, stressLevel } = req.body;

    const [existing] = await db
      .select()
      .from(readinessLogs)
      .where(eq(readinessLogs.date, today))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(readinessLogs)
        .set({ trainingReadiness, bodyBattery, sleepScore, hrvStatus, painLevel, stressLevel })
        .where(eq(readinessLogs.id, existing.id))
        .returning();
      res.json(updated);
    } else {
      const [inserted] = await db
        .insert(readinessLogs)
        .values({
          date: today,
          trainingReadiness,
          bodyBattery,
          sleepScore,
          hrvStatus,
          painLevel,
          stressLevel,
        })
        .returning();
      res.json(inserted);
    }
  });

  // ─── Exercises ───────────────────────────────────────────
  app.get("/api/exercises", requireAuth, async (_req, res) => {
    const all = await db.select().from(exercises).orderBy(exercises.name);
    res.json(all);
  });

  // ─── Plans ───────────────────────────────────────────────
  app.get("/api/plans/active", requireAuth, async (_req, res) => {
    const [plan] = await db
      .select()
      .from(trainingPlans)
      .where(eq(trainingPlans.isActive, true))
      .limit(1);
    if (!plan) return res.json(null);

    const days = await db
      .select()
      .from(trainingDays)
      .where(eq(trainingDays.planId, plan.id));

    const daysWithExercises = await Promise.all(
      days.map(async (day) => {
        const exs = await db
          .select({
            id: plannedExercises.id,
            exerciseId: plannedExercises.exerciseId,
            exerciseName: exercises.name,
            orderIndex: plannedExercises.orderIndex,
            sets: plannedExercises.sets,
            reps: plannedExercises.reps,
            tempo: plannedExercises.tempo,
            restSeconds: plannedExercises.restSeconds,
            weightKg: plannedExercises.weightKg,
            notes: plannedExercises.notes,
          })
          .from(plannedExercises)
          .innerJoin(
            exercises,
            eq(plannedExercises.exerciseId, exercises.id),
          )
          .where(eq(plannedExercises.trainingDayId, day.id))
          .orderBy(plannedExercises.orderIndex);
        return { ...day, exercises: exs };
      }),
    );

    res.json({ ...plan, days: daysWithExercises });
  });

  app.put("/api/planned-exercises/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const { sets, reps, weightKg, notes } = req.body;
    const [updated] = await db
      .update(plannedExercises)
      .set({ sets, reps, weightKg, notes })
      .where(eq(plannedExercises.id, id))
      .returning();
    res.json(updated);
  });

  // ─── Calendar ────────────────────────────────────────────
  app.get("/api/calendar", requireAuth, async (req, res) => {
    const from = req.query.from as string;
    const to = req.query.to as string;
    if (!from || !to) return res.status(400).json({ error: "Podaj from i to" });

    const events = await db
      .select()
      .from(calendarEvents)
      .where(
        and(
          gte(calendarEvents.date, from),
          lte(calendarEvents.date, to),
          sql`${calendarEvents.status} != 'cancelled'`
        ),
      )
      .orderBy(calendarEvents.date);
    res.json(events);
  });

  app.post("/api/calendar/events", requireAuth, async (req, res) => {
    const data: InsertCalendarEvent = req.body;
    const [event] = await db
      .insert(calendarEvents)
      .values(data)
      .returning();
    res.status(201).json(event);
  });

  app.put("/api/calendar/events/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const [updated] = await db
      .update(calendarEvents)
      .set(req.body)
      .where(eq(calendarEvents.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Nie znaleziono" });
    res.json(updated);
  });

  app.delete("/api/calendar/events/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
    res.status(204).end();
  });

  app.post("/api/calendar/apply-suggestion", requireAuth, async (req, res) => {
    const { changes } = req.body;
    if (!changes || !Array.isArray(changes)) {
      return res.status(400).json({ error: "Nieprawidłowy format zmian" });
    }

    try {
      for (const change of changes) {
        if (change.action === "cancel" && change.event_id) {
          await db
            .update(calendarEvents)
            .set({ status: "cancelled" })
            .where(eq(calendarEvents.id, change.event_id));
        } else if (change.action === "add" && change.date) {
          await db.insert(calendarEvents).values({
            date: change.date,
            time: change.time || null,
            eventType: change.event_type || "rest",
            title: change.title || "Dodane przez trenera",
            description: change.reason,
            source: "ai",
          });
        } else if (change.action === "modify" && change.event_id) {
          const updates: Record<string, any> = {};
          if (change.title) updates.title = change.title;
          if (change.event_type) updates.eventType = change.event_type;
          if (change.time !== undefined) updates.time = change.time;
          if (change.date) updates.date = change.date;
          if (Object.keys(updates).length > 0) {
            await db
              .update(calendarEvents)
              .set(updates)
              .where(eq(calendarEvents.id, change.event_id));
          }
        }
      }
      res.json({ success: true });
    } catch (err) {
      console.error("Failed to apply suggestion:", err);
      res.status(500).json({ error: "Błąd podczas wprowadzania zmian" });
    }
  });

  // ─── Today ───────────────────────────────────────────────
  app.get("/api/today/event", requireAuth, async (_req, res) => {
    const today = todayInWarsaw();
    const events = await db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.date, today),
          sql`${calendarEvents.status} != 'cancelled'`,
        ),
      );
    res.json(events);
  });

  app.get("/api/today/gym-plan/:eventId", requireAuth, async (req, res) => {
    const eventId = parseInt(req.params.eventId);
    const [event] = await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.id, eventId));

    if (!event || !event.trainingDayId) {
      return res.status(404).json({ error: "Brak planu" });
    }

    const [day] = await db
      .select()
      .from(trainingDays)
      .where(eq(trainingDays.id, event.trainingDayId));

    const exs = await db
      .select({
        id: plannedExercises.id,
        exerciseId: plannedExercises.exerciseId,
        exerciseName: exercises.name,
        category: exercises.category,
        isUnilateral: exercises.isUnilateral,
        injuryNotes: exercises.injuryNotes,
        orderIndex: plannedExercises.orderIndex,
        sets: plannedExercises.sets,
        reps: plannedExercises.reps,
        tempo: plannedExercises.tempo,
        restSeconds: plannedExercises.restSeconds,
        weightKg: plannedExercises.weightKg,
        notes: plannedExercises.notes,
      })
      .from(plannedExercises)
      .innerJoin(exercises, eq(plannedExercises.exerciseId, exercises.id))
      .where(eq(plannedExercises.trainingDayId, event.trainingDayId))
      .orderBy(plannedExercises.orderIndex);

    res.json({ event, day, exercises: exs });
  });

  app.post("/api/today/readiness", requireAuth, async (req, res) => {
    const data: InsertReadinessLog = req.body;
    const [log] = await db.insert(readinessLogs).values(data).returning();

    // If there's a gym event today, analyze with AI
    if (req.body.calendarEventId) {
      try {
        const analysis = await analyzeReadiness(log, req.body.calendarEventId);
        const [updated] = await db
          .update(readinessLogs)
          .set({ aiSummary: analysis.summary })
          .where(eq(readinessLogs.id, log.id))
          .returning();
        res.json({ readiness: updated, aiAnalysis: analysis });
      } catch (err) {
        console.error("AI analysis failed:", err);
        res.json({ readiness: log, aiAnalysis: null });
      }
    } else {
      res.json({ readiness: log, aiAnalysis: null });
    }
  });

  // ─── Workouts ────────────────────────────────────────────
  app.post("/api/workouts", requireAuth, async (req, res) => {
    const { exerciseLogs: exLogs, eventNotes, ...workoutData } = req.body;
    const data: InsertWorkoutLog = workoutData;

    const [workout] = await db.insert(workoutLogs).values(data).returning();

    // Save exercise logs for gym workouts
    if (exLogs && Array.isArray(exLogs) && exLogs.length > 0) {
      const logsToInsert: InsertExerciseLog[] = exLogs.map((ex: any) => ({
        ...ex,
        workoutLogId: workout.id,
      }));
      await db.insert(exerciseLogs).values(logsToInsert);

      // Calculate tonnage
      let tonnage = 0;
      for (const ex of exLogs) {
        if (ex.completed && ex.plannedWeight && ex.plannedSets && ex.plannedReps) {
          tonnage += ex.plannedWeight * ex.plannedSets * ex.plannedReps;
        }
      }
      if (tonnage > 0) {
        await db
          .update(workoutLogs)
          .set({ totalTonnage: tonnage })
          .where(eq(workoutLogs.id, workout.id));
      }
    }

    // Update calendar event status (and optional notes from client)
    if (data.calendarEventId) {
      const eventUpdate: Record<string, any> = { status: "completed", workoutLogId: workout.id };
      if (eventNotes !== undefined) eventUpdate.notes = eventNotes;
      await db
        .update(calendarEvents)
        .set(eventUpdate)
        .where(eq(calendarEvents.id, data.calendarEventId));
    }

    res.status(201).json(workout);
  });

  app.get("/api/workouts", requireAuth, async (req, res) => {
    const type = req.query.type as string | undefined;
    const limit = parseInt((req.query.limit as string) || "20");

    let query = db
      .select()
      .from(workoutLogs)
      .orderBy(desc(workoutLogs.date))
      .limit(limit);

    if (type) {
      query = query.where(eq(workoutLogs.workoutType, type)) as typeof query;
    }

    const workouts = await query;
    res.json(workouts);
  });

  app.get("/api/workouts/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const [workout] = await db
      .select()
      .from(workoutLogs)
      .where(eq(workoutLogs.id, id));
    if (!workout) return res.status(404).json({ error: "Nie znaleziono" });

    const exLogs = await db
      .select({
        id: exerciseLogs.id,
        exerciseId: exerciseLogs.exerciseId,
        exerciseName: exercises.name,
        completed: exerciseLogs.completed,
        plannedSets: exerciseLogs.plannedSets,
        plannedReps: exerciseLogs.plannedReps,
        plannedWeight: exerciseLogs.plannedWeight,
        actualNotes: exerciseLogs.actualNotes,
        wasModifiedByAi: exerciseLogs.wasModifiedByAi,
        modificationReason: exerciseLogs.modificationReason,
        orderIndex: exerciseLogs.orderIndex,
      })
      .from(exerciseLogs)
      .innerJoin(exercises, eq(exerciseLogs.exerciseId, exercises.id))
      .where(eq(exerciseLogs.workoutLogId, id))
      .orderBy(exerciseLogs.orderIndex);

    res.json({ ...workout, exerciseLogs: exLogs });
  });

  // ─── Dashboard ───────────────────────────────────────────
  app.get("/api/dashboard/readiness", requireAuth, async (req, res) => {
    const days = parseInt((req.query.days as string) || "30");
    const sinceDate = daysAgoInWarsaw(days);

    const logs = await db
      .select()
      .from(readinessLogs)
      .where(gte(readinessLogs.date, sinceDate))
      .orderBy(readinessLogs.date);
    res.json(logs);
  });

  app.get("/api/dashboard/tonnage", requireAuth, async (req, res) => {
    const weeks = parseInt((req.query.weeks as string) || "8");
    const sinceDate = daysAgoInWarsaw(weeks * 7);

    const workouts = await db
      .select({
        date: workoutLogs.date,
        workoutType: workoutLogs.workoutType,
        totalTonnage: workoutLogs.totalTonnage,
        distanceKm: workoutLogs.distanceKm,
        durationMinutes: workoutLogs.durationMinutes,
      })
      .from(workoutLogs)
      .where(gte(workoutLogs.date, sinceDate))
      .orderBy(workoutLogs.date);
    res.json(workouts);
  });

  app.get("/api/dashboard/load", requireAuth, async (req, res) => {
    const summaries = await db
      .select()
      .from(weeklySummaries)
      .orderBy(desc(weeklySummaries.weekStart))
      .limit(12);
    res.json(summaries);
  });

  // ─── Chat (AI Coach) ────────────────────────────────────
  app.get("/api/chat", requireAuth, async (req, res) => {
    const limit = parseInt((req.query.limit as string) || "50");
    const messages = await db
      .select()
      .from(chatMessages)
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);
    res.json(messages.reverse());
  });

  app.post("/api/chat", requireAuth, async (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: "Brak wiadomości" });

    // Save user message
    await db.insert(chatMessages).values({ role: "user", content });

    try {
      const response = await chatWithCoach(content);

      // Save assistant message with planSuggestion
      const [saved] = await db
        .insert(chatMessages)
        .values({
          role: "assistant",
          content: response.text,
          planSuggestion: response.planSuggestion || null,
        })
        .returning();

      res.json(saved);
    } catch (err) {
      console.error("Chat error:", err);
      const [saved] = await db
        .insert(chatMessages)
        .values({
          role: "assistant",
          content: "Przepraszam, wystąpił błąd podczas analizy. Spróbuj ponownie.",
        })
        .returning();
      res.json(saved);
    }
  });


}
