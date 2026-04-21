import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { X, CheckCircle2, Pencil } from "lucide-react";
import { cn, apiRequest, EVENT_LABELS } from "@/lib/utils";
import type { CalendarEvent } from "@shared/schema";
import { buttonVariants } from "@/components/ui/Button";

export const HR_ZONES = [
  { id: 1, label: "Z1", desc: "50–60% · Regeneracja",     color: "#60a5fa" },
  { id: 2, label: "Z2", desc: "60–70% · Aerobowa baza",   color: "#34d399" },
  { id: 3, label: "Z3", desc: "70–80% · Aerobowa",        color: "#fbbf24" },
  { id: 4, label: "Z4", desc: "80–90% · Próg anaerobowy", color: "#f97316" },
  { id: 5, label: "Z5", desc: "90–100% · Maksymalny",     color: "#f87171" },
];

const btnPrimary = cn(buttonVariants({ variant: "primary", size: "md" }), "w-full");
const btnSecondary = cn(buttonVariants({ variant: "secondary", size: "md" }), "w-full");

function parseNotes(notes: string | null | undefined): Record<string, any> | null {
  if (!notes) return null;
  try { return JSON.parse(notes); } catch { return null; }
}

export type SubflowStep = "zone-stats" | "gym-details" | "gym-quick" | "simple-stats";

interface Props {
  event: CalendarEvent;
  onClose: () => void;
  onEventUpdated: () => void;
  onStartSubflow?: (step: SubflowStep, event: CalendarEvent) => void;
  onEdit?: (event: CalendarEvent) => void;
  mode?: "full" | "view-only";
}

