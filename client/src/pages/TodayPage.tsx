import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dumbbell,
  Target,
  Footprints,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Activity,
  Settings,
  ChevronDown,
} from "lucide-react";
import { cn, apiRequest, EVENT_LABELS } from "@/lib/utils";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import type { CalendarEvent } from "@shared/schema";
import { buttonVariants } from "@/components/ui/Button";
import { InsightList } from "@/components/InsightCard";
import { EventDetailPanel, HR_ZONES, type SubflowStep } from "@/components/EventDetailPanel";
import { useSettings } from "@/contexts/SettingsContext";
import { useSetTopNav } from "@/contexts/TopNavContext";

// ─── Button styles (sourced from Button component variants) ──
const btnPrimary = cn(buttonVariants({ variant: "primary", size: "md" }), "w-full");
const btnSecondary = cn(buttonVariants({ variant: "secondary", size: "md" }), "w-full");

// ─── Helpers ──────────────────────────────────────────────────
function todayStr() {
  return new Date().toLocaleDateString("sv-SE");
}

function parseNotes(notes: string | null | undefined): Record<string, any> | null {
  if (!notes) return null;
  try { return JSON.parse(notes); } catch { return null; }
}

function rpeLabel(rpe: number) {
  if (rpe <= 3) return "Lekki / regeneracyjny";
  if (rpe <= 5) return "Umiarkowany";
  if (rpe <= 7) return "Intensywny";
  if (rpe <= 9) return "Bardzo ciężki";
  return "Maksymalny wysiłek";
}

type Step = "events" | "gym-details" | "zone-stats" | "gym-quick" | "done";

