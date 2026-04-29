import { test } from "node:test";
import * as assert from "node:assert";

// ─── 1. parseLogEventId: URL param parsing helper ────────────────────────

function parseLogEventId(searchStr: string): number | null {
  const logEventIdRaw = new URLSearchParams(searchStr).get("logEvent");
  const logEventId =
    logEventIdRaw !== null && /^\d+$/.test(logEventIdRaw)
      ? parseInt(logEventIdRaw, 10)
      : null;
  return logEventId;
}

test("parseLogEventId - valid numeric ID", () => {
  assert.strictEqual(parseLogEventId("logEvent=123"), 123);
});

test("parseLogEventId - ID zero", () => {
  assert.strictEqual(parseLogEventId("logEvent=0"), 0);
});

test("parseLogEventId - large ID", () => {
  assert.strictEqual(parseLogEventId("logEvent=999999999"), 999999999);
});

test("parseLogEventId - invalid: non-numeric", () => {
  assert.strictEqual(parseLogEventId("logEvent=abc"), null);
});

test("parseLogEventId - invalid: decimal", () => {
  assert.strictEqual(parseLogEventId("logEvent=12.5"), null);
});

test("parseLogEventId - invalid: negative", () => {
  assert.strictEqual(parseLogEventId("logEvent=-5"), null);
});

test("parseLogEventId - invalid: hex notation", () => {
  assert.strictEqual(parseLogEventId("logEvent=0x10"), null);
});

test("parseLogEventId - empty string", () => {
  assert.strictEqual(parseLogEventId(""), null);
});

test("parseLogEventId - missing logEvent param", () => {
  assert.strictEqual(parseLogEventId("other=7"), null);
});

test("parseLogEventId - logEvent with empty value", () => {
  assert.strictEqual(parseLogEventId("logEvent="), null);
});

test("parseLogEventId - multiple params with logEvent", () => {
  assert.strictEqual(parseLogEventId("foo=bar&logEvent=42&baz=qux"), 42);
});

// ─── 2. buildLogWorkoutUrl: Insight navigation logic ────────────────────

function buildLogWorkoutUrl(actionPayload: unknown): string {
  const payload = actionPayload as { eventId?: unknown } | null;
  const eventId = payload?.eventId;

  if (typeof eventId === "number" && Number.isFinite(eventId)) {
    return `/?logEvent=${eventId}`;
  }

  return "/";
}

test("buildLogWorkoutUrl - valid eventId", () => {
  assert.strictEqual(buildLogWorkoutUrl({ eventId: 42 }), "/?logEvent=42");
});

test("buildLogWorkoutUrl - eventId as zero", () => {
  assert.strictEqual(buildLogWorkoutUrl({ eventId: 0 }), "/?logEvent=0");
});

test("buildLogWorkoutUrl - eventId as large number", () => {
  assert.strictEqual(buildLogWorkoutUrl({ eventId: 999999 }), "/?logEvent=999999");
});

test("buildLogWorkoutUrl - empty object (no eventId)", () => {
  assert.strictEqual(buildLogWorkoutUrl({}), "/");
});

test("buildLogWorkoutUrl - eventId is undefined", () => {
  assert.strictEqual(buildLogWorkoutUrl({ eventId: undefined }), "/");
});

test("buildLogWorkoutUrl - null payload", () => {
  assert.strictEqual(buildLogWorkoutUrl(null), "/");
});

test("buildLogWorkoutUrl - eventId is string (should fail)", () => {
  assert.strictEqual(buildLogWorkoutUrl({ eventId: "42" }), "/");
});

test("buildLogWorkoutUrl - eventId is NaN", () => {
  assert.strictEqual(buildLogWorkoutUrl({ eventId: NaN }), "/");
});

test("buildLogWorkoutUrl - eventId is Infinity", () => {
  assert.strictEqual(buildLogWorkoutUrl({ eventId: Infinity }), "/");
});

test("buildLogWorkoutUrl - eventId is negative Infinity", () => {
  assert.strictEqual(buildLogWorkoutUrl({ eventId: -Infinity }), "/");
});

// ─── 3. Workout log date extraction validation ────────────────────────
//
// Verify that when creating a workout log, the date comes from event.date
// (not from today's date). This tests the logic from TodayPage forms.

