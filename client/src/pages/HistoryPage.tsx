import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, EVENT_COLORS, cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import {
  Dumbbell,
  Target,
  Footprints,
  ChevronRight,
  Loader2,
  Settings,
} from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";
import { useSetTopNav } from "@/contexts/TopNavContext";

type WorkoutType = "all" | "gym" | "floorball" | "running";

export default function HistoryPage() {
  const [filter, setFilter] = useState<WorkoutType>("all");
  const { openSettings } = useSettings();

  useSetTopNav(
    () => ({
      label: "Twoje treningi",
      title: "Historia",
      right: (
        <button
          onClick={openSettings}
          className="rounded-full border border-white/20 p-3 text-white/50 hover:text-white hover:border-white/40 transition-colors"
        >
          <Settings size={18} strokeWidth={1} />
        </button>
      ),
    }),
    [openSettings],
  );

  const { data: workouts = [], isLoading } = useQuery<any[]>({
    queryKey: ["workouts", filter],
    queryFn: () =>
      apiRequest(
        `/api/workouts?limit=50${filter !== "all" ? `&type=${filter}` : ""}`,
      ),
  });

  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: detail } = useQuery({
    queryKey: ["workout-detail", expandedId],
    queryFn: () => apiRequest<any>(`/api/workouts/${expandedId}`),
    enabled: !!expandedId,
  });

  return (
    <div className="bg-black text-white">
      <div className="px-4 pt-4">
      {/* Filter Chips */}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {(["all", "gym", "floorball", "running"] as WorkoutType[]).map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={cn(
              "whitespace-nowrap rounded-full px-5 py-2.5 text-xs font-semibold tracking-wide transition-colors border",
              filter === t
                ? "bg-white text-black border-white"
                : "bg-transparent border-white/[0.15] text-white/40 hover:text-white hover:border-white/30"
            )}
          >
            {t === "all" ? "Wszystkie" : t === "gym" ? "Siłownia" : t === "floorball" ? "Unihokej" : "Bieg"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 size={18} strokeWidth={1} className="animate-spin text-white/30" />
        </div>
      ) : workouts.length === 0 ? (
        <p className="py-12 text-center text-sm font-light text-white/20">
          Możesz rozpocząć swój pierwszy trening w panelu Głównym.
        </p>
      ) : (
        <div className="space-y-3 pb-32">
          {workouts.map((w: any) => {
            const isExpanded = expandedId === w.id;
            return (
              <div key={w.id} className="rounded-2xl bg-[#111111] border border-white/[0.12] overflow-hidden transition-colors hover:border-white/20">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : w.id)}
                  className="flex w-full items-center gap-4 p-5 text-left"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#c5e063]/10">
                    {w.workoutType === "gym" && <Dumbbell size={20} strokeWidth={1} className="text-[#c5e063]" />}
                    {w.workoutType === "floorball" && <Target size={20} strokeWidth={1} className="text-[#c5e063]" />}
                    {w.workoutType === "running" && <Footprints size={20} strokeWidth={1} className="text-[#c5e063]" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white">
                      {w.workoutType === "gym"
                        ? "Siłownia"
                        : w.workoutType === "floorball"
                          ? w.floorballType === "match"
                            ? "Mecz"
                            : "Trening drużynowy"
                          : "Bieg"}
                    </p>
                    <p className="text-[11px] text-white/30 font-light mt-1 tracking-wide">
                      {format(parseISO(w.date), "EEEE, d MMM", { locale: pl })}
                      {w.durationMinutes && ` · ${w.durationMinutes} min`}
                      {w.totalTonnage && ` · ${w.totalTonnage.toFixed(0)} kg`}
                      {w.distanceKm && ` · ${w.distanceKm} km`}
                      {w.rpe && ` · RPE ${w.rpe}`}
                    </p>
                  </div>
                  <ChevronRight
                    size={18}
                    strokeWidth={1}
                    className={cn(
                      "text-white/20 transition-transform duration-300",
                      isExpanded && "rotate-90",
                    )}
                  />
                </button>

                {isExpanded && detail && (
                  <div className="border-t border-white/[0.06] bg-black/30 p-5">
                    {detail.notes && (
                      <p className="mb-4 text-sm font-light text-white/30 italic">
                        "{detail.notes}"
                      </p>
                    )}

                    {w.workoutType === "gym" && detail.exerciseLogs?.length > 0 && (
                      <div className="space-y-3">
                        {detail.exerciseLogs.map((ex: any) => (
                          <div
                            key={ex.id}
                            className="flex items-start gap-4 text-sm"
                          >
                            <span
                              className={cn(
                                "mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0",
                                ex.completed ? "bg-[#c5e063]" : "bg-white/20",
                              )}
                            />
                            <div className="flex-1 flex flex-col gap-0.5">
                              <span className={cn("font-medium text-sm", ex.completed ? "text-white" : "text-white/30 line-through")}>
                                {ex.exerciseName}
                              </span>
                              <div className="flex items-center gap-2 text-[11px] font-light tracking-wide text-white/30">
                                <span>{ex.plannedSets}×{ex.plannedReps}</span>
                                {ex.plannedWeight ? <span>{ex.plannedWeight} kg</span> : null}
                                {ex.wasModifiedByAi && (
                                  <span className="bg-[#c5e063] text-black text-[9px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5">AI</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {(w.workoutType === "floorball" || w.workoutType === "running") && (
                      <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-sm pt-2">
                        {w.avgHr && (
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-1">Śr. tętno</span>
                            <span className="text-white font-medium">{w.avgHr} bpm</span>
                          </div>
                        )}
                        {w.maxHr && (
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-1">Max tętno</span>
                            <span className="text-white font-medium">{w.maxHr} bpm</span>
                          </div>
                        )}
                        {w.avgPace && (
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-1">Tempo</span>
                            <span className="text-white font-medium">{w.avgPace} /km</span>
                          </div>
                        )}
                        {w.cadence && (
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-1">Kadencja</span>
                            <span className="text-white font-medium">{w.cadence}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}