// ─── Main Page ────────────────────────────────────────────────
export default function TodayPage() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("events");
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [expandedEvent, setExpandedEvent] = useState<CalendarEvent | null>(null);
  const { openSettings } = useSettings();

  useSetTopNav(
    () =>
      step === "events"
        ? {
            label: format(new Date(), "EEEE", { locale: pl }),
            title: format(new Date(), "d MMMM", { locale: pl }),
            right: (
              <button
                onClick={openSettings}
                className="rounded-full border border-white/20 p-3 text-white/50 hover:text-white hover:border-white/40 transition-colors"
              >
                <Settings size={18} strokeWidth={1} />
              </button>
            ),
          }
        : null,
    [step, openSettings],
  );

  const { data: todayEvents = [], isLoading: isLoadingEvents } = useQuery<CalendarEvent[]>({
    queryKey: ["today-events"],
    queryFn: () => apiRequest("/api/today/event"),
  });

  const { data: todayReadiness, isLoading: isLoadingReadiness, refetch: refetchReadiness } = useQuery({
    queryKey: ["today-readiness"],
    queryFn: () => apiRequest("/api/readiness/today"),
  });

  const [savedWorkoutId, setSavedWorkoutId] = useState<number | null>(null);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const analyzeMutation = useMutation({
    mutationFn: (workoutId: number) =>
      apiRequest<{ analysis: { feedback: string } }>(`/api/workouts/${workoutId}/analyze`, {
        method: "POST",
      }),
    onSuccess: (data) => {
      setAiFeedback(data.analysis?.feedback || null);
      setIsAnalyzing(false);
    },
    onError: () => {
      setIsAnalyzing(false);
    },
  });

  if (isLoadingEvents || isLoadingReadiness) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-white/40" strokeWidth={1} />
      </div>
    );
  }

  const goBack = () => {
    setStep("events");
    setSelectedEvent(null);
    setSavedWorkoutId(null);
    setAiFeedback(null);
    setIsAnalyzing(false);
  };

  const onWorkoutSaved = (workoutId: number) => {
    queryClient.invalidateQueries({ queryKey: ["today-events"] });
    setSavedWorkoutId(workoutId);
    setStep("done");
    // Fire-and-forget AI analysis
    setIsAnalyzing(true);
    analyzeMutation.mutate(workoutId);
  };

  if (step === "done") {
    return (
      <div className="flex flex-col items-center justify-center px-4 pt-16 pb-8">
        <CheckCircle2 className="mb-4 h-16 w-16 text-[#c5e063]" strokeWidth={1} />
        <h2 className="mb-2 text-xl font-semibold tracking-wide">Zapisano</h2>
        <p className="text-white/40 text-sm tracking-wide">Dobra robota.</p>

        {/* AI feedback card */}
        {(isAnalyzing || aiFeedback) && (
          <div className="mt-8 w-full max-w-sm rounded-2xl border border-white/[0.12] bg-[#111111] p-5">
            <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-[#c5e063]">
              <Activity size={12} strokeWidth={1.5} />
              Feedback trenera
            </p>
            {isAnalyzing ? (
              <div className="flex items-center gap-2 text-sm text-white/40 font-light">
                <Loader2 size={14} strokeWidth={1} className="animate-spin" />
                <span className="animate-pulse">Analizuję trening...</span>
              </div>
            ) : aiFeedback ? (
              <p className="text-sm text-white/80 font-light whitespace-pre-wrap leading-relaxed">{aiFeedback}</p>
            ) : null}
          </div>
        )}

        <button onClick={goBack} className="mt-8 rounded-full border border-white/20 px-8 py-3 text-sm font-semibold tracking-wide hover:border-white/40 transition-colors">
          Powrót
        </button>
      </div>
    );
  }

  if (step === "gym-details" && selectedEvent) {
    return <GymWorkout event={selectedEvent} onComplete={onWorkoutSaved} onBack={goBack} />;
  }

  if (step === "zone-stats" && selectedEvent) {
    return <ZoneStatsForm event={selectedEvent} onComplete={onWorkoutSaved} onBack={goBack} />;
  }

  if (step === "gym-quick" && selectedEvent) {
    return <QuickCompleteForm event={selectedEvent} onComplete={onWorkoutSaved} onBack={goBack} />;
  }

  const handleStartSubflow = (substep: SubflowStep, event: CalendarEvent) => {
    setSelectedEvent(event);
    setStep(substep);
    setExpandedEvent(null);
  };

  return (
    <div>
      <div className="px-4 space-y-4 pb-8 pt-4">

      <InsightList />

      {/* Event list */}
      {todayEvents.length === 0 ? (
        <div className="rounded-2xl bg-[#111111] border border-white/[0.12] p-6 text-center">
          <p className="text-white/40 text-sm">Brak zaplanowanych treningów na dziś</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[11px] uppercase tracking-widest text-white/40">Dziś</p>
          {todayEvents.map((event) => {
            const isExpanded = expandedEvent?.id === event.id;
            const isDone = event.status === "completed";
            const isSkipped = event.status === "skipped";
            const isGym = event.eventType === "gym";
            const isFloorball = event.eventType.startsWith("floorball");
            const isRunning = event.eventType === "running";

            return (
              <div key={event.id}>
                {/* Collapsed card */}
                <button
                  onClick={() => setExpandedEvent(isExpanded ? null : event)}
                  className={cn(
                    "flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-colors",
                    isDone ? "bg-[#111111] border-[#c5e063]/25 hover:border-[#c5e063]/40"
                      : isSkipped ? "bg-[#111111] border-white/[0.08] opacity-50 hover:opacity-70"
                      : "bg-[#111111] border-white/[0.12] hover:border-white/25",
                  )}
                >
                  <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", isDone ? "bg-[#c5e063]/10" : "bg-white/5")}>
                    {isDone ? <CheckCircle2 className="h-5 w-5 text-[#c5e063]" strokeWidth={1} />
                      : isGym ? <Dumbbell className="h-5 w-5 text-white/60" strokeWidth={1} />
                      : isFloorball ? <Target className="h-5 w-5 text-white/60" strokeWidth={1} />
                      : isRunning ? <Footprints className="h-5 w-5 text-white/60" strokeWidth={1} />
                      : <Activity className="h-5 w-5 text-white/60" strokeWidth={1} />}
                  </div>
                  <div className="flex-1">
                    <p className={cn("font-semibold text-sm", isSkipped && "line-through text-white/40")}>{event.title}</p>
                    <p className="text-xs text-white/40 mt-0.5">
                      {event.time && `${event.time} · `}
                      {isDone ? "Ukończono" : isSkipped ? "Pominięto" : EVENT_LABELS[event.eventType]}
                    </p>
                  </div>
                  <ChevronDown className={cn("h-4 w-4 text-white/40 transition-transform duration-200", isExpanded && "rotate-180")} strokeWidth={1.5} />
                </button>

                {/* Expanded panel */}
                {isExpanded && (
                  <div className="mt-1">
                    <EventDetailPanel
                      event={event}
                      onClose={() => setExpandedEvent(null)}
                      onEventUpdated={() => queryClient.invalidateQueries({ queryKey: ["today-events"] })}
                      onStartSubflow={handleStartSubflow}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Wellbeing */}
      {!expandedEvent && (
        <div>
          <p className="text-[11px] uppercase tracking-widest text-white/40 mb-3">Samopoczucie</p>
          <div className="rounded-2xl bg-[#111111] border border-white/[0.12] p-4">
            <ReadinessForm initialData={todayReadiness} onComplete={() => refetchReadiness()} />
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

// ─── Zone Stats Form (unihokej + bieg) ───────────────────────
function ZoneStatsForm({ event, onComplete, onBack }: { event: CalendarEvent; onComplete: (workoutId: number) => void; onBack: () => void }) {
  const savedData = parseNotes(event.notes);
  const initialZones = savedData?.zones ?? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const initialRpe = savedData?.rpe ?? 6;
  const initialNotes = savedData?.sessionNotes ?? "";

  const [zones, setZones] = useState<Record<number, number>>(initialZones);
  const [rpe, setRpe] = useState<number>(initialRpe);
  const [notes, setNotes] = useState<string>(initialNotes);

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest<{ id: number }>("/api/workouts", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (result) => onComplete(result.id),
  });

  const totalTime = Object.values(zones).reduce((s, v) => s + (v || 0), 0);
  const isFloorball = event.eventType.startsWith("floorball");

  return (
    <div className="p-4">
      <button onClick={onBack} className="mb-4 text-xs text-white/40 hover:text-white/60 transition-colors">← Wróć</button>
      <p className="text-[11px] uppercase tracking-widest text-white/40 mb-1">{isFloorball ? "Unihokej" : "Bieg"}</p>
      <h2 className="mb-5 text-xl font-semibold">{event.title}</h2>

      <div className="space-y-5">
        {/* Zone time inputs */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-white/40">Czas w strefach (min)</label>
            <span className="text-[10px] text-white/30">{totalTime} min łącznie</span>
          </div>
          <div className="space-y-2">
            {HR_ZONES.map((z) => (
              <div key={z.id} className="grid grid-cols-[1fr_80px] items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: z.color }} />
                  <span className="text-xs font-semibold" style={{ color: z.color }}>{z.label}</span>
                  <span className="text-[10px] text-white/30">{z.desc}</span>
                </div>
                <input
                  type="number" min={0} placeholder="0"
                  value={zones[z.id] || ""}
                  onChange={(e) => setZones((s) => ({ ...s, [z.id]: parseFloat(e.target.value) || 0 }))}
                  className="w-full rounded-xl border border-white/[0.12] bg-[#111111] px-2 py-2 text-center text-sm focus:outline-none focus:border-white/25"
                />
              </div>
            ))}
          </div>
        </div>

        {/* RPE */}
        <div>
          <SliderField label="RPE — odczuwany wysiłek" value={rpe} min={1} max={10} onChange={setRpe} />
          <p className="mt-1 text-[10px] text-white/20">{rpeLabel(rpe)}</p>
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notatki (samopoczucie, kontuzje...)"
          rows={2}
          className="w-full rounded-2xl border border-white/[0.12] bg-[#111111] px-4 py-3 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/25 resize-none"
        />

        <button
          onClick={() => mutation.mutate({
            date: todayStr(),
            workoutType: isFloorball ? "floorball" : "running",
            calendarEventId: event.id,
            rpe,
            notes: notes || null,
            hrZoneDistribution: zones,
            ...(isFloorball && { floorballType: event.eventType === "floorball_match" ? "match" : "training" }),
            eventNotes: JSON.stringify({ type: "zone_stats", zones, rpe, sessionNotes: notes }),
          })}
          disabled={mutation.isPending}
          className={btnPrimary}
        >
          {mutation.isPending ? "Zapisuję..." : "Zapisz trening"}
        </button>
      </div>
    </div>
  );
}

// ─── Gym Quick Complete ───────────────────────────────────────
function QuickCompleteForm({ event, onComplete, onBack }: { event: CalendarEvent; onComplete: (workoutId: number) => void; onBack: () => void }) {
  const savedData = parseNotes(event.notes);
  const [rpe, setRpe] = useState<number>(savedData?.rpe ?? 6);
  const [notes, setNotes] = useState<string>(savedData?.sessionNotes ?? "");

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest<{ id: number }>("/api/workouts", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (result) => onComplete(result.id),
  });

  return (
    <div className="p-4">
      <button onClick={onBack} className="mb-4 text-xs text-white/40 hover:text-white/60 transition-colors">← Wróć</button>
      <p className="text-[11px] uppercase tracking-widest text-white/40 mb-1">Siłownia</p>
      <h2 className="mb-5 text-xl font-semibold">{event.title}</h2>

      <div className="space-y-5">
        <div>
          <SliderField label="RPE — odczuwany wysiłek" value={rpe} min={1} max={10} onChange={setRpe} />
          <p className="mt-1 text-[10px] text-white/20">{rpeLabel(rpe)}</p>
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notatki po treningu..."
          rows={3}
          className="w-full rounded-2xl border border-white/[0.12] bg-[#111111] px-4 py-3 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/25 resize-none"
        />
        <button
          onClick={() => mutation.mutate({
            date: todayStr(), workoutType: "gym", calendarEventId: event.id, rpe, notes: notes || null,
            eventNotes: JSON.stringify({ type: "gym_quick", rpe, sessionNotes: notes }),
          })}
          disabled={mutation.isPending}
          className={btnPrimary}
        >
          {mutation.isPending ? "Zapisuję..." : "Zapisz trening"}
        </button>
      </div>
    </div>
  );
}

// ─── Gym Workout (exercise checklist) ────────────────────────
function GymWorkout({ event, onComplete, onBack }: { event: CalendarEvent; onComplete: (workoutId: number) => void; onBack: () => void }) {
  // Parse exercises from event description JSON
  const descPlan = (() => { try { const d = JSON.parse(event.description || "{}"); return d.plan ?? null; } catch { return null; } })();
  // Load saved state from event notes
  const savedData = parseNotes(event.notes);
  const savedState = savedData?.exerciseState ?? {};

  const [exerciseState, setExerciseState] = useState<Record<number, { completed: boolean; notes: string }>>(savedState);
  const [rpe, setRpe] = useState<number>(savedData?.rpe ?? 6);
  const [notes, setNotes] = useState<string>(savedData?.sessionNotes ?? "");

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest<{ id: number }>("/api/workouts", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (result) => onComplete(result.id),
  });

  // No plan in description → fall back to quick form
  if (!descPlan) {
    return <QuickCompleteForm event={event} onComplete={onComplete} onBack={onBack} />;
  }

  const completedCount = Object.values(exerciseState).filter((s) => s.completed).length;

  const handleSave = () => {
    mutation.mutate({
      date: todayStr(),
      workoutType: "gym",
      calendarEventId: event.id,
      rpe,
      notes: notes || null,
      eventNotes: JSON.stringify({ type: "gym_log", exerciseState, rpe, sessionNotes: notes }),
    });
  };

  return (
    <div className="p-4">
      <button onClick={onBack} className="mb-4 text-xs text-white/40 hover:text-white/60 transition-colors">← Wróć</button>
      <p className="text-[11px] uppercase tracking-widest text-white/40 mb-1">Siłownia</p>
      <h2 className="mb-1 text-xl font-semibold">{event.title}</h2>
      <p className="text-xs text-white/30 mb-5">{completedCount}/{descPlan.length} ćwiczeń</p>

      <div className="space-y-3">
        {descPlan.map((ex: any, i: number) => {
          const state = exerciseState[i] || { completed: false, notes: "" };
          return (
            <div key={i} className={cn("rounded-2xl bg-[#0e0e0e] border border-white/[0.10] p-4 transition-colors", state.completed && "border-[#c5e063]/30")}>
              <div className="flex items-start gap-3">
                <button
                  onClick={() => setExerciseState((s) => ({ ...s, [i]: { ...state, completed: !state.completed } }))}
                  className={cn("mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border transition-colors", state.completed ? "border-[#c5e063] bg-[#c5e063] text-black" : "border-white/20")}
                >
                  {state.completed && <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} />}
                </button>
                <div className="flex-1">
                  <p className={cn("font-medium text-sm", state.completed && "text-[#c5e063]")}>{ex.name}</p>
                  <p className="text-xs text-white/40 mt-0.5">
                    {ex.sets} serie · {ex.reps} powt.{ex.weight ? ` · ${ex.weight}` : ""}
                  </p>
                  {ex.notes && <p className="mt-1 text-xs text-white/20">{ex.notes}</p>}
                </div>
              </div>
              <input
                type="text"
                value={state.notes}
                onChange={(e) => setExerciseState((s) => ({ ...s, [i]: { ...state, notes: e.target.value } }))}
                placeholder="Notatki do ćwiczenia..."
                className="mt-3 w-full rounded-xl border border-white/[0.08] bg-black/40 px-3 py-2 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/20"
              />
            </div>
          );
        })}
      </div>

      <div className="mt-6 space-y-4">
        <div>
          <SliderField label="RPE — odczuwany wysiłek" value={rpe} min={1} max={10} onChange={setRpe} />
          <p className="mt-1 text-[10px] text-white/20">{rpeLabel(rpe)}</p>
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notatki po treningu..."
          rows={2}
          className="w-full rounded-2xl border border-white/[0.12] bg-[#111111] px-4 py-3 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/25 resize-none"
        />
        <button onClick={handleSave} disabled={mutation.isPending} className={btnPrimary}>
          {mutation.isPending ? "Zapisuję..." : "Zakończ trening"}
        </button>
      </div>
    </div>
  );
}

// ─── Readiness Form ───────────────────────────────────────────
function ReadinessForm({ initialData, onComplete }: { initialData?: any; onComplete: () => void }) {
  const [isEditing, setIsEditing] = useState(!initialData);
  const [savedAt, setSavedAt] = useState<string | null>(null);
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
    mutationFn: (data: any) => apiRequest("/api/readiness", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { setIsEditing(false); setSavedAt(format(new Date(), "HH:mm")); onComplete(); },
  });

  const update = (key: string, value: number | string) => {
    if (isEditing) setForm((f) => ({ ...f, [key]: value }));
  };

  return (
    <div>
      <div className="space-y-5">
        <SliderField label="Training Readiness" value={form.trainingReadiness} disabled={!isEditing} min={0} max={100} onChange={(v) => update("trainingReadiness", v)} />
        <SliderField label="Body Battery" value={form.bodyBattery} disabled={!isEditing} min={0} max={100} onChange={(v) => update("bodyBattery", v)} />
        <SliderField label="Wynik snu" value={form.sleepScore} disabled={!isEditing} min={0} max={100} onChange={(v) => update("sleepScore", v)} />
        <div>
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-white/40">Status HRV</label>
          <div className="flex gap-2">
            {["low", "balanced", "high"].map((s) => (
              <button key={s} disabled={!isEditing} onClick={() => update("hrvStatus", s)}
                className={cn("flex-1 rounded-full py-2.5 text-xs font-semibold tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                  form.hrvStatus === s
                    ? s === "low" ? "bg-red-500/80 text-white" : s === "balanced" ? "bg-white/90 text-black" : "bg-[#c5e063] text-black"
                    : "border border-white/15 bg-transparent text-white/40"
                )}
              >
                {s === "low" ? "Niski" : s === "balanced" ? "Zrównoważony" : "Wysoki"}
              </button>
            ))}
          </div>
        </div>
        <SliderField label="Ból / sztywność (1–10)" value={form.painLevel} disabled={!isEditing} min={1} max={10} onChange={(v) => update("painLevel", v)} color={form.painLevel >= 7 ? "red" : form.painLevel >= 4 ? "yellow" : "green"} />
        <SliderField label="Stres psychiczny (1–10)" value={form.stressLevel} disabled={!isEditing} min={1} max={10} onChange={(v) => update("stressLevel", v)} />
      </div>

      {form.painLevel >= 7 && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl bg-red-500/10 border border-red-500/20 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" strokeWidth={1} />
          <p className="text-sm text-red-300 font-light">Wysoki poziom bólu — uważaj podczas treningu</p>
        </div>
      )}

      <div className="mt-6">
        {!isEditing
          ? <button onClick={() => setIsEditing(true)} className={btnSecondary}>Edytuj</button>
          : <button onClick={() => mutation.mutate({ ...form })} disabled={mutation.isPending} className={btnPrimary}>
              {mutation.isPending ? "Zapisuję..." : "Zapisz gotowość na dziś"}
            </button>
        }
      </div>

      {(() => {
        const t = initialData?.createdAt ? format(new Date(initialData.createdAt), "HH:mm") : savedAt;
        return t ? <p className="mt-3 text-center text-xs text-white/30">Samopoczucie zapisane o {t}</p> : null;
      })()}
    </div>
  );
}

// ─── Slider Field ─────────────────────────────────────────────
function SliderField({ label, value, min, max, disabled, onChange, color }: {
  label: string; value: number; min: number; max: number;
  disabled?: boolean; onChange: (v: number) => void; color?: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-[11px] font-semibold uppercase tracking-widest text-white/40">{label}</label>
        <input
          type="number" value={value} min={min} max={max} disabled={disabled}
          onChange={(e) => { const v = Math.min(max, Math.max(min, parseInt(e.target.value) || min)); onChange(v); }}
          className={cn("w-14 text-right text-sm font-semibold bg-transparent focus:outline-none",
            disabled ? "pointer-events-none" : "border-b border-white/20 focus:border-white/50",
            color === "red" ? "text-red-400" : color === "yellow" ? "text-yellow-400" : "text-white"
          )}
        />
      </div>
      <input type="range" min={min} max={max} disabled={disabled} value={value}
        onChange={(e) => {
          const parsed = parseInt(e.target.value);
          const v = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : min;
          onChange(v);
        }}
        className={cn("w-full accent-white", disabled && "opacity-30 cursor-not-allowed")}
      />
    </div>
  );
}
