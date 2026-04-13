import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { apiRequest } from "@/lib/utils";
import { format, startOfWeek, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { useMemo } from "react";
import { Loader2 } from "lucide-react";

export default function DashboardPage() {
  const { data: readiness = [], isLoading: loadingR } = useQuery<any[]>({
    queryKey: ["dashboard-readiness"],
    queryFn: () => apiRequest("/api/dashboard/readiness?days=30"),
  });

  const { data: workouts = [], isLoading: loadingW } = useQuery<any[]>({
    queryKey: ["dashboard-tonnage"],
    queryFn: () => apiRequest("/api/dashboard/tonnage?weeks=8"),
  });

  const readinessData = useMemo(
    () =>
      readiness.map((r: any) => ({
        date: format(parseISO(r.date), "d/MM"),
        "Training Readiness": r.trainingReadiness,
        "Body Battery": r.bodyBattery,
        "Ból": r.painLevel ? r.painLevel * 10 : null, // Scale to 0-100 for same axis
      })),
    [readiness],
  );

  const weeklyData = useMemo(() => {
    const weeks = new Map<
      string,
      { gym: number; floorball: number; running: number; tonnage: number }
    >();

    for (const w of workouts) {
      const weekKey = format(
        startOfWeek(parseISO(w.date), { weekStartsOn: 1 }),
        "d/MM",
      );
      if (!weeks.has(weekKey)) {
        weeks.set(weekKey, { gym: 0, floorball: 0, running: 0, tonnage: 0 });
      }
      const week = weeks.get(weekKey)!;
      if (w.workoutType === "gym") {
        week.gym++;
        week.tonnage += w.totalTonnage || 0;
      } else if (w.workoutType === "floorball") {
        week.floorball++;
      } else if (w.workoutType === "running") {
        week.running++;
      }
    }

    return Array.from(weeks.entries()).map(([week, data]) => ({
      week,
      ...data,
    }));
  }, [workouts]);

  const isLoading = loadingR || loadingW;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-xl font-bold">Statystyki</h1>

      {/* Readiness Trend */}
      <div className="rounded-xl bg-slate-900 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">
          Gotowość (30 dni)
        </h3>
        {readinessData.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-600">
            Brak danych — uzupełnij gotowość przed treningiem
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={readinessData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
                labelStyle={{ color: "#94a3b8" }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="Training Readiness" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Body Battery" stroke="#22c55e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Ból" stroke="#ef4444" strokeWidth={2} dot={false} strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Weekly Load */}
      <div className="rounded-xl bg-slate-900 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">
          Treningi tygodniowo
        </h3>
        {weeklyData.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-600">
            Brak danych — zapisz treningi żeby zobaczyć statystyki
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
                labelStyle={{ color: "#94a3b8" }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="gym" name="Siłownia" fill="#3b82f6" stackId="a" radius={[0, 0, 0, 0]} />
              <Bar dataKey="floorball" name="Unihokej" fill="#22c55e" stackId="a" radius={[0, 0, 0, 0]} />
              <Bar dataKey="running" name="Bieg" fill="#f97316" stackId="a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Tonnage */}
      {weeklyData.some((w) => w.tonnage > 0) && (
        <div className="rounded-xl bg-slate-900 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">
            Tonaż siłowy (kg)
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weeklyData.filter((w) => w.tonnage > 0)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
                formatter={(value: number) => [`${value.toFixed(0)} kg`, "Tonaż"]}
              />
              <Bar dataKey="tonnage" name="Tonaż" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
