import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dumbbell,
  Target,
  Footprints,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { cn, apiRequest, EVENT_COLORS, EVENT_LABELS } from "@/lib/utils";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import type { CalendarEvent } from "@shared/schema";
import { useEffect } from "react";

type Step = "events" | "readiness" | "workout" | "done";

export default function TodayPage() {
  const [step, setStep] = useState<Step>("events");
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);

  const { data: todayEvents = [], isLoading: isLoadingEvents } = useQuery<CalendarEvent[]>({
    queryKey: ["today-events"],
    queryFn: () => apiRequest("/api/today/event"),
  });

  const { data: todayReadiness, isLoading: isLoadingReadiness, refetch: refetchReadiness } = useQuery({
    queryKey: ["today-readiness"],
    queryFn: () => apiRequest("/api/readiness/today"),
  });

  if (isLoadingEvents || isLoadingReadiness) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-white/40" strokeWidth={1} />
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="flex flex-col items-center justify-center px-4 pt-20">
        <CheckCircle2 className="mb-4 h-16 w-16 text-[#c5e063]" strokeWidth={1} />
        <h2 className="mb-2 text-xl font-semibold tracking-wide">Trening zapisany</h2>
        <p className="text-white/40 text-sm tracking-wide">Dobra robota. Odpoczywaj.</p>
        <button
          onClick={() => { setStep("events"); setSelectedEvent(null); setAiAnalysis(null); }}
          className="mt-8 rounded-full border border-white/20 px-8 py-3 text-sm font-semibold tracking-wide hover:border-white/40 transition-colors"
        >
          Powrót
        </button>
      </div>
    );
  }

  if (step === "readiness" && selectedEvent) {
    setStep("workout");
    return null;
  }

  if (step === "workout" && selectedEvent) {
    const type = selectedEvent.eventType;
    if (type === "gym") {
      return <GymWorkout event={selectedEvent} aiAnalysis={aiAnalysis} onComplete={() => setStep("done")} />;
    }
    if (type.startsWith("floorball")) {
      return <FloorballLog event={selectedEvent} onComplete={() => setStep("done")} />;
    }
    if (type === "running") {
      return <RunningLog event={selectedEvent} onComplete={() => setStep("done")} />;
    }
  }

  // Step: events (default)
  return (
    <div className="p-4 space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-widest text-white/40 mb-1">
          {format(new Date(), "EEEE", { locale: pl })}
        </p>
        <h1 className="text-2xl font-semibold">
          {format(new Date(), "d MMMM", { locale: pl })}
        </h1>
      </div>

      {todayEvents.length === 0 ? (
        <div className="rounded-2xl bg-[#111111] border border-white/[0.12] p-6 text-center">
          <p className="text-white/40 text-sm">Brak zaplanowanych treningów na dziś</p>
          <p className="mt-2 text-xs text-white/20">
            Dodaj trening w kalendarzu lub porozmawiaj z trenerem AI
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[11px] uppercase tracking-widest text-white/40">Dziś</p>
          {todayEvents.map((event) => (
            <button
              key={event.id}
              onClick={() => { setSelectedEvent(event); setStep("readiness"); }}
              className="flex w-full items-center gap-4 rounded-2xl bg-[#111111] border border-white/[0.12] p-4 text-left transition-colors hover:border-white/25"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5">
                {event.eventType === "gym" && <Dumbbell className="h-5 w-5 text-white/60" strokeWidth={1} />}
                {event.eventType.startsWith("floorball") && <Target className="h-5 w-5 text-white/60" strokeWidth={1} />}
                {event.eventType === "running" && <Footprints className="h-5 w-5 text-white/60" strokeWidth={1} />}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">{event.title}</p>
                <p className="text-xs text-white/40 mt-0.5">
                  {event.time && `${event.time} · `}
                  {EVENT_LABELS[event.eventType]}
                </p>
              </div>
              <span className="text-xs text-white/40 tracking-wide">Rozpocznij →</span>
            </button>
          ))}
        </div>
      )}

      <div>
        <p className="text-[11px] uppercase tracking-widest text-white/40 mb-3">Samopoczucie</p>
        <div className="rounded-2xl bg-[#111111] border border-white/[0.12] p-4">
          <ReadinessForm
            initialData={todayReadiness}
            onComplete={() => refetchReadiness()}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Readiness Form ──────────────────────────────────────────
function ReadinessForm({
  initialData,
  onComplete,
}: {
  initialData?: any;
  onComplete: () => void;
}) {
  const [isEditing, setIsEditing] = useState(!initialData);
  const [form, setForm] = useState({
    trainingReadiness: initialData?.trainingReadiness ?? 70,
    bodyBattery: initialData?.bodyBattery ?? 60,
    sleepScore: initialData?.sleepScore ?? 70,
    hrvStatus: initialData?.hrvStatus ?? "balanced",
    painLevel: initialData?.painLevel ?? 3,
    stressLevel: initialData?.stressLevel ?? 3,
  });

  useEffect(() => {
    if (initialData) {
      setIsEditing(false);
      setForm({
        trainingReadiness: initialData.trainingReadiness ?? 70,
        bodyBattery: initialData.bodyBattery ?? 60,
        sleepScore: initialData.sleepScore ?? 70,
        hrvStatus: initialData.hrvStatus ?? "balanced",
        painLevel: initialData.painLevel ?? 3,
        stressLevel: initialData.stressLevel ?? 3,
      });
    }
  }, [initialData]);

  const mutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("/api/readiness", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setIsEditing(false);
      onComplete();
    },
  });

  const update = (key: string, value: number | string) => {
    if (isEditing) setForm((f) => ({ ...f, [key]: value }));
  };

  return (
    <div>
      <div className="space-y-5">
        <SliderField label="Training Readiness" value={form.trainingReadiness} disabled={!isEditing} min={0} max={100} onChange={(v) => update("trainingReadiness", v)} />
        <SliderField label="Body Battery" value={form.bodyBattery} min={0} disabled={!isEditing} max={100} onChange={(v) => update("bodyBattery", v)} />
        <SliderField label="Wynik snu" value={form.sleepScore} min={0} disabled={!isEditing} max={100} onChange={(v) => update("sleepScore", v)} />

        <div>
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-white/40">Status HRV</label>
          <div className="flex gap-2">
            {["low", "balanced", "high"].map((status) => (
              <button
                key={status}
                disabled={!isEditing}
                onClick={() => update("hrvStatus", status)}
                className={cn(
                  "flex-1 rounded-full py-2.5 text-xs font-semibold tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                  form.hrvStatus === status
                    ? status === "low" ? "bg-red-500/80 text-white" : status === "balanced" ? "bg-white/90 text-black" : "bg-[#c5e063] text-black"
                    : "border border-white/15 bg-transparent text-white/40",
                )}
              >
                {status === "low" ? "Niski" : status === "balanced" ? "Zrównoważony" : "Wysoki"}
              </button>
            ))}
          </div>
        </div>

        <SliderField label="Ból / sztywność" value={form.painLevel} disabled={!isEditing} min={1} max={10} onChange={(v) => update("painLevel", v)} color={form.painLevel >= 7 ? "red" : form.painLevel >= 4 ? "yellow" : "green"} />
        <SliderField label="Stres psychiczny" value={form.stressLevel} disabled={!isEditing} min={1} max={10} onChange={(v) => update("stressLevel", v)} />
      </div>

      {form.painLevel >= 7 && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl bg-red-500/10 border border-red-500/20 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" strokeWidth={1} />
          <p className="text-sm text-red-300 font-light">
            Wysoki poziom bólu — uważaj podczas treningu
          </p>
        </div>
      )}

      <div className="mt-6 flex gap-3">
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="w-full rounded-full border border-white/20 py-3 text-sm font-semibold text-white hover:border-white/40 transition-colors"
          >
            Edytuj
          </button>
        ) : (
          <button
            onClick={() => mutation.mutate({ ...form })}
            disabled={mutation.isPending}
            className="w-full rounded-full bg-[#6b7cff] py-3 text-sm font-semibold text-white disabled:opacity-50 transition-colors hover:bg-[#5a6bf0]"
          >
            {mutation.isPending ? "Zapisuję..." : "Zapisz gotowość na dziś"}
          </button>
        )}
      </div>
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
  color,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (v: number) => void;
  color?: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-[11px] font-semibold uppercase tracking-widest text-white/40">{label}</label>
        <span className={cn(
          "text-sm font-semibold",
          color === "red" ? "text-red-400" : color === "yellow" ? "text-yellow-400" : "text-white",
        )}>{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className={cn("w-full accent-white", disabled && "opacity-30 cursor-not-allowed")}
      />
    </div>
  );
}