export function EventDetailPanel({ event, onClose, onEventUpdated, onStartSubflow, onEdit, mode = "full" }: Props) {
  const isDone = event.status === "completed";
  const isPlanned = event.status === "planned";
  const isSkipped = event.status === "skipped";
  const isGym = event.eventType === "gym";
  const isFloorball = event.eventType.startsWith("floorball");
  const isRunning = event.eventType === "running";
  const isSwimming = event.eventType === "swimming";
  const isHomeExercises = event.eventType === "home_exercises";
  const isSimpleTraining = isSwimming || isHomeExercises;
  const isSimple = !isGym && !isFloorball && !isRunning && !isSimpleTraining;
  const savedData = parseNotes(event.notes);
  const parsedDescription = (() => {
    if (!event.description) return null;
    try {
      return JSON.parse(event.description) as Record<string, any>;
    } catch {
      return null;
    }
  })();
  const gymPlan =
    isGym && parsedDescription && Array.isArray(parsedDescription.plan)
      ? parsedDescription.plan
      : null;
  const trainingDetails =
    parsedDescription &&
    !gymPlan &&
    (parsedDescription.warmup ||
      (Array.isArray(parsedDescription.main) && parsedDescription.main.length > 0) ||
      parsedDescription.cooldown ||
      parsedDescription.notes)
      ? parsedDescription
      : null;
  const plainDescription =
    event.description && !parsedDescription && !event.description.startsWith("{")
      ? event.description
      : null;

  const [noteDraft, setNoteDraft] = useState<string>(event.notes ?? "");
  const [showFizjoPrompt, setShowFizjoPrompt] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiRequest(`/api/calendar/events/${event.id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => onEventUpdated(),
  });

  const handleSkip = () =>
    updateMutation.mutate({ status: "skipped", notes: noteDraft || event.notes || null });

  const handleSimpleComplete = () =>
    updateMutation.mutate({ status: "completed", notes: noteDraft || event.notes || null });

  const startSubflow = (step: SubflowStep) => {
    onStartSubflow?.(step, event);
  };

  const showActions = mode === "full" && !!onStartSubflow;

  return (
    <div className="rounded-2xl bg-[#111111] border border-white/[0.18] p-4 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-sm">{event.title}</p>
          <p className="text-xs text-white/40 mt-0.5">{EVENT_LABELS[event.eventType]}</p>
        </div>
        <div className="flex items-center gap-1">
          {onEdit && event.status === "planned" && (
            <button
              onClick={() => onEdit(event)}
              className="p-1 text-white/40 hover:text-white/70 transition-colors"
              aria-label="Edytuj wydarzenie"
            >
              <Pencil size={16} strokeWidth={1.5} />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 text-white/40 hover:text-white/70 transition-colors"
            aria-label="Zamknij"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {plainDescription && (
        <p className="text-sm text-white/60 leading-relaxed">{plainDescription}</p>
      )}

      {trainingDetails && <TrainingDetailsBlock details={trainingDetails} />}

      {gymPlan && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-widest text-white/40">Plan treningu</p>
          <div className="space-y-2">
            {gymPlan.map((ex: any, i: number) => (
              <div key={i} className="rounded-xl bg-black/40 border border-white/[0.08] p-3">
                <p className="font-medium text-sm text-white">{ex.name}</p>
                <p className="text-xs text-white/40 mt-0.5">
                  {ex.sets} serie · {ex.reps} powt.{ex.weight ? ` · ${ex.weight}` : ""}
                </p>
                {ex.notes && <p className="mt-1 text-xs text-white/30">{ex.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {isDone && savedData && <CompletionSummary data={savedData} />}

      {isDone && isSimple && event.notes && !savedData && (
        <p className="text-xs text-white/40 italic">"{event.notes}"</p>
      )}

      {showActions && isPlanned && isSimple && !showFizjoPrompt && (
        <div>
          <label className="mb-1.5 block text-[11px] uppercase tracking-widest text-white/40">Komentarz</label>
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Dodaj notatki..."
            rows={2}
            className="w-full rounded-xl border border-white/[0.12] bg-black/40 px-3 py-2 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/25 resize-none"
          />
        </div>
      )}

      {showActions && isPlanned && isSimple && !showFizjoPrompt && (
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (!noteDraft.trim()) setShowFizjoPrompt(true);
              else handleSimpleComplete();
            }}
            disabled={updateMutation.isPending}
            className={btnPrimary}
          >
            Zakończono
          </button>
          <button onClick={handleSkip} disabled={updateMutation.isPending} className={btnSecondary}>
            Niezrealizowano
          </button>
        </div>
      )}

      {showActions && isPlanned && isSimple && showFizjoPrompt && (
        <div className="space-y-3">
          <p className="text-sm text-white/60">Chcesz dodać notatkę z wizyty?</p>
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Np. zakres ruchu, ćwiczenia do domu..."
            rows={3}
            autoFocus
            className="w-full rounded-xl border border-white/[0.12] bg-black/40 px-3 py-2 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/25 resize-none"
          />
          <div className="flex gap-2">
            <button onClick={handleSimpleComplete} disabled={updateMutation.isPending} className={btnPrimary}>
              Zapisz z notatką
            </button>
            <button
              onClick={() => {
                setNoteDraft("");
                updateMutation.mutate({ status: "completed", notes: null });
              }}
              disabled={updateMutation.isPending}
              className={btnSecondary}
            >
              Bez notatki
            </button>
          </div>
        </div>
      )}

      {showActions && isPlanned && isFloorball && (
        <div className="flex gap-2">
          <button onClick={() => startSubflow("zone-stats")} className={btnPrimary}>
            Zakończono
          </button>
          <button onClick={handleSkip} disabled={updateMutation.isPending} className={btnSecondary}>
            Niezrealizowano
          </button>
        </div>
      )}

      {showActions && isPlanned && isGym && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <button onClick={() => startSubflow("gym-quick")} className={btnPrimary}>
              Zakończono
            </button>
            <button onClick={handleSkip} disabled={updateMutation.isPending} className={btnSecondary}>
              Niezrealizowano
            </button>
          </div>
          <button onClick={() => startSubflow("gym-details")} className={btnSecondary}>
            Szczegóły treningu
          </button>
        </div>
      )}

      {showActions && isPlanned && isRunning && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <button onClick={() => startSubflow("zone-stats")} className={btnPrimary}>
              Zakończono
            </button>
            <button onClick={handleSkip} disabled={updateMutation.isPending} className={btnSecondary}>
              Niezrealizowano
            </button>
          </div>
          <button onClick={() => startSubflow("zone-stats")} className={btnSecondary}>
            Szczegóły treningu
          </button>
        </div>
      )}

      {showActions && isPlanned && isSimpleTraining && (
        <div className="flex gap-2">
          <button onClick={() => startSubflow("simple-stats")} className={btnPrimary}>
            Zakończono
          </button>
          <button onClick={handleSkip} disabled={updateMutation.isPending} className={btnSecondary}>
            Niezrealizowano
          </button>
        </div>
      )}

      {showActions && !isPlanned && (
        <button
          onClick={() => updateMutation.mutate({ status: "planned" })}
          disabled={updateMutation.isPending}
          className={btnSecondary}
        >
          Przywróć jako zaplanowane
        </button>
      )}

      {mode === "view-only" && isSkipped && (
        <p className="text-xs text-white/40 italic">Pominięto.</p>
      )}
    </div>
  );
}

function TrainingDetailsBlock({ details }: { details: Record<string, any> }) {
  const warmup = details.warmup as { duration?: string; notes?: string } | undefined;
  const main = Array.isArray(details.main) ? (details.main as Array<Record<string, any>>) : [];
  const cooldown = details.cooldown as { duration?: string; notes?: string } | undefined;
  const notes = typeof details.notes === "string" ? details.notes : null;

  const renderMainItem = (item: Record<string, any>, i: number) => {
    const kind = item.kind as string | undefined;
    let title = "";
    let subtitle = "";

    if (kind === "interval") {
      title = `${item.repeats ?? "?"}× ${item.work ?? ""}`.trim();
      subtitle = item.rest ? `Przerwa: ${item.rest}` : "";
    } else if (kind === "steady") {
      title = item.duration ?? "";
      const bits: string[] = [];
      if (item.pace) bits.push(`tempo ${item.pace}`);
      if (item.hr_zone) bits.push(`strefa ${item.hr_zone}`);
      subtitle = bits.join(" · ");
    } else if (kind === "exercise") {
      title = item.name ?? "";
      const bits: string[] = [];
      if (item.sets) bits.push(`${item.sets} serie`);
      if (item.reps) bits.push(`${item.reps} powt.`);
      subtitle = bits.join(" · ");
    } else if (kind === "freeform") {
      return (
        <div key={i} className="rounded-xl bg-black/40 border border-white/[0.08] p-3">
          <p className="whitespace-pre-wrap text-sm text-white/80">{item.text ?? ""}</p>
        </div>
      );
    } else {
      title = item.name ?? item.title ?? JSON.stringify(item);
    }

    return (
      <div key={i} className="rounded-xl bg-black/40 border border-white/[0.08] p-3">
        {title && <p className="font-medium text-sm text-white">{title}</p>}
        {subtitle && <p className="text-xs text-white/50 mt-0.5">{subtitle}</p>}
        {item.notes && <p className="mt-1 text-xs text-white/30">{item.notes}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {warmup && (warmup.duration || warmup.notes) && (
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-widest text-white/40">Rozgrzewka</p>
          <div className="rounded-xl bg-black/40 border border-white/[0.08] p-3">
            {warmup.duration && <p className="text-sm text-white">{warmup.duration}</p>}
            {warmup.notes && <p className="text-xs text-white/50 mt-0.5">{warmup.notes}</p>}
          </div>
        </div>
      )}

      {main.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-widest text-white/40">Trening</p>
          <div className="space-y-2">{main.map(renderMainItem)}</div>
        </div>
      )}

      {cooldown && (cooldown.duration || cooldown.notes) && (
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-widest text-white/40">Cooldown</p>
          <div className="rounded-xl bg-black/40 border border-white/[0.08] p-3">
            {cooldown.duration && <p className="text-sm text-white">{cooldown.duration}</p>}
            {cooldown.notes && <p className="text-xs text-white/50 mt-0.5">{cooldown.notes}</p>}
          </div>
        </div>
      )}

      {notes && <p className="text-xs text-white/40 italic">"{notes}"</p>}
    </div>
  );
}

export function CompletionSummary({ data }: { data: Record<string, any> }) {
  if (data.type === "zone_stats" && data.zones) {
    const filledZones = HR_ZONES.filter((z) => (data.zones[z.id] ?? 0) > 0);
    if (filledZones.length === 0) return null;
    return (
      <div className="space-y-1.5">
        <p className="text-[11px] uppercase tracking-widest text-white/40">Strefy tętna</p>
        <div className="flex flex-wrap gap-2">
          {filledZones.map((z) => (
            <span key={z.id} className="rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ backgroundColor: `${z.color}20`, color: z.color }}>
              {z.label} · {data.zones[z.id]} min
            </span>
          ))}
          {data.rpe && <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/60">RPE {data.rpe}</span>}
        </div>
        {data.sessionNotes && <p className="text-xs text-white/40 italic">"{data.sessionNotes}"</p>}
      </div>
    );
  }

  if (data.type === "gym_quick" || data.type === "gym_log") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {data.rpe && <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/60">RPE {data.rpe}</span>}
        {data.type === "gym_log" && data.exerciseState && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#c5e063]/10 px-2.5 py-1 text-[10px] font-semibold text-[#c5e063]">
            <CheckCircle2 size={10} strokeWidth={1.5} />
            {Object.values(data.exerciseState as Record<number, { completed: boolean }>).filter((s) => s.completed).length} ćwiczeń
          </span>
        )}
        {data.sessionNotes && <p className="w-full text-xs text-white/40 italic">"{data.sessionNotes}"</p>}
      </div>
    );
  }

  if (data.type === "simple_stats") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {data.durationMinutes && <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/60">{data.durationMinutes} min</span>}
        {data.rpe && <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/60">RPE {data.rpe}</span>}
        {data.sessionNotes && <p className="w-full text-xs text-white/40 italic">"{data.sessionNotes}"</p>}
      </div>
    );
  }

  return null;
}
