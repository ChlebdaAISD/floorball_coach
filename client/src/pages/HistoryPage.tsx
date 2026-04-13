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
} from "lucide-react";

type WorkoutType = "all" | "gym" | "floorball" | "running";

export default function HistoryPage() {
  const [filter, setFilter] = useState<WorkoutType>("all");

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
    <div className="p-4">
      <h1 className="mb-4 text-xl font-bold">Historia treningów</h1>

      {/* Filter */}
      <div className="mb-4 flex gap-2">
        {(["all", "gym", "floorball", "running"] as WorkoutType[]).map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium",
              filter === t ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400",
            )}
          >
            {t === "all" ? "Wszystkie" : t === "gym" ? "Siłownia" : t === "floorball" ? "Unihokej" : "Bieg"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
        </div>
      ) : workouts.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          Brak zapisanych treningów
        </p>
      ) : (
        <div className="space-y-2">
          {workouts.map((w: any) => {
            const isExpanded = expandedId === w.id;
            return (
              <div key={w.id}>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : w.id)}
                  className="flex w-full items-center gap-3 rounded-xl bg-slate-900 p-4 text-left"
                >
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg",
                      w.workoutType === "gym"
                        ? "bg-blue-500/20"
                        : w.workoutType === "floorball"
                          ? "bg-green-500/20"
                          : "bg-orange-500/20",
                    )}
                  >
                    {w.workoutType === "gym" && <Dumbbell className="h-5 w-5 text-blue-400" />}
                    {w.workoutType === "floorball" && <Target className="h-5 w-5 text-green-400" />}
                    {w.workoutType === "running" && <Footprints className="h-5 w-5 text-orange-400" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {w.workoutType === "gym"
                        ? "Siłownia"
                        : w.workoutType === "floorball"
                          ? w.floorballType === "match"
                            ? "Mecz"
                            : "Trening drużynowy"
                          : "Bieg"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {format(parseISO(w.date), "EEEE, d MMM", { locale: pl })}
                      {w.durationMinutes && ` · ${w.durationMinutes} min`}
                      {w.totalTonnage && ` · ${w.totalTonnage.toFixed(0)} kg`}
                      {w.distanceKm && ` · ${w.distanceKm} km`}
                      {w.rpe && ` · RPE ${w.rpe}`}
                    </p>
                  </div>
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 text-slate-600 transition-transform",
                      isExpanded && "rotate-90",
                    )}
                  />
                </button>

                {isExpanded && detail && (
                  <div className="mt-1 rounded-xl bg-slate-900/50 p-4">
                    {detail.notes && (
                      <p className="mb-3 text-sm text-slate-400">
                        "{detail.notes}"
                      </p>
                    )}

                    {w.workoutType === "gym" && detail.exerciseLogs?.length > 0 && (
                      <div className="space-y-2">
                        {detail.exerciseLogs.map((ex: any) => (
                          <div
                            key={ex.id}
                            className="flex items-center gap-2 text-sm"
                          >
                            <span
                              className={cn(
                                "h-2 w-2 rounded-full",
                                ex.completed ? "bg-green-500" : "bg-slate-600",
                              )}
                            />
                            <span className={cn(ex.completed ? "text-slate-200" : "text-slate-500 line-through")}>
                              {ex.exerciseName}
                            </span>
                            <span className="text-xs text-slate-500">
                              {ex.plannedSets}×{ex.plannedReps}
                              {ex.plannedWeight ? ` @ ${ex.plannedWeight}kg` : ""}
                            </span>
                            {ex.wasModifiedByAi && (
                              <span className="text-xs text-yellow-400">AI</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {(w.workoutType === "floorball" || w.workoutType === "running") && (
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {w.avgHr && (
                          <div>
                            <span className="text-slate-500">Śr. tętno:</span>{" "}
                            {w.avgHr} bpm
                          </div>
                        )}
                        {w.maxHr && (
                          <div>
                            <span className="text-slate-500">Max tętno:</span>{" "}
                            {w.maxHr} bpm
                          </div>
                        )}
                        {w.avgPace && (
                          <div>
                            <span className="text-slate-500">Tempo:</span>{" "}
                            {w.avgPace} /km
                          </div>
                        )}
                        {w.cadence && (
                          <div>
                            <span className="text-slate-500">Kadencja:</span>{" "}
                            {w.cadence}
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
  );
}
