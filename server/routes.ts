import type { Express, Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import { db } from "./db";
import { eq, desc, and, gte, lte, sql, inArray, or } from "drizzle-orm";
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
  athleteProfiles,
  injuries,
} from "../shared/schema";
import type {
  InsertCalendarEvent,
  InsertWorkoutLog,
  InsertExerciseLog,
  InsertReadinessLog,
  InsertAthleteProfile,
  InsertInjury,
} from "../shared/schema";
import {
  analyzeReadiness,
  chatWithCoach,
  chatOnboarding,
  analyzeWorkout,
  ONBOARDING_TOPICS,
} from "./gemini";

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
    const { email, username, password } = req.body;
    if (!password) return res.status(400).json({ error: "Brak hasła" });

    let user: typeof users.$inferSelect | undefined;

    if (email) {
      // Email-based login
      const [found] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      user = found;
    } else if (username) {
      // Legacy username-based login (backward compat)
      const [found] = await db.select().from(users).where(eq(users.username, username)).limit(1);
      user = found;
    } else {
      // Single-user fallback (legacy)
      const [found] = await db.select().from(users).limit(1);
      user = found;
    }

    if (!user) return res.status(401).json({ error: "Nieprawidłowe dane logowania" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Nieprawidłowe dane logowania" });

    req.session.userId = user.id;
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      onboardingComplete: user.onboardingComplete,
    });
  });

  app.post("/api/register", async (req, res) => {
    const { email, username, password } = req.body;
    if (!email || !password || !username) {
      return res.status(400).json({ error: "Podaj email, username i hasło" });
    }

    // Check if email or username already taken
    const [existingEmail] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingEmail) return res.status(409).json({ error: "Email już zajęty" });

    const [existingUsername] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (existingUsername) return res.status(409).json({ error: "Nazwa użytkownika już zajęta" });

    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db
      .insert(users)
      .values({ email, username, passwordHash })
      .returning();

    req.session.userId = user.id;
    res.status(201).json({ id: user.id, username: user.username, email: user.email });
  });

  app.post("/api/logout", (req, res) => {
    req.session.destroy(() => res.status(204).end());
  });

  app.get("/api/me", requireAuth, async (req, res) => {
    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        trainingGoal: users.trainingGoal,
        seasonStart: users.seasonStart,
        seasonEnd: users.seasonEnd,
        offSeasonStart: users.offSeasonStart,
        offSeasonEnd: users.offSeasonEnd,
        onboardingComplete: users.onboardingComplete,
        onboardingProgress: users.onboardingProgress,
      })
      .from(users)
      .where(eq(users.id, req.session.userId!));
    if (!user) return res.status(401).json({ error: "Nie znaleziono" });
    res.json(user);
  });

  app.post("/api/settings", requireAuth, async (req, res) => {
    const {
      trainingGoal, seasonStart, seasonEnd, offSeasonStart, offSeasonEnd
    } = req.body;
    const userId = req.session.userId!;

    const [updated] = await db
      .update(users)
      .set({
        trainingGoal,
        seasonStart: seasonStart || null,
        seasonEnd: seasonEnd || null,
        offSeasonStart: offSeasonStart || null,
        offSeasonEnd: offSeasonEnd || null,
      })
      .where(eq(users.id, userId))
      .returning();

    // If bio was sent, save it to athleteProfiles
    if (req.body.bio !== undefined) {
      await upsertAthleteProfile(userId, { bio: req.body.bio });
    }

    res.json(updated);
  });

  // ─── Readiness / Samopoczucie ────────────────────────────
  app.get("/api/readiness/today", requireAuth, async (req, res) => {
    const today = todayInWarsaw();
    const userId = req.session.userId!;
    const [log] = await db
      .select()
      .from(readinessLogs)
      .where(and(eq(readinessLogs.date, today), eq(readinessLogs.userId, userId)))
      .limit(1);
    res.json(log || null);
  });

  app.post("/api/readiness", requireAuth, async (req, res) => {
    const today = todayInWarsaw();
    const userId = req.session.userId!;
    const { trainingReadiness, bodyBattery, sleepScore, hrvStatus, painLevel, stressLevel } = req.body;

    const [existing] = await db
      .select()
      .from(readinessLogs)
      .where(and(eq(readinessLogs.date, today), eq(readinessLogs.userId, userId)))
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
          userId,
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
  app.get("/api/plans/active", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const [plan] = await db
      .select()
      .from(trainingPlans)
      .where(and(eq(trainingPlans.isActive, true), eq(trainingPlans.userId, userId)))
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
    const userId = req.session.userId!;
    if (!from || !to) return res.status(400).json({ error: "Podaj from i to" });

    const events = await db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.userId, userId),
          gte(calendarEvents.date, from),
          lte(calendarEvents.date, to),
          sql`${calendarEvents.status} != 'cancelled'`
        ),
      )
      .orderBy(calendarEvents.date);
    res.json(events);
  });

  app.post("/api/calendar/events", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const data: InsertCalendarEvent = { ...req.body, userId };
    const [event] = await db
      .insert(calendarEvents)
      .values(data)
      .returning();
    res.status(201).json(event);
  });

  app.put("/api/calendar/events/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const userId = req.session.userId!;
    // Whitelist safe fields to update
    const { date, time, eventType, title, description, isRecurring, recurrenceRule,
      trainingDayId, workoutLogId, source, status, notes } = req.body;
    const updates: Record<string, unknown> = {};
    if (date !== undefined) updates.date = date;
    if (time !== undefined) updates.time = time;
    if (eventType !== undefined) updates.eventType = eventType;
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (isRecurring !== undefined) updates.isRecurring = isRecurring;
    if (recurrenceRule !== undefined) updates.recurrenceRule = recurrenceRule;
    if (trainingDayId !== undefined) updates.trainingDayId = trainingDayId;
    if (workoutLogId !== undefined) updates.workoutLogId = workoutLogId;
    if (source !== undefined) updates.source = source;
    if (status !== undefined) updates.status = status;
    if (notes !== undefined) updates.notes = notes;

    const [updated] = await db
      .update(calendarEvents)
      .set(updates)
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Nie znaleziono" });
    res.json(updated);
  });

  app.delete("/api/calendar/events/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const userId = req.session.userId!;
    await db.delete(calendarEvents).where(
      and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId))
    );
    res.status(204).end();
  });

  app.post("/api/calendar/apply-suggestion", requireAuth, async (req, res) => {
    const { changes } = req.body;
    const userId = req.session.userId!;
    if (!changes || !Array.isArray(changes)) {
      return res.status(400).json({ error: "Nieprawidłowy format zmian" });
    }

    try {
      for (const change of changes) {
        if (change.action === "cancel" && change.event_id) {
          await db
            .update(calendarEvents)
            .set({ status: "cancelled" })
            .where(and(eq(calendarEvents.id, change.event_id), eq(calendarEvents.userId, userId)));
        } else if (change.action === "add" && change.date) {
          await db.insert(calendarEvents).values({
            userId,
            date: change.date,
            time: change.time || null,
            eventType: change.event_type || "rest",
            title: change.title || "Dodane przez trenera",
            description: change.reason,
            source: "ai",
          });
        } else if (change.action === "modify" && change.event_id) {
          const updates: Record<string, unknown> = {};
          if (change.title) updates.title = change.title;
          if (change.event_type) updates.eventType = change.event_type;
          if (change.time !== undefined) updates.time = change.time;
          if (change.date) updates.date = change.date;
          if (Object.keys(updates).length > 0) {
            await db
              .update(calendarEvents)
              .set(updates)
              .where(and(eq(calendarEvents.id, change.event_id), eq(calendarEvents.userId, userId)));
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
  app.get("/api/today/event", requireAuth, async (req, res) => {
    const today = todayInWarsaw();
    const userId = req.session.userId!;
    const events = await db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.userId, userId),
          eq(calendarEvents.date, today),
          sql`${calendarEvents.status} != 'cancelled'`,
        ),
      );
    res.json(events);
  });

  app.get("/api/today/gym-plan/:eventId", requireAuth, async (req, res) => {
    const eventId = parseInt(req.params.eventId);
    const userId = req.session.userId!;
    const [event] = await db
      .select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.userId, userId)));

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
    const userId = req.session.userId!;
    const data: InsertReadinessLog = { ...req.body, userId };
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
    const userId = req.session.userId!;
    const { exerciseLogs: exLogs, eventNotes, ...workoutData } = req.body;
    const data: InsertWorkoutLog = { ...workoutData, userId };

    // Upsert: if a workout already exists for this calendar event, update it
    let workout: typeof workoutLogs.$inferSelect;
    if (data.calendarEventId) {
      const [existing] = await db
        .select()
        .from(workoutLogs)
        .where(and(
          eq(workoutLogs.calendarEventId, data.calendarEventId),
          eq(workoutLogs.userId, userId),
        ))
        .limit(1);

      if (existing) {
        const { calendarEventId, ...updateFields } = data;
        const [updated] = await db
          .update(workoutLogs)
          .set(updateFields)
          .where(eq(workoutLogs.id, existing.id))
          .returning();
        workout = updated;

        if (exLogs && Array.isArray(exLogs) && exLogs.length > 0) {
          await db.delete(exerciseLogs).where(eq(exerciseLogs.workoutLogId, workout.id));
          const logsToInsert: InsertExerciseLog[] = exLogs.map((ex: any) => ({
            ...ex,
            workoutLogId: workout.id,
          }));
          await db.insert(exerciseLogs).values(logsToInsert);
        }
      } else {
        const [inserted] = await db.insert(workoutLogs).values(data).returning();
        workout = inserted;

        if (exLogs && Array.isArray(exLogs) && exLogs.length > 0) {
          const logsToInsert: InsertExerciseLog[] = exLogs.map((ex: any) => ({
            ...ex,
            workoutLogId: workout.id,
          }));
          await db.insert(exerciseLogs).values(logsToInsert);
        }
      }
    } else {
      const [inserted] = await db.insert(workoutLogs).values(data).returning();
      workout = inserted;
    }

    // Recalculate tonnage for gym workouts
    if (exLogs && Array.isArray(exLogs) && exLogs.length > 0) {
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

    // Update calendar event status
    if (data.calendarEventId) {
      const eventUpdate: Record<string, any> = { status: "completed", workoutLogId: workout.id };
      if (eventNotes !== undefined) eventUpdate.notes = eventNotes;
      await db
        .update(calendarEvents)
        .set(eventUpdate)
        .where(and(eq(calendarEvents.id, data.calendarEventId), eq(calendarEvents.userId, userId)));
    }

    res.status(200).json(workout);
  });

  app.get("/api/workouts", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const type = req.query.type as string | undefined;
    const limit = parseInt((req.query.limit as string) || "20");

    const whereClause = type
      ? and(eq(workoutLogs.userId, userId), eq(workoutLogs.workoutType, type))
      : eq(workoutLogs.userId, userId);

    const workoutList = await db
      .select()
      .from(workoutLogs)
      .where(whereClause)
      .orderBy(desc(workoutLogs.date))
      .limit(limit);

    // Deduplicate by calendarEventId — keep the latest entry per event
    const seen = new Set<number>();
    const deduped = workoutList.filter((w: any) => {
      if (!w.calendarEventId) return true;
      if (seen.has(w.calendarEventId)) return false;
      seen.add(w.calendarEventId);
      return true;
    });

    res.json(deduped);
  });

  // One-time cleanup: delete duplicate workouts (keep latest per calendarEventId)
  app.delete("/api/workouts/cleanup-duplicates", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const all = await db
      .select()
      .from(workoutLogs)
      .where(eq(workoutLogs.userId, userId))
      .orderBy(desc(workoutLogs.id));

    const seen = new Map<number, number>();
    const toDelete: number[] = [];

    for (const w of all) {
      if (!w.calendarEventId) continue;
      if (!seen.has(w.calendarEventId)) {
        seen.set(w.calendarEventId, w.id);
      } else {
        toDelete.push(w.id);
      }
    }

    if (toDelete.length > 0) {
      await db.delete(workoutLogs).where(inArray(workoutLogs.id, toDelete));
    }

    res.json({ deleted: toDelete.length, ids: toDelete });
  });

  app.get("/api/workouts/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const userId = req.session.userId!;
    const [workout] = await db
      .select()
      .from(workoutLogs)
      .where(and(eq(workoutLogs.id, id), eq(workoutLogs.userId, userId)));
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
    const userId = req.session.userId!;
    const days = parseInt((req.query.days as string) || "30");
    const sinceDate = daysAgoInWarsaw(days);

    const logs = await db
      .select()
      .from(readinessLogs)
      .where(and(eq(readinessLogs.userId, userId), gte(readinessLogs.date, sinceDate)))
      .orderBy(readinessLogs.date);
    res.json(logs);
  });

  app.get("/api/dashboard/tonnage", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const weeks = parseInt((req.query.weeks as string) || "8");
    const sinceDate = daysAgoInWarsaw(weeks * 7);

    const workoutList = await db
      .select({
        date: workoutLogs.date,
        workoutType: workoutLogs.workoutType,
        totalTonnage: workoutLogs.totalTonnage,
        distanceKm: workoutLogs.distanceKm,
        durationMinutes: workoutLogs.durationMinutes,
      })
      .from(workoutLogs)
      .where(and(eq(workoutLogs.userId, userId), gte(workoutLogs.date, sinceDate)))
      .orderBy(workoutLogs.date);
    res.json(workoutList);
  });

  app.get("/api/dashboard/load", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const summaries = await db
      .select()
      .from(weeklySummaries)
      .where(eq(weeklySummaries.userId, userId))
      .orderBy(desc(weeklySummaries.weekStart))
      .limit(12);
    res.json(summaries);
  });

  // ─── Chat (AI Coach) ────────────────────────────────────
  app.get("/api/chat", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const limit = parseInt((req.query.limit as string) || "50");
    const messages = await db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.userId, userId), eq(chatMessages.contextType, "chat")))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);
    res.json(messages.reverse());
  });

  app.post("/api/chat", requireAuth, async (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: "Brak wiadomości" });
    const userId = req.session.userId!;

    // Save user message
    await db.insert(chatMessages).values({ userId, role: "user", content, contextType: "chat" });

    try {
      const response = await chatWithCoach(content, userId);

      // Auto-upsert injury if AI detected one
      if (response.injuryUpdate) {
        await upsertInjuryFromAi(userId, response.injuryUpdate, "chat");
      }

      const [saved] = await db
        .insert(chatMessages)
        .values({
          userId,
          role: "assistant",
          content: response.text,
          planSuggestion: response.planSuggestion || null,
          contextType: "chat",
          extractedData: response.injuryUpdate ? { injury: response.injuryUpdate } : null,
        })
        .returning();

      res.json(saved);
    } catch (err) {
      console.error("Chat error:", err);
      const [saved] = await db
        .insert(chatMessages)
        .values({
          userId,
          role: "assistant",
          content: "Przepraszam, wystąpił błąd podczas analizy. Spróbuj ponownie.",
          contextType: "chat",
        })
        .returning();
      res.json(saved);
    }
  });

  // ─── Athlete Profile ────────────────────────────────────
  app.get("/api/profile", requireAuth, async (req, res) => {
    const [profile] = await db
      .select()
      .from(athleteProfiles)
      .where(eq(athleteProfiles.userId, req.session.userId!))
      .limit(1);
    res.json(profile || null);
  });

  app.put("/api/profile", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const updated = await upsertAthleteProfile(userId, req.body);
    res.json(updated);
  });

  // ─── Injuries ───────────────────────────────────────────
  app.get("/api/injuries", requireAuth, async (req, res) => {
    const activeOnly = req.query.active === "true";
    const userId = req.session.userId!;
    let rows;
    if (activeOnly) {
      rows = await db
        .select()
        .from(injuries)
        .where(and(eq(injuries.userId, userId), eq(injuries.isActive, true)))
        .orderBy(desc(injuries.createdAt));
    } else {
      rows = await db
        .select()
        .from(injuries)
        .where(eq(injuries.userId, userId))
        .orderBy(desc(injuries.createdAt));
    }
    res.json(rows);
  });

  app.post("/api/injuries", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const data: InsertInjury = { ...req.body, userId, source: req.body.source || "manual" };
    const [inserted] = await db.insert(injuries).values(data).returning();
    res.status(201).json(inserted);
  });

  app.put("/api/injuries/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const [updated] = await db
      .update(injuries)
      .set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(injuries.id, id), eq(injuries.userId, req.session.userId!)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Nie znaleziono" });
    res.json(updated);
  });

  app.delete("/api/injuries/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    await db
      .delete(injuries)
      .where(and(eq(injuries.id, id), eq(injuries.userId, req.session.userId!)));
    res.status(204).end();
  });

  // ─── Onboarding ─────────────────────────────────────────
  app.get("/api/onboarding/messages", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const msgs = await db
      .select()
      .from(chatMessages)
      .where(and(
        eq(chatMessages.userId, userId),
        eq(chatMessages.contextType, "onboarding"),
      ))
      .orderBy(chatMessages.createdAt);
    res.json(msgs);
  });

  app.post("/api/onboarding/chat", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const { content } = req.body;

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user?.onboardingComplete) {
      return res.status(400).json({ error: "Onboarding już zakończony" });
    }

    // Save user message (unless this is the initial trigger with no content)
    if (content) {
      await db.insert(chatMessages).values({
        userId,
        role: "user",
        content,
        contextType: "onboarding",
      });
    }

    const coveredTopics = (user?.onboardingProgress as Record<string, boolean>) || {};

    try {
      const response = await chatOnboarding(content || null, userId, coveredTopics);

      // Apply extracted data
      if (response.extractedData) {
        const { profile, user: userUpdate, injuries: extractedInjuries } = response.extractedData;
        if (profile && Object.keys(profile).length > 0) {
          await upsertAthleteProfile(userId, profile);
        }
        if (userUpdate && Object.keys(userUpdate).length > 0) {
          const cleanedUpdate: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(userUpdate)) {
            cleanedUpdate[k] = v === "" ? null : v;
          }
          await db.update(users).set(cleanedUpdate).where(eq(users.id, userId));
        }
        if (Array.isArray(extractedInjuries) && extractedInjuries.length > 0) {
          for (const inj of extractedInjuries) {
            await upsertInjuryFromAi(userId, inj, "onboarding");
          }
        }
      }

      // Update topics covered
      const newCovered = { ...coveredTopics };
      for (const topic of response.topicsCovered || []) {
        if ((ONBOARDING_TOPICS as readonly string[]).includes(topic)) {
          newCovered[topic] = true;
        }
      }
      await db
        .update(users)
        .set({
          onboardingProgress: newCovered,
          ...(response.isComplete ? { onboardingComplete: true } : {}),
        })
        .where(eq(users.id, userId));

      const [saved] = await db
        .insert(chatMessages)
        .values({
          userId,
          role: "assistant",
          content: response.text,
          contextType: "onboarding",
          extractedData: response.extractedData || null,
        })
        .returning();

      res.json({
        message: saved,
        topicsCovered: newCovered,
        isComplete: response.isComplete === true,
      });
    } catch (err) {
      console.error("Onboarding chat error:", err);
      res.status(500).json({ error: "Błąd podczas rozmowy onboardingowej" });
    }
  });

  app.post("/api/onboarding/complete", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const [updated] = await db
      .update(users)
      .set({ onboardingComplete: true })
      .where(eq(users.id, userId))
      .returning();
    res.json({ onboardingComplete: updated?.onboardingComplete === true });
  });

  app.post("/api/onboarding/reset", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    await db
      .update(users)
      .set({ onboardingComplete: false, onboardingProgress: {} })
      .where(eq(users.id, userId));
    // Clear only this user's onboarding chat history
    await db.delete(chatMessages).where(
      and(eq(chatMessages.userId, userId), eq(chatMessages.contextType, "onboarding"))
    );
    res.json({ ok: true });
  });

  // ─── Post-Workout AI Analysis ───────────────────────────
  app.post("/api/workouts/:id/analyze", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const userId = req.session.userId!;

    const [workout] = await db
      .select()
      .from(workoutLogs)
      .where(and(eq(workoutLogs.id, id), eq(workoutLogs.userId, userId)));
    if (!workout) return res.status(404).json({ error: "Nie znaleziono treningu" });

    try {
      const analysis = await analyzeWorkout(id, userId);

      if (analysis.injuryUpdate) {
        await upsertInjuryFromAi(userId, analysis.injuryUpdate, "chat");
      }

      const [updated] = await db
        .update(workoutLogs)
        .set({ aiFeedback: analysis.feedback })
        .where(eq(workoutLogs.id, id))
        .returning();

      res.json({ workout: updated, analysis });
    } catch (err) {
      console.error("Workout analysis failed:", err);
      res.status(500).json({ error: "Błąd podczas analizy treningu" });
    }
  });

}

