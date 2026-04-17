import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  date,
  real,
  jsonb,
  varchar,
  json,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── 0. Session (connect-pg-simple) ─────────────────────────
// Managed by connect-pg-simple library — must match its expected schema exactly
// to avoid destructive migrations (varchar/json/timestamp(6)).
export const session = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
});

// ─── 1. Users ───────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").unique(), // nullable for backward compat with existing accounts
  passwordHash: text("password_hash").notNull(),
  trainingGoal: text("training_goal"),
  seasonStart: date("season_start"),
  seasonEnd: date("season_end"),
  offSeasonStart: date("off_season_start"),
  offSeasonEnd: date("off_season_end"),
  onboardingComplete: boolean("onboarding_complete").notNull().default(false),
  onboardingProgress: jsonb("onboarding_progress"), // {"sport":true,"goals":true,"body":false,...}
  emailNudges: boolean("email_nudges").notNull().default(true),
  timezone: text("timezone").notNull().default("Europe/Warsaw"),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });

// ─── 2. Exercises ───────────────────────────────────────────
export const exercises = pgTable("exercises", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(), // compound | isolation | mobility | isometric
  muscleGroups: text("muscle_groups")
    .array()
    .notNull()
    .default([]),
  isUnilateral: boolean("is_unilateral").notNull().default(false),
  injuryNotes: text("injury_notes"),
  defaultSets: integer("default_sets"),
  defaultReps: integer("default_reps"),
  defaultTempo: text("default_tempo"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertExerciseSchema = createInsertSchema(exercises).omit({
  id: true,
  createdAt: true,
});

// ─── 3. Training Plans ─────────────────────────────────────
export const trainingPlans = pgTable(
  "training_plans",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phase: text("phase").notNull(), // phase_0 | phase_1 | phase_2 | in_season
    description: text("description"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    isActive: boolean("is_active").notNull().default(false),
  },
  (t) => ({
    userActiveIdx: index("training_plans_user_active_idx").on(t.userId, t.isActive),
  }),
);

export const insertTrainingPlanSchema = createInsertSchema(trainingPlans).omit({
  id: true,
});

// ─── 4. Training Days ──────────────────────────────────────
export const trainingDays = pgTable("training_days", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id")
    .notNull()
    .references(() => trainingPlans.id, { onDelete: "cascade" }),
  dayLabel: text("day_label").notNull(), // A | B | C | Recovery
  name: text("name").notNull(),
  notes: text("notes"),
});

export const insertTrainingDaySchema = createInsertSchema(trainingDays).omit({
  id: true,
});

// ─── 5. Planned Exercises ──────────────────────────────────
export const plannedExercises = pgTable(
  "planned_exercises",
  {
    id: serial("id").primaryKey(),
    trainingDayId: integer("training_day_id")
      .notNull()
      .references(() => trainingDays.id, { onDelete: "cascade" }),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    sets: integer("sets").notNull(),
    reps: integer("reps").notNull(),
    tempo: text("tempo"),
    restSeconds: integer("rest_seconds"),
    weightKg: real("weight_kg"),
    notes: text("notes"),
  },
  (t) => ({
    dayOrderIdx: index("planned_exercises_day_order_idx").on(t.trainingDayId, t.orderIndex),
  }),
);

export const insertPlannedExerciseSchema = createInsertSchema(
  plannedExercises,
).omit({ id: true });

// ─── 6. Calendar Events ────────────────────────────────────
export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    time: text("time"), // "20:00"
    eventType: text("event_type").notNull(), // gym | floorball_training | floorball_match | running | rest | other
    title: text("title").notNull(),
    description: text("description"),
    isRecurring: boolean("is_recurring").notNull().default(false),
    recurrenceRule: text("recurrence_rule"), // "weekly:tue,thu"
    trainingDayId: integer("training_day_id").references(() => trainingDays.id),
    source: text("source").notNull().default("manual"), // manual | ai | recurring
    status: text("status").notNull().default("planned"), // planned | completed | skipped | cancelled
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userDateIdx: index("calendar_events_user_date_idx").on(t.userId, t.date),
  }),
);

export const insertCalendarEventSchema = createInsertSchema(
  calendarEvents,
).omit({ id: true, createdAt: true });