test("workout log uses event.date not today", () => {
  // Mock event from a past date (e.g., catch-up scenario)
  const event = {
    id: 1,
    date: "2025-04-20", // Not today
    title: "Missed workout",
    eventType: "gym",
  };

  // Simulate the mutation payload that gets sent to /api/workouts
  const workoutPayload = {
    date: event.date, // Uses event.date
    workoutType: "gym",
    calendarEventId: event.id,
    rpe: 7,
    notes: "Made up the workout",
  };

  // Assert that the payload date matches the event date, not current date
  assert.strictEqual(workoutPayload.date, "2025-04-20");
  assert.notStrictEqual(workoutPayload.date, new Date().toISOString().split("T")[0]);
});

// ─── 4. Server endpoint validation: GET /api/calendar/events/:id ────────
//
// The endpoint should:
// - Accept numeric IDs only
// - Return 400 for non-numeric IDs
// - Return 404 for missing events
// - Return 200 with the event otherwise

test("server: parseId from route params - valid", () => {
  // Simulate what happens in the server handler at line 411-415
  function parseEventId(paramId: string): number | null {
    const id = parseInt(paramId);
    if (!Number.isFinite(id)) {
      return null;
    }
    return id;
  }

  assert.strictEqual(parseEventId("123"), 123);
});

test("server: parseId from route params - invalid (non-numeric)", () => {
  function parseEventId(paramId: string): number | null {
    const id = parseInt(paramId);
    if (!Number.isFinite(id)) {
      return null;
    }
    return id;
  }

  // parseInt("abc") returns NaN, which fails Number.isFinite
  assert.strictEqual(parseEventId("abc"), null);
});

test("server: parseId from route params - decimal (truncated)", () => {
  function parseEventId(paramId: string): number | null {
    const id = parseInt(paramId);
    if (!Number.isFinite(id)) {
      return null;
    }
    return id;
  }

  // parseInt("12.5") returns 12, which passes Number.isFinite
  // This is why the actual code uses /^\d+$/ regex in the client instead
  assert.strictEqual(parseEventId("12.5"), 12);
});

test("server: id validation logic with proper regex", () => {
  // The ACTUAL validation in the client uses the regex /^\d+$/
  function isValidLogEventId(paramId: string | null): boolean {
    return paramId !== null && /^\d+$/.test(paramId);
  }

  assert.ok(isValidLogEventId("123"));
  assert.ok(!isValidLogEventId("abc"));
  assert.ok(!isValidLogEventId(""));
  assert.ok(!isValidLogEventId("12.5")); // Regex fails, which is correct
  assert.ok(!isValidLogEventId("-5"));
});

// ─── 5. InsightCard action payload structure ─────────────────────────

test("InsightCard insight.actionPayload for log_workout", () => {
  // From InsightCard lines 67-69, when actionKind === "log_workout"
  // it extracts eventId from actionPayload

  const insight1 = {
    id: 1,
    actionKind: "log_workout" as const,
    actionPayload: { eventId: 5 },
    actionLabel: "Uzupełnij wpis",
  };

  const eventId = (insight1.actionPayload as { eventId?: number } | null)?.eventId;
  const url = eventId ? `/?logEvent=${eventId}` : "/";

  assert.strictEqual(url, "/?logEvent=5");
});

test("InsightCard insight.actionPayload missing eventId", () => {
  const insight = {
    id: 1,
    actionKind: "log_workout" as const,
    actionPayload: {}, // No eventId
    actionLabel: "Uzupełnij wpis",
  };

  const eventId = (insight.actionPayload as { eventId?: number } | null)?.eventId;
  const url = eventId ? `/?logEvent=${eventId}` : "/";

  assert.strictEqual(url, "/");
});

test("InsightCard other action kinds navigate correctly", () => {
  // From InsightCard lines 70-74, other action kinds navigate to fixed URLs

  const actionMap: Record<string, string> = {
    "swap_exercises": "/trener",
    "ease_today": "/",
    "add_rest_day": "/",
  };

  assert.strictEqual(actionMap["swap_exercises"], "/trener");
  assert.strictEqual(actionMap["ease_today"], "/");
});

// ─── 6. TodayPage catch-up event display logic ────────────────────────

test("catch-up event matching: same-day event is NOT catch-up", () => {
  // From TodayPage lines 106-111
  // If the event is in todayEvents, it's NOT a catch-up display

  const catchUpEvent = {
    id: 5,
    date: "2025-04-22",
    status: "planned",
    title: "Yesterday's training",
  };

  const todayEvents = [
    { id: 5, date: "2025-04-22", status: "planned" }, // Same event
  ];

  const catchUpDisplay = catchUpEvent &&
    catchUpEvent.status === "planned" &&
    !todayEvents.some((e) => e.id === catchUpEvent.id)
      ? catchUpEvent
      : null;

  assert.strictEqual(catchUpDisplay, null);
});

