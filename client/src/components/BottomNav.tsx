import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { TABS, currentTabIndex } from "@/lib/tabs";

export function BottomNav() {
  const [location, setLocation] = useLocation();
  const activeIdx = currentTabIndex(location);

  const navigate = (path: string) => {
    setLocation(path);
    document.getElementById("scroll-container")?.scrollTo({ top: 0 });
  };

  return (
    <nav
      className="shrink-0 bg-black/85 backdrop-blur-2xl border-t border-white/[0.08]"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
    >
      <div className="relative flex items-stretch justify-around">
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 h-[2px] bg-white"
          style={{
            width: `${100 / TABS.length}%`,
            transform: `translateX(${activeIdx * 100}%)`,
            transition: "transform 300ms cubic-bezier(0.22, 1, 0.36, 1)",
            willChange: "transform",
          }}
        />
        {TABS.map((tab, i) => {
          const isActive = i === activeIdx;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 pt-3 pb-2 transition-colors touch-target",
                isActive ? "text-white" : "text-white/30 hover:text-white/60",
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