// ─── Gym Workout ─────────────────────────────────────────────
function GymWorkout({
  event,
  aiAnalysis,
  onComplete,
}: {
  event: CalendarEvent;
  aiAnalysis: any;
  onComplete: () => void;
}) {
  const { data: gymPlan } = useQuery({
    queryKey: ["gym-plan", event.id],
    queryFn: () => apiRequest<any>(`/api/today/gym-plan/${event.id}`),
    enabled: !!event.id,
  });

  const [exerciseState, setExerciseState] = useState<
    Record<number, { completed: boolean; notes: string }>
  >({});
  const [rpe, setRpe] = useState(5);
  const [notes, setNotes] = useState("");

  const saveMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("/api/workouts", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: onComplete,
  });

  if (!gymPlan) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-white/40" strokeWidth={1} />
      </div>
    );
  }

  const modifications = aiAnalysis?.modifications || [];

  const handleSave = () => {
    const exLogs = gymPlan.exercises.map((ex: any) => {
      const state = exerciseState[ex.id] || { completed: false, notes: "" };
      const mod = modifications.find((m: any) => m.planned_exercise_id === ex.id);
      return {
        exerciseId: ex.exerciseId,
        completed: state.completed,
        plannedSets: mod?.new_sets || ex.sets,
        plannedReps: mod?.new_reps || ex.reps,
        plannedWeight: mod?.new_weight_kg || ex.weightKg,
        actualNotes: state.notes || null,
        wasModifiedByAi: !!mod,
        modificationReason: mod?.reason || null,
        orderIndex: ex.orderIndex,
      };
    });

    saveMutation.mutate({
      date: new Date().toISOString().split("T")[0],
      workoutType: "gym",
      calendarEventId: event.id,
      rpe,
      notes: notes || null,
      exerciseLogs: exLogs,
    });
  };

  return (
    <div className="p-4">
      <p className="text-[11px] uppercase tracking-widest text-white/40 mb-1">Siłownia</p>
      <h2 className="mb-4 text-xl font-semibold">{gymPlan.day?.name || event.title}</h2>

      {aiAnalysis?.summary && (
        <div className="mb-4 rounded-2xl bg-[#6b7cff]/10 border border-[#6b7cff]/20 p-3">
          <p className="text-sm text-[#6b7cff]">🤖 {aiAnalysis.summary}</p>
        </div>
      )}

      <div className="space-y-3">
        {gymPlan.exercises.map((ex: any) => {
          const state = exerciseState[ex.id] || { completed: false, notes: "" };
          const mod = modifications.find((m: any) => m.planned_exercise_id === ex.id);

          return (
            <div
              key={ex.id}
              className={cn(
                "rounded-2xl bg-[#111111] border border-white/[0.12] p-4 transition-colors",
                mod?.action === "remove" && "opacity-40",
                state.completed && "border-[#c5e063]/30",
              )}
            >
              <div className="flex items-start gap-3">
                <button
                  onClick={() =>
                    setExerciseState((s) => ({
                      ...s,
                      [ex.id]: { ...state, completed: !state.completed },
                    }))
                  }
                  className={cn(
                    "mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border transition-colors touch-target",
                    state.completed
                      ? "border-[#c5e063] bg-[#c5e063] text-black"
                      : "border-white/20",
                  )}
                >
                  {state.completed && <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} />}
                </button>
                <div className="flex-1">
                  <p className={cn("font-medium text-sm", state.completed && "text-[#c5e063]")}>
                    {ex.exerciseName}
                  </p>
                  <p className="text-xs text-white/40 mt-0.5">
                    {mod ? (
                      <span className="text-yellow-400">
                        {mod.new_sets || ex.sets}×{mod.new_reps || ex.reps}
                        {(mod.new_weight_kg || ex.weightKg) ? ` @ ${mod.new_weight_kg || ex.weightKg}kg` : ""}
                        {mod.action === "remove" && " — POMINIĘTE"}
                      </span>
                    ) : (
                      <>
                        {ex.sets}×{ex.reps}
                        {ex.weightKg ? ` @ ${ex.weightKg}kg` : ""}
                        {ex.tempo && ` (${ex.tempo})`}
                      </>
                    )}
                  </p>
                  {mod?.reason && (
                    <p className="mt-1 text-xs text-yellow-400/70">AI: {mod.reason}</p>
                  )}
                  {ex.notes && <p className="mt-1 text-xs text-white/20">{ex.notes}</p>}
                </div>
              </div>
              <input
                type="text"
                value={state.notes}
                onChange={(e) =>
                  setExerciseState((s) => ({
                    ...s,
                    [ex.id]: { ...state, notes: e.target.value },
                  }))
                }
                placeholder="Notatki..."
                className="mt-3 w-full rounded-xl border border-white/[0.12] bg-black/40 px-3 py-2 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/25"
              />
            </div>
          );
        })}
      </div>

      <div className="mt-6 space-y-4">
        <SliderField label="RPE (odczuwany wysiłek)" value={rpe} min={1} max={10} onChange={setRpe} />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notatki po treningu..."
          rows={2}
          className="w-full rounded-2xl border border-white/[0.12] bg-[#111111] px-4 py-3 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/25 resize-none"
        />
        <button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="w-full rounded-full bg-[#6b7cff] py-4 text-sm font-semibold text-white disabled:opacity-50 transition-colors hover:bg-[#5a6bf0]"
        >
          {saveMutation.isPending ? "Zapisuję..." : "Zakończ trening"}
        </button>
      </div>
    </div>
  );
}