// ─── 7. Readiness Logs ─────────────────────────────────────
export const readinessLogs = pgTable(
  "readiness_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    trainingReadiness: integer("training_readiness"), // 0-100
    bodyBattery: integer("body_battery"), // 0-100
    sleepScore: integer("sleep_score"), // 0-100
    hrvStatus: text("hrv_status"), // low | balanced | high
    painLevel: integer("pain_level"), // 1-10
    stressLevel: integer("stress_level"), // 1-10
    aiSummary: text("ai_summary"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  // UNIQUE (userId, date) enforces one readiness entry per user per day
  // and doubles as the covering index for all per-user date lookups.
  (t) => ({
    userDateUnique: uniqueIndex("readiness_logs_user_date_unique").on(t.userId, t.date),
  }),
);

export const insertReadinessLogSchema = createInsertSchema(readinessLogs).omit({
  id: true,
  createdAt: true,
});

// ─── 8. Workout Logs ───────────────────────────────────────
export const workoutLogs = pgTable(
  "workout_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    workoutType: text("workout_type").notNull(), // gym | floorball | running
    calendarEventId: integer("calendar_event_id").references(
      () => calendarEvents.id,
    ),
    readinessLogId: integer("readiness_log_id").references(
      () => readinessLogs.id,
    ),
    // Common
    durationMinutes: integer("duration_minutes"),
    avgHr: integer("avg_hr"),
    maxHr: integer("max_hr"),
    rpe: integer("rpe"), // 1-10
    // Gym
    totalTonnage: real("total_tonnage"),
    // Floorball
    floorballType: text("floorball_type"), // training | match
    distanceKm: real("distance_km"),
    hrZoneDistribution: jsonb("hr_zone_distribution"), // { zone1: 10, zone2: 25, zone3: 30, zone4: 25, zone5: 10 }
    // Running
    avgPace: text("avg_pace"), // "5:30"
    cadence: integer("cadence"),
    trainingEffectAerobic: real("training_effect_aerobic"), // 0-5
    trainingEffectAnaerobic: real("training_effect_anaerobic"), // 0-5
    // Meta
    notes: text("notes"),
    aiFeedback: text("ai_feedback"), // Post-workout AI analysis
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userDateIdx: index("workout_logs_user_date_idx").on(t.userId, t.date),
  }),
);

export const insertWorkoutLogSchema = createInsertSchema(workoutLogs).omit({
  id: true,
  createdAt: true,
});

// ─── 9. Exercise Logs ──────────────────────────────────────
export const exerciseLogs = pgTable("exercise_logs", {
  id: serial("id").primaryKey(),
  workoutLogId: integer("workout_log_id")
    .notNull()
    .references(() => workoutLogs.id, { onDelete: "cascade" }),
  exerciseId: integer("exercise_id")
    .notNull()
    .references(() => exercises.id, { onDelete: "cascade" }),
  completed: boolean("completed").notNull().default(false),
  plannedSets: integer("planned_sets"),
  plannedReps: integer("planned_reps"),
  plannedWeight: real("planned_weight"),
  actualNotes: text("actual_notes"),
  wasModifiedByAi: boolean("was_modified_by_ai").notNull().default(false),
  modificationReason: text("modification_reason"),
  orderIndex: integer("order_index").notNull().default(0),
});

export const insertExerciseLogSchema = createInsertSchema(exerciseLogs).omit({
  id: true,
});

// ─── 10. Chat Messages ─────────────────────────────────────
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant
    content: text("content").notNull(),
    planSuggestion: jsonb("plan_suggestion"),
    suggestionStatus: text("suggestion_status"), // null | accepted | rejected (only when planSuggestion is set)
    contextType: text("context_type").notNull().default("chat"), // chat | onboarding | readiness | weekly_planning
    extractedData: jsonb("extracted_data"), // Structured data AI extracted from this message
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userContextCreatedIdx: index("chat_messages_user_context_created_idx").on(
      t.userId,
      t.contextType,
      t.createdAt,
    ),
  }),
);

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
});

