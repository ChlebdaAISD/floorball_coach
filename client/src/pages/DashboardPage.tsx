import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { apiRequest } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { useMemo } from "react";
import { Loader2, Settings } from "lucide-react";
import { TopNav } from "@/components/TopNav";
import { useSettings } from "@/contexts/SettingsContext";

export default function DashboardPage() {
  const { openSettings } = useSettings();
  const { data: readiness = [], isLoading: loadingR } = useQuery<any[]>({
    queryKey: ["dashboard-readiness"],
    queryFn: () => apiRequest("/api/dashboard/readiness?days=30"),
  });

  const { data: workouts = [], isLoading: loadingW } = useQuery<any[]>({
    queryKey: ["dashboard-tonnage"],
    queryFn: () => apiRequest("/api/dashboard/tonnage?weeks=5"),
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

  const activityTotals = useMemo(() => {
    let gym = 0, floorball = 0, running = 0;
    for (const w of workouts) {
      if (w.workoutType === "gym") gym++;
      else if (w.workoutType === "floorball") floorball++;
      else if (w.workoutType === "running") running++;
    }
    return [
      { name: "Siłownia", count: gym, fill: "#ffffff" },
      { name: "Unihokej", count: floorball, fill: "rgba(255,255,255,0.5)" },
      { name: "Bieg", count: running, fill: "rgba(255,255,255,0.7)" },
    ];
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
    <div className="bg-black text-white">
      <TopNav
        label="Przegląd"
        title="Statystyki"
        right={
          <button onClick={openSettings} className="rounded-full border border-white/20 p-3 text-white/50 hover:text-white hover:border-white/40 transition-colors">
            <Settings size={18} strokeWidth={1} />
          </button>
        }
      />

      <div className="px-4 space-y-6 pb-8">
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
              <Line type="monotone" dataKey="Training Readiness" stroke="#c5e063" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Body Battery" stroke="#60a5fa" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Ból" stroke="#ef4444" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Activity totals */}
      <div className="rounded-2xl bg-[#111111] border border-white/[0.12] p-5">
        <h3 className="mb-6 text-[11px] font-semibold tracking-widest text-white/40 uppercase">
          Aktywności (30 dni)
        </h3>
        {workouts.length === 0 ? (
          <p className="py-8 text-center text-sm text-white/20 font-light">
            Brak danych — zapisz treningi żeby zobaczyć statystyki
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={activityTotals} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} tickMargin={10} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} tickMargin={10} axisLine={false} tickLine={false} />
              <Tooltip {...tooltipStyle} formatter={(value: number) => [value, "treningi"]} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Bar dataKey="count" name="Treningi" radius={[6, 6, 0, 0]}>
                {activityTotals.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      </div>
    </div>
  );
}