// ─── Floorball Log ───────────────────────────────────────────
function FloorballLog({
  event,
  onComplete,
}: {
  event: CalendarEvent;
  onComplete: () => void;
}) {
  const [form, setForm] = useState({
    floorballType: event.eventType === "floorball_match" ? "match" : "training",
    durationMinutes: 90,
    distanceKm: 5,
    avgHr: 140,
    maxHr: 180,
    rpe: 6,
    notes: "",
  });

  const saveMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("/api/workouts", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: onComplete,
  });

  const update = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="p-4">
      <p className="text-[11px] uppercase tracking-widest text-white/40 mb-1">Unihokej</p>
      <h2 className="mb-4 text-xl font-semibold">{event.title}</h2>

      <div className="space-y-4">
        <div className="flex gap-2">
          {["training", "match"].map((t) => (
            <button
              key={t}
              onClick={() => update("floorballType", t)}
              className={cn(
                "flex-1 rounded-full py-2.5 text-sm font-semibold tracking-wide transition-colors",
                form.floorballType === t
                  ? "bg-[#c5e063] text-black"
                  : "border border-white/20 text-white/50 hover:border-white/40",
              )}
            >
              {t === "training" ? "Trening" : "Mecz"}
            </button>
          ))}
        </div>

        <NumberField label="Czas (min)" value={form.durationMinutes} onChange={(v) => update("durationMinutes", v)} />
        <NumberField label="Dystans (km)" value={form.distanceKm} onChange={(v) => update("distanceKm", v)} step={0.1} />
        <div className="flex gap-3">
          <NumberField label="Śr. tętno" value={form.avgHr} onChange={(v) => update("avgHr", v)} />
          <NumberField label="Max tętno" value={form.maxHr} onChange={(v) => update("maxHr", v)} />
        </div>
        <SliderField label="RPE" value={form.rpe} min={1} max={10} onChange={(v) => update("rpe", v)} />
        <textarea
          value={form.notes}
          onChange={(e) => update("notes", e.target.value)}
          placeholder="Notatki (samopoczucie, kontuzje...)"
          rows={3}
          className="w-full rounded-2xl border border-white/[0.12] bg-[#111111] px-4 py-3 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/25 resize-none"
        />
      </div>

      <button
        onClick={() =>
          saveMutation.mutate({
            date: new Date().toISOString().split("T")[0],
            workoutType: "floorball",
            calendarEventId: event.id,
            ...form,
            notes: form.notes || null,
          })
        }
        disabled={saveMutation.isPending}
        className="mt-6 w-full rounded-full bg-[#6b7cff] py-4 text-sm font-semibold text-white disabled:opacity-50 transition-colors hover:bg-[#5a6bf0]"
      >
        {saveMutation.isPending ? "Zapisuję..." : "Zapisz trening"}
      </button>
    </div>
  );
}

