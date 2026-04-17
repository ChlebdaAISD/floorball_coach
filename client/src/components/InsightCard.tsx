import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Sparkles, X, Loader2 } from "lucide-react";
import { cn, apiRequest } from "@/lib/utils";
import type { AiInsight } from "@shared/schema";

type InsightKind =
  | "high_load"
  | "readiness_drop"
  | "injury_caution"
  | "missed_workout"
  | "consecutive_hard_days";

const KIND_TONE: Record<InsightKind, "warn" | "info"> = {
  high_load: "warn",
  readiness_drop: "warn",
  injury_caution: "warn",
  missed_workout: "info",
  consecutive_hard_days: "warn",
};

export function InsightList() {
  const { data: insights = [], isLoading } = useQuery<AiInsight[]>({
    queryKey: ["today-insights"],
    queryFn: () => apiRequest("/api/today/insights"),
  });

  if (isLoading || insights.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-[11px] uppercase tracking-widest text-white/40">
        Uwagi trenera
      </p>
      {insights.map((insight) => (
        <InsightCard key={insight.id} insight={insight} />
      ))}
    </div>
  );
}

function InsightCard({ insight }: { insight: AiInsight }) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [acting, setActing] = useState(false);
  const tone = KIND_TONE[insight.kind as InsightKind] ?? "info";

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["today-insights"] });
    queryClient.invalidateQueries({ queryKey: ["today-events"] });
    queryClient.invalidateQueries({ queryKey: ["calendar"] });
  };

  const dismissMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/insights/${insight.id}/dismiss`, { method: "POST" }),
    onSuccess: invalidate,
  });

  const acceptMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/insights/${insight.id}/accept`, { method: "POST" }),
    onSuccess: () => {
      invalidate();
      // Client-side navigation for actions the server can't complete itself.
      if (insight.actionKind === "log_workout") {
        navigate("/");
      } else if (insight.actionKind === "swap_exercises") {
        navigate("/trener");
      } else if (insight.actionKind === "ease_today") {
        navigate("/");
      }
      setActing(false);
    },
    onError: () => setActing(false),
  });

  const handleAction = () => {
    setActing(true);
    acceptMutation.mutate();
  };

  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        tone === "warn"
          ? "border-amber-400/25 bg-amber-400/[0.04]"
          : "border-white/[0.12] bg-[#111111]",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            tone === "warn" ? "bg-amber-400/10" : "bg-white/5",
          )}
        >
          {tone === "warn" ? (
            <AlertTriangle
              className="h-4 w-4 text-amber-300"
              strokeWidth={1.5}
            />
          ) : (
            <Sparkles className="h-4 w-4 text-white/60" strokeWidth={1.5} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tracking-wide">
            {insight.headline}
          </p>
          <p className="mt-1 text-xs font-light leading-relaxed text-white/60">
            {insight.body}
          </p>
          {insight.actionLabel && (
            <button
              onClick={handleAction}
              disabled={acting || acceptMutation.isPending}
              className={cn(
                "mt-3 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold tracking-wide transition-colors",
                tone === "warn"
                  ? "border-amber-300/40 text-amber-200 hover:border-amber-300/60"
                  : "border-white/20 text-white hover:border-white/40",
                (acting || acceptMutation.isPending) && "opacity-50",
              )}
            >
              {acting || acceptMutation.isPending ? (
                <Loader2
                  size={12}
                  strokeWidth={1.5}
                  className="animate-spin"
                />
              ) : null}
              {insight.actionLabel}
            </button>
          )}
        </div>
        <button
          onClick={() => dismissMutation.mutate()}
          disabled={dismissMutation.isPending}
          className="p-1 text-white/40 transition-colors hover:text-white/70"
          aria-label="Odrzuć"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
