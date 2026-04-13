import bcrypt from "bcrypt";
import { db, pool } from "./db";
import {
  users,
  exercises,
  trainingPlans,
  trainingDays,
  plannedExercises,
  calendarEvents,
} from "../shared/schema";

async function seed() {
  console.log("Seeding database...");

  // ─── User ────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(
    process.env.ADMIN_PASSWORD || "trening123",
    10,
  );
  const [user] = await db
    .insert(users)
    .values({ username: "lukasz", passwordHash })
    .onConflictDoNothing()
    .returning();
  console.log("User:", user?.username || "already exists");

  // ─── Exercises ───────────────────────────────────────────
  const exerciseData = [
    // Posterior chain / legs
    { name: "Rumuński Martwy Ciąg (RDL)", category: "compound", muscleGroups: ["hamstringi", "pośladki", "plecy dolne"], defaultSets: 3, defaultReps: 8, defaultTempo: "3-1-1-0", injuryNotes: "Wolna faza ekscentryczna. Przy bólu hamstringów >6 zmniejsz ciężar o 30%." },
    { name: "Przysiady Bułgarskie", category: "compound", muscleGroups: ["czworogłowy", "pośladki"], isUnilateral: true, defaultSets: 3, defaultReps: 8, injuryNotes: "Unikaj przy bólu kolana >6. Zamień na izometryczny wall sit." },
    { name: "Wznosy na łydki (ekscentryczne)", category: "isolation", muscleGroups: ["łydki"], defaultSets: 3, defaultReps: 12, defaultTempo: "1-0-3-0", injuryNotes: "Nacisk na fazę opuszczania. Przy spięciu łydek — pomiń." },
    { name: "Deska Kopenhaska", category: "isometric", muscleGroups: ["przywodziciele", "core"], isUnilateral: true, defaultSets: 3, defaultReps: 1, injuryNotes: "Start od 15s, progresja do 30s. Kluczowe dla MCL." },
    { name: "Zakroki (Lunges)", category: "compound", muscleGroups: ["czworogłowy", "pośladki", "hamstringi"], isUnilateral: true, defaultSets: 3, defaultReps: 10, injuryNotes: "Przy bólu kolana zamień na step-up." },
    { name: "Uginanie nóg leżąc (hamstringi)", category: "isolation", muscleGroups: ["hamstringi"], defaultSets: 3, defaultReps: 10, defaultTempo: "2-1-2-0", injuryNotes: "Kluczowe dla prewencji naderwań." },
    { name: "Hip Thrust", category: "compound", muscleGroups: ["pośladki", "hamstringi"], defaultSets: 3, defaultReps: 10, injuryNotes: "Aktywacja pośladków — kompensacja pracy siedzącej." },
    { name: "Wall Sit (izometria)", category: "isometric", muscleGroups: ["czworogłowy"], defaultSets: 3, defaultReps: 1, injuryNotes: "Zamiennik przysiadów przy bólu kolana. 30-45s hold." },
    // Upper body
    { name: "Wiosłowanie hantlem jednorącz", category: "compound", muscleGroups: ["plecy", "biceps"], isUnilateral: true, defaultSets: 3, defaultReps: 10 },
    { name: "Wyciskanie na ławce skośnej", category: "compound", muscleGroups: ["klatka", "triceps", "barki"], defaultSets: 3, defaultReps: 8 },
    { name: "Pompki", category: "compound", muscleGroups: ["klatka", "triceps", "core"], defaultSets: 3, defaultReps: 12 },
    { name: "OHP (Wyciskanie nad głowę)", category: "compound", muscleGroups: ["barki", "triceps"], defaultSets: 3, defaultReps: 8 },
    { name: "Face Pulls", category: "isolation", muscleGroups: ["plecy górne", "rotatory zewnętrzne"], defaultSets: 3, defaultReps: 15, injuryNotes: "Kompensacja asymetrii z unihokeja." },
    // Core / anti-rotation
    { name: "Pallof Press", category: "isometric", muscleGroups: ["core", "skośne"], defaultSets: 3, defaultReps: 10, injuryNotes: "Antyrotacja — kluczowe dla unihokeja." },
    { name: "Spacer Farmera jednorącz", category: "compound", muscleGroups: ["core", "przedramiona", "barki"], isUnilateral: true, defaultSets: 3, defaultReps: 1, injuryNotes: "Anty-zgięcie boczne. 30m na stronę." },
    { name: "Martwy Robak (Dead Bug)", category: "mobility", muscleGroups: ["core", "zginacze bioder"], defaultSets: 3, defaultReps: 10, injuryNotes: "Aktywacja głębokiego core. Ważne po pracy siedzącej." },
    { name: "Plank (deska)", category: "isometric", muscleGroups: ["core"], defaultSets: 3, defaultReps: 1, injuryNotes: "30-60s. Fundament stabilizacji." },
    { name: "Bird Dog", category: "mobility", muscleGroups: ["core", "plecy dolne", "pośladki"], defaultSets: 3, defaultReps: 10, injuryNotes: "Stabilizacja lędźwiowa." },
    // Mobility / warmup
    { name: "Rozciąganie zginaczy bioder", category: "mobility", muscleGroups: ["zginacze bioder"], defaultSets: 2, defaultReps: 1, injuryNotes: "Skrócone od siedzenia. Minimum 30s na stronę." },
    { name: "Aktywacja pośladków z gumą", category: "mobility", muscleGroups: ["pośladki"], defaultSets: 2, defaultReps: 15, injuryNotes: "Rozgrzewka przed każdym treningiem nóg." },
  ];

  const insertedExercises = await db
    .insert(exercises)
    .values(exerciseData.map((e) => ({
      ...e,
      muscleGroups: e.muscleGroups,
      isUnilateral: e.isUnilateral ?? false,
    })))
    .onConflictDoNothing()
    .returning();
  console.log(`Exercises: ${insertedExercises.length} inserted`);

  // Map exercise names to IDs
  const allExercises = await db.select().from(exercises);
  const exMap = new Map(allExercises.map((e) => [e.name, e.id]));

  // ─── Training Plan ───────────────────────────────────────
  const [plan] = await db
    .insert(trainingPlans)
    .values({
      name: "Off-Season: Odbudowa i Kuloodporność",
      phase: "phase_1",
      description: "2-miesięczny blok przygotowawczy. Praca ekscentryczna, ćwiczenia jednostronne, stabilizacja kolana.",
      isActive: true,
    })
    .returning();
  console.log("Plan:", plan.name);

  // ─── Training Days ───────────────────────────────────────
  const [dayA] = await db
    .insert(trainingDays)
    .values({
      planId: plan.id,
      dayLabel: "A",
      name: "Nogi i łańcuch tylny",
      notes: "Nacisk na ekscentrykę i stabilizację kolan",
    })
    .returning();

  const [dayB] = await db
    .insert(trainingDays)
    .values({
      planId: plan.id,
      dayLabel: "B",
      name: "Góra ciała i core",
      notes: "Siła góry, antyrotacja, kompensacja asymetrii",
    })
    .returning();

  const [dayC] = await db
    .insert(trainingDays)
    .values({
      planId: plan.id,
      dayLabel: "C",
      name: "Hybryda — praca jednostronna",
      notes: "Praca jednostronna, wytrzymałość, mobilność",
    })
    .returning();

  console.log("Training days: A, B, C created");

  // ─── Planned Exercises ───────────────────────────────────
  const dayAExercises = [
    { exerciseName: "Aktywacja pośladków z gumą", sets: 2, reps: 15, orderIndex: 0 },
    { exerciseName: "Rozciąganie zginaczy bioder", sets: 2, reps: 1, orderIndex: 1 },
    { exerciseName: "Rumuński Martwy Ciąg (RDL)", sets: 3, reps: 8, weightKg: 50, tempo: "3-1-1-0", restSeconds: 120, orderIndex: 2 },
    { exerciseName: "Przysiady Bułgarskie", sets: 3, reps: 8, weightKg: 20, restSeconds: 90, orderIndex: 3 },
    { exerciseName: "Uginanie nóg leżąc (hamstringi)", sets: 3, reps: 10, weightKg: 30, tempo: "2-1-2-0", restSeconds: 60, orderIndex: 4 },
    { exerciseName: "Wznosy na łydki (ekscentryczne)", sets: 3, reps: 12, weightKg: 0, tempo: "1-0-3-0", restSeconds: 60, orderIndex: 5 },
    { exerciseName: "Deska Kopenhaska", sets: 3, reps: 1, restSeconds: 60, orderIndex: 6, notes: "20s na stronę" },
  ];

  const dayBExercises = [
    { exerciseName: "Wiosłowanie hantlem jednorącz", sets: 3, reps: 10, weightKg: 22, restSeconds: 60, orderIndex: 0 },
    { exerciseName: "Wyciskanie na ławce skośnej", sets: 3, reps: 8, weightKg: 50, restSeconds: 90, orderIndex: 1 },
    { exerciseName: "Face Pulls", sets: 3, reps: 15, weightKg: 15, restSeconds: 45, orderIndex: 2 },
    { exerciseName: "OHP (Wyciskanie nad głowę)", sets: 3, reps: 8, weightKg: 30, restSeconds: 90, orderIndex: 3 },
    { exerciseName: "Pallof Press", sets: 3, reps: 10, restSeconds: 45, orderIndex: 4, notes: "Na stronę" },
    { exerciseName: "Spacer Farmera jednorącz", sets: 3, reps: 1, weightKg: 28, restSeconds: 60, orderIndex: 5, notes: "30m na stronę" },
  ];

  const dayCExercises = [
    { exerciseName: "Aktywacja pośladków z gumą", sets: 2, reps: 15, orderIndex: 0 },
    { exerciseName: "Zakroki (Lunges)", sets: 3, reps: 10, weightKg: 16, restSeconds: 60, orderIndex: 1 },
    { exerciseName: "Hip Thrust", sets: 3, reps: 10, weightKg: 60, restSeconds: 90, orderIndex: 2 },
    { exerciseName: "Pompki", sets: 3, reps: 12, restSeconds: 45, orderIndex: 3 },
    { exerciseName: "Martwy Robak (Dead Bug)", sets: 3, reps: 10, restSeconds: 30, orderIndex: 4, notes: "Na stronę" },
    { exerciseName: "Bird Dog", sets: 3, reps: 10, restSeconds: 30, orderIndex: 5, notes: "Na stronę" },
    { exerciseName: "Plank (deska)", sets: 3, reps: 1, restSeconds: 45, orderIndex: 6, notes: "45s hold" },
  ];

  for (const { exerciseName, ...data } of dayAExercises) {
    const exId = exMap.get(exerciseName);
    if (exId) await db.insert(plannedExercises).values({ trainingDayId: dayA.id, exerciseId: exId, ...data });
  }
  for (const { exerciseName, ...data } of dayBExercises) {
    const exId = exMap.get(exerciseName);
    if (exId) await db.insert(plannedExercises).values({ trainingDayId: dayB.id, exerciseId: exId, ...data });
  }
  for (const { exerciseName, ...data } of dayCExercises) {
    const exId = exMap.get(exerciseName);
    if (exId) await db.insert(plannedExercises).values({ trainingDayId: dayC.id, exerciseId: exId, ...data });
  }
  console.log("Planned exercises seeded");

  // ─── Calendar Events (next 4 weeks) ─────────────────────
  const now = new Date();
  const events: Array<{
    date: string;
    time?: string;
    eventType: string;
    title: string;
    description?: string;
    trainingDayId?: number;
    source: string;
  }> = [];

  for (let week = 0; week < 4; week++) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + week * 7 - now.getDay() + 1); // Monday

    // Tuesday — floorball training
    const tue = new Date(weekStart);
    tue.setDate(weekStart.getDate() + 1);
    events.push({
      date: tue.toISOString().split("T")[0],
      time: "20:00",
      eventType: "floorball_training",
      title: "Trening drużynowy",
      source: "recurring",
    });

    // Wednesday — gym day A or C (alternating)
    const wed = new Date(weekStart);
    wed.setDate(weekStart.getDate() + 2);
    const isWeekA = week % 2 === 0;
    events.push({
      date: wed.toISOString().split("T")[0],
      time: "18:00",
      eventType: "gym",
      title: isWeekA ? "Siłownia — Nogi i tył (A)" : "Siłownia — Hybryda (C)",
      trainingDayId: isWeekA ? dayA.id : dayC.id,
      source: "recurring",
    });

    // Thursday — floorball training
    const thu = new Date(weekStart);
    thu.setDate(weekStart.getDate() + 3);
    events.push({
      date: thu.toISOString().split("T")[0],
      time: "20:00",
      eventType: "floorball_training",
      title: "Trening drużynowy",
      source: "recurring",
    });

    // Saturday — gym day B + match every 2 weeks
    const sat = new Date(weekStart);
    sat.setDate(weekStart.getDate() + 5);
    events.push({
      date: sat.toISOString().split("T")[0],
      time: "10:00",
      eventType: "gym",
      title: "Siłownia — Góra i core (B)",
      trainingDayId: dayB.id,
      source: "recurring",
    });

    if (week % 2 === 0) {
      events.push({
        date: sat.toISOString().split("T")[0],
        time: "17:00",
        eventType: "floorball_match",
        title: "Mecz ligowy",
        source: "recurring",
      });
    }

    // Sunday — rest / pool
    const sun = new Date(weekStart);
    sun.setDate(weekStart.getDate() + 6);
    events.push({
      date: sun.toISOString().split("T")[0],
      eventType: "rest",
      title: "Regeneracja — basen",
      description: "45-60 min pływanie spokojne",
      source: "recurring",
    });
  }

  await db.insert(calendarEvents).values(events);
  console.log(`Calendar events: ${events.length} created (4 weeks)`);

  console.log("Seed complete!");
  await pool.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