// ─── Running Log ─────────────────────────────────────────────
function RunningLog({
  event,
  onComplete,
}: {
  event: CalendarEvent;
  onComplete: () => void;
}) {
  const [form, setForm] = useState({
    durationMinutes: 30,
    distanceKm: 5,
    avgPace: "6:00",
    avgHr: 145,
    maxHr: 170,
    cadence: 170,
    trainingEffectAerobic: 3.0,
    trainingEffectAnaerobic: 1.0,
    rpe: 5,
    notes: "",
  });

  const saveMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("/api/workouts", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: onComplete,
  });

  const update = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="p-4">
      <p className="text-[11px] uppercase tracking-widest text-white/40 mb-1">Bieg</p>
      <h2 className="mb-4 text-xl font-semibold">{event.title || "Bieg"}</h2>

      <div className="space-y-4">
        <div className="flex gap-3">
          <NumberField label="Dystans (km)" value={form.distanceKm} onChange={(v) => update("distanceKm", v)} step={0.1} />
          <NumberField label="Czas (min)" value={form.durationMinutes} onChange={(v) => update("durationMinutes", v)} />
        </div>
        <div>
          <label className="mb-2 block text-[11px] uppercase tracking-widest text-white/40">Śr. tempo (min/km)</label>
          <input
            type="text"
            value={form.avgPace}
            onChange={(e) => update("avgPace", e.target.value)}
            placeholder="6:00"
            className="w-full rounded-2xl border border-white/[0.15] bg-[#111111] px-4 py-3 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/30"
          />
        </div>
        <div className="flex gap-3">
          <NumberField label="Śr. tętno" value={form.avgHr} onChange={(v) => update("avgHr", v)} />
          <NumberField label="Max tętno" value={form.maxHr} onChange={(v) => update("maxHr", v)} />
        </div>
        <NumberField label="Kadencja (kroki/min)" value={form.cadence} onChange={(v) => update("cadence", v)} />
        <div className="flex gap-3">
          <NumberField label="Efekt aerobowy (0-5)" value={form.trainingEffectAerobic} onChange={(v) => update("trainingEffectAerobic", v)} step={0.1} />
          <NumberField label="Efekt anaerobowy (0-5)" value={form.trainingEffectAnaerobic} onChange={(v) => update("trainingEffectAnaerobic", v)} step={0.1} />
        </div>
        <SliderField label="RPE" value={form.rpe} min={1} max={10} onChange={(v) => update("rpe", v)} />
        <textarea
          value={form.notes}
          onChange={(e) => update("notes", e.target.value)}
          placeholder="Notatki..."
          rows={2}
          className="w-full rounded-2xl border border-white/[0.12] bg-[#111111] px-4 py-3 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/25 resize-none"
        />
      </div>

      <button
        onClick={() =>
          saveMutation.mutate({
            date: new Date().toISOString().split("T")[0],
            workoutType: "running",
            calendarEventId: event.id,
            ...form,
            notes: form.notes || null,
          })
        }
        disabled={saveMutation.isPending}
        className="mt-6 w-full rounded-full bg-[#6b7cff] py-4 text-sm font-semibold text-white disabled:opacity-50 transition-colors hover:bg-[#5a6bf0]"
      >
        {saveMutation.isPending ? "Zapisuję..." : "Zapisz bieg"}
      </button>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div className="flex-1">
      <label className="mb-2 block text-[11px] uppercase tracking-widest text-white/40">{label}</label>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full rounded-2xl border border-white/[0.15] bg-[#111111] px-4 py-3 text-sm focus:outline-none focus:border-white/30"
      />
    </div>
  );
}
