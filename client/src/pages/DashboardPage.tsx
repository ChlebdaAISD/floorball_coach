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
        "Ból": r.painLevel ? r.painLevel * 10 : null,
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
      <div className="flex h-[100dvh] items-center justify-center bg-black">
        <Loader2 size={20} strokeWidth={1} className="animate-spin text-white/40" />
      </div>
    );
  }

  const tooltipStyle = {
    contentStyle: {
      backgroundColor: "#111111",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 12,
      color: "#fff",
    },
    labelStyle: { color: "rgba(255,255,255,0.4)", marginBottom: 4 },
    itemStyle: { fontSize: 12, padding: "2px 0" },
  };

  return (
    <div className="flex-1 overflow-y-auto space-y-6 px-6 py-8 bg-black min-h-[100dvh] text-white">
      <div className="mt-4 mb-8">
        <p className="text-[11px] uppercase tracking-widest text-white/40 mb-1">Przegląd</p>
        <h1 className="text-2xl font-semibold">Statystyki</h1>
      </div>

      {/* Readiness Trend */}
      <div className="rounded-2xl bg-[#111111] border border-white/[0.12] p-5">
        <h3 className="mb-6 text-[11px] font-semibold tracking-widest text-white/40 uppercase">
          Gotowość (30 dni)
        </h3>
        {readinessData.length === 0 ? (
          <p className="py-8 text-center text-sm text-white/20 font-light">
            Brak danych — uzupełnij gotowość przed treningiem
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={readinessData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} tickMargin={10} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} tickMargin={10} axisLine={false} tickLine={false} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 20 }} iconType="circle" />
              <Line type="monotone" dataKey="Training Readiness" stroke="#6b7cff" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Body Battery" stroke="rgba(255,255,255,0.5)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Ból" stroke="#ef4444" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Weekly Load */}
      <div className="rounded-2xl bg-[#111111] border border-white/[0.12] p-5">
        <h3 className="mb-6 text-[11px] font-semibold tracking-widest text-white/40 uppercase">
          Treningi tygodniowo
        </h3>
        {weeklyData.length === 0 ? (
          <p className="py-8 text-center text-sm text-white/20 font-light">
            Brak danych — zapisz treningi żeby zobaczyć statystyki
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} tickMargin={10} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} tickMargin={10} axisLine={false} tickLine={false} />
              <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 20 }} iconType="circle" />
              <Bar dataKey="gym" name="Siłownia" fill="#ffffff" stackId="a" radius={[0, 0, 0, 0]} />
              <Bar dataKey="floorball" name="Unihokej" fill="rgba(255,255,255,0.3)" stackId="a" radius={[0, 0, 0, 0]} />
              <Bar dataKey="running" name="Bieg" fill="rgba(255,255,255,0.6)" stackId="a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Tonnage */}
      {weeklyData.some((w) => w.tonnage > 0) && (
        <div className="rounded-2xl bg-[#111111] border border-white/[0.12] p-5 mb-8">
          <h3 className="mb-6 text-[11px] font-semibold tracking-widest text-white/40 uppercase">
            Tonaż siłowy (kg)
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={weeklyData.filter((w) => w.tonnage > 0)}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} tickMargin={10} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} tickMargin={10} axisLine={false} tickLine={false} />
              <Tooltip {...tooltipStyle} formatter={(value: number) => [`${value.toFixed(0)} kg`, "Tonaż"]} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Bar dataKey="tonnage" name="Tonaż" fill="#6b7cff" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