// ─── Helpers: upsert logic ─────────────────────────────────
async function upsertAthleteProfile(
  userId: number,
  patch: Partial<InsertAthleteProfile>,
): Promise<typeof athleteProfiles.$inferSelect> {
  const [existing] = await db
    .select()
    .from(athleteProfiles)
    .where(eq(athleteProfiles.userId, userId))
    .limit(1);

  // Strip undefined for cleaner diff
  const cleanPatch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) cleanPatch[k] = v;
  }

  if (existing) {
    const [updated] = await db
      .update(athleteProfiles)
      .set({ ...cleanPatch, updatedAt: new Date() })
      .where(eq(athleteProfiles.userId, userId))
      .returning();
    return updated;
  } else {
    const [inserted] = await db
      .insert(athleteProfiles)
      .values({ userId, ...cleanPatch } as InsertAthleteProfile)
      .returning();
    return inserted;
  }
}

async function upsertInjuryFromAi(
  userId: number,
  injuryData: unknown,
  source: "onboarding" | "chat" | "manual",
): Promise<void> {
  if (!injuryData || typeof injuryData !== "object") return;
  const data = injuryData as Record<string, unknown>;

  const bodyPart = (data.body_part || data.bodyPart) as string | undefined;
  if (!bodyPart) return;

  const record = {
    userId,
    bodyPart,
    injuryType: (data.injury_type || data.injuryType) as string | undefined,
    severity: data.severity as string | undefined,
    description: data.description as string | undefined,
    dateOccurred: (data.date_occurred || data.dateOccurred) as string | undefined,
    isActive: data.is_active !== undefined ? Boolean(data.is_active) : data.isActive !== undefined ? Boolean(data.isActive) : true,
    managementNotes: (data.management_notes || data.managementNotes) as string | undefined,
    source,
  };

  const [existing] = await db
    .select()
    .from(injuries)
    .where(
      and(
        eq(injuries.userId, userId),
        eq(injuries.bodyPart, bodyPart),
        eq(injuries.isActive, true),
      ),
    )
    .limit(1);

  if (existing) {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (record.injuryType) patch.injuryType = record.injuryType;
    if (record.severity) patch.severity = record.severity;
    if (record.description) patch.description = record.description;
    if (record.managementNotes) patch.managementNotes = record.managementNotes;
    if (record.isActive === false) patch.isActive = false;
    await db.update(injuries).set(patch).where(eq(injuries.id, existing.id));
  } else if (record.isActive !== false) {
    // Only insert new injury if it's active (skip inactive-from-start AI reports)
    await db.insert(injuries).values(record as InsertInjury);
  }
}