// ─── 11. Athlete Profiles ──────────────────────────────────
export const athleteProfiles = pgTable("athlete_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  sport: text("sport"), // "unihokej", "pływanie", etc.
  sportPosition: text("sport_position"), // "napastnik", "obrońca"
  experienceYears: integer("experience_years"),
  gymExperienceLevel: text("gym_experience_level"), // beginner | intermediate | advanced
  heightCm: integer("height_cm"),
  weightKg: real("weight_kg"),
  age: integer("age"),
  trainingDaysPerWeek: integer("training_days_per_week"),
  availableFacilities: jsonb("available_facilities"), // ["gym", "pool", "home", "outdoor"]
  fixedWeeklySchedule: jsonb("fixed_weekly_schedule"), // [{"day":"tuesday","time":"20:00","type":"team_practice"}]
  bio: text("bio"), // Przeniesione z users.bio
  additionalNotes: text("additional_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAthleteProfileSchema = createInsertSchema(athleteProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ─── 12. Injuries ──────────────────────────────────────────
export const injuries = pgTable(
  "injuries",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bodyPart: text("body_part").notNull(), // "kolano_lewe", "hamstring_prawy"
    injuryType: text("injury_type"), // "naderwanie", "naciągnięcie", "przewlekły_ból"
    severity: text("severity"), // "lekka" | "średnia" | "poważna"
    description: text("description"),
    dateOccurred: date("date_occurred"),
    dateResolved: date("date_resolved"),
    isActive: boolean("is_active").notNull().default(true),
    managementNotes: text("management_notes"),
    source: text("source").notNull().default("manual"), // onboarding | chat | manual
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    userActiveIdx: index("injuries_user_active_idx").on(t.userId, t.isActive),
  }),
);

export const insertInjurySchema = createInsertSchema(injuries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ─── 13. AI Insights ───────────────────────────────────────
export const aiInsights = pgTable(
  "ai_insights",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // high_load | readiness_drop | injury_caution | missed_workout | consecutive_hard_days
    dedupKey: text("dedup_key").notNull(), // kind + relevant date, e.g. "high_load:2026-04-17"
    headline: text("headline").notNull(),
    body: text("body").notNull(),
    actionKind: text("action_kind"), // add_rest_day | ease_today | swap_exercises | log_workout | skip_workout | schedule_recovery
    actionLabel: text("action_label"),
    actionPayload: jsonb("action_payload"),
    generatedAt: timestamp("generated_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    dismissedAt: timestamp("dismissed_at"),
    acceptedAt: timestamp("accepted_at"),
  },
  (t) => ({
    userExpiresIdx: index("ai_insights_user_expires_idx").on(t.userId, t.expiresAt),
  }),
);

export const insertAiInsightSchema = createInsertSchema(aiInsights).omit({
  id: true,
  generatedAt: true,
});

// ─── 14. Email Sends ───────────────────────────────────────
export const emailSends = pgTable(
  "email_sends",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // morning_readiness | post_workout
    dedupKey: text("dedup_key").notNull(), // kind + date/event, e.g. "morning_readiness:2026-04-17" or "post_workout:event:42"
    sentAt: timestamp("sent_at").notNull().defaultNow(),
  },
  // UNIQUE (userId, dedupKey) enforces idempotent sends — a duplicate
  // insert will throw instead of double-sending the email.
  (t) => ({
    userDedupUnique: uniqueIndex("email_sends_user_dedup_unique").on(
      t.userId,
      t.dedupKey,
    ),
  }),
);

export const insertEmailSendSchema = createInsertSchema(emailSends).omit({
  id: true,
  sentAt: true,
});

// ─── Type Exports ──────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type Exercise = typeof exercises.$inferSelect;
export type TrainingPlan = typeof trainingPlans.$inferSelect;
export type TrainingDay = typeof trainingDays.$inferSelect;
export type PlannedExercise = typeof plannedExercises.$inferSelect;
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type ReadinessLog = typeof readinessLogs.$inferSelect;
export type WorkoutLog = typeof workoutLogs.$inferSelect;
export type ExerciseLog = typeof exerciseLogs.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type AthleteProfile = typeof athleteProfiles.$inferSelect;
export type Injury = typeof injuries.$inferSelect;
export type AiInsight = typeof aiInsights.$inferSelect;
export type EmailSend = typeof emailSends.$inferSelect;

export type InsertExercise = z.infer<typeof insertExerciseSchema>;
export type InsertTrainingPlan = z.infer<typeof insertTrainingPlanSchema>;
export type InsertTrainingDay = z.infer<typeof insertTrainingDaySchema>;
export type InsertPlannedExercise = z.infer<typeof insertPlannedExerciseSchema>;
export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;
export type InsertReadinessLog = z.infer<typeof insertReadinessLogSchema>;
export type InsertWorkoutLog = z.infer<typeof insertWorkoutLogSchema>;
export type InsertExerciseLog = z.infer<typeof insertExerciseLogSchema>;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type InsertAthleteProfile = z.infer<typeof insertAthleteProfileSchema>;
export type InsertInjury = z.infer<typeof insertInjurySchema>;
export type InsertAiInsight = z.infer<typeof insertAiInsightSchema>;
export type InsertEmailSend = z.infer<typeof insertEmailSendSchema>;