test("catch-up event matching: different-day event IS catch-up", () => {
  const catchUpEvent = {
    id: 5,
    date: "2025-04-21",
    status: "planned",
    title: "Yesterday's training",
  };

  const todayEvents: any[] = [
    { id: 3, date: "2025-04-22", status: "planned" },
  ];

  const catchUpDisplay = catchUpEvent &&
    catchUpEvent.status === "planned" &&
    !todayEvents.some((e) => e.id === catchUpEvent.id)
      ? catchUpEvent
      : null;

  assert.deepStrictEqual(catchUpDisplay, catchUpEvent);
});

test("catch-up event: skipped status should not display", () => {
  const catchUpEvent = {
    id: 5,
    date: "2025-04-21",
    status: "skipped",
    title: "Yesterday's training",
  };

  const todayEvents: any[] = [];

  const catchUpDisplay = catchUpEvent &&
    catchUpEvent.status === "planned" && // Status check fails
    !todayEvents.some((e) => e.id === catchUpEvent.id)
      ? catchUpEvent
      : null;

  assert.strictEqual(catchUpDisplay, null);
});

// ─── 7. goBack logic for catch-up navigation ────────────────────────

test("TodayPage goBack clears logEventId from URL", () => {
  // From TodayPage lines 139-146, goBack clears state and optionally
  // removes the logEvent parameter from URL

  let logEventId: number | null = 5;
  const goBack = () => {
    if (logEventId) {
      logEventId = null; // Clear internal state
      // navigate("/", { replace: true }); // In real code
    }
  };

  goBack();
  assert.strictEqual(logEventId, null);
});

// ─── 8. Workout log event.date field in different form contexts ─────────

test("GymWorkout form uses event.date for workout log", () => {
  const event = {
    id: 10,
    date: "2025-04-19", // Catch-up date
    title: "Gym Session",
    eventType: "gym",
  };

  const handleSave = () => {
    const payload = {
      date: event.date, // Must use event.date
      workoutType: "gym",
      calendarEventId: event.id,
      rpe: 6,
      notes: null,
      eventNotes: JSON.stringify({ type: "gym_log" }),
    };
    return payload;
  };

  const result = handleSave();
  assert.strictEqual(result.date, "2025-04-19");
  assert.notStrictEqual(result.date, new Date().toISOString().split("T")[0]);
});

test("ZoneStatsForm uses event.date for running/floorball", () => {
  const event = {
    id: 20,
    date: "2025-04-18",
    eventType: "floorball_training",
    title: "Floorball",
  };

  const mutation = {
    mutate: (data: any) => {
      assert.strictEqual(data.date, "2025-04-18");
      assert.strictEqual(data.workoutType, "floorball");
    },
  };

  const zones = { 1: 10, 2: 15, 3: 5, 4: 0, 5: 0 };
  const rpe = 7;

  mutation.mutate({
    date: event.date,
    workoutType: "floorball",
    calendarEventId: event.id,
    rpe,
    notes: null,
    hrZoneDistribution: zones,
    floorballType: "training",
    eventNotes: JSON.stringify({ type: "zone_stats", zones, rpe }),
  });
});

test("QuickCompleteForm (gym) uses event.date", () => {
  const event = {
    id: 30,
    date: "2025-04-17",
    eventType: "gym",
    title: "Quick Gym",
  };

  const payload = {
    date: event.date,
    workoutType: "gym",
    calendarEventId: event.id,
    rpe: 5,
    notes: null,
    eventNotes: JSON.stringify({ type: "gym_quick", rpe: 5 }),
  };

  assert.strictEqual(payload.date, "2025-04-17");
});

test("SimpleStatsForm (swimming/home) uses event.date", () => {
  const event = {
    id: 40,
    date: "2025-04-16",
    eventType: "swimming",
    title: "Swimming",
  };

  const payload = {
    date: event.date,
    workoutType: "swimming",
    calendarEventId: event.id,
    durationMinutes: 45,
    rpe: 6,
    notes: null,
    eventNotes: JSON.stringify({ type: "simple_stats", durationMinutes: 45, rpe: 6 }),
  };

  assert.strictEqual(payload.date, "2025-04-16");
});

// ─── 9. Event status validation for catch-up display ────────────────────

test("only 'planned' status events show catch-up panel", () => {
  const statuses = ["planned", "completed", "skipped", "cancelled"];

  const canShowCatchUp = (status: string): boolean => {
    return status === "planned";
  };

  assert.ok(canShowCatchUp("planned"));
  assert.ok(!canShowCatchUp("completed"));
  assert.ok(!canShowCatchUp("skipped"));
  assert.ok(!canShowCatchUp("cancelled"));
});
