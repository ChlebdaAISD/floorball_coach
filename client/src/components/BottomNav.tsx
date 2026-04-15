import { useLocation } from "wouter";
import { CalendarDays, Dumbbell, MessageCircle, BarChart3, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { path: "/", label: "Dziś", icon: Dumbbell },
  { path: "/kalendarz", label: "Kalendarz", icon: CalendarDays },
  { path: "/trener", label: "Trener", icon: MessageCircle },
  { path: "/statystyki", label: "Statystyki", icon: BarChart3 },
  { path: "/historia", label: "Historia", icon: Clock },
];

export function BottomNav() {
  const [location, setLocation] = useLocation();

  const navigate = (path: string) => {
    setLocation(path);
    document.getElementById("scroll-container")?.scrollTo({ top: 0 });
  };

  return (
    <nav className="shrink-0 bg-black/85 backdrop-blur-2xl border-t border-white/[0.08] pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-stretch justify-around">
        {TABS.map((tab) => {
          const isActive =
            tab.path === "/" ? location === "/" : location.startsWith(tab.path);
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 pt-3 pb-2 border-t-2 transition-colors touch-target",
                isActive ? "text-white border-white" : "text-white/30 border-transparent hover:text-white/60",
              )}
            >
              <tab.icon size={20} strokeWidth={1} />
              <span className="text-[10px] uppercase tracking-wider">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
