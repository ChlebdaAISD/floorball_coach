import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { X, CheckCircle2 } from "lucide-react";
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

export type SubflowStep = "zone-stats" | "gym-details" | "gym-quick";

interface Props {
  event: CalendarEvent;
  onClose: () => void;
  onEventUpdated: () => void;
  onStartSubflow?: (step: SubflowStep, event: CalendarEvent) => void;
  mode?: "full" | "view-only";
}

export function EventDetailPanel({ event, onClose, onEventUpdated, onStartSubflow, mode = "full" }: Props) {
  const isDone = event.status === "completed";
  const isPlanned = event.status === "planned";
  const isSkipped = event.status === "skipped";
  const isGym = event.eventType === "gym";
  const isFloorball = event.eventType.startsWith("floorball");
  const isRunning = event.eventType === "running";
  const isSimple = !isGym && !isFloorball && !isRunning;
  const savedData = parseNotes(event.notes);
  const gymPlan = (() => {
    if (!isGym || !event.description) return null;
    try {
      const d = JSON.parse(event.description);
      return Array.isArray(d.plan) ? d.plan : null;
    } catch {
      return null;
    }
  })();

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
        <button onClick={onClose} className="p-1 text-white/40 hover:text-white/70 transition-colors">
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>

      {event.description && !event.description.startsWith("{") && (
        <p className="text-sm text-white/60 leading-relaxed">{event.description}</p>
      )}

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

  return null;
}
