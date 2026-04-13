import { Route, Switch, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import LoginPage from "@/pages/LoginPage";
import TodayPage from "@/pages/TodayPage";
import CalendarPage from "@/pages/CalendarPage";
import ChatPage from "@/pages/ChatPage";
import DashboardPage from "@/pages/DashboardPage";
import HistoryPage from "@/pages/HistoryPage";
import SettingsPage from "@/pages/SettingsPage";
import {
  CalendarDays,
  Dumbbell,
  MessageCircle,
  BarChart3,
  Clock,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

function BottomNav() {
  const [location, setLocation] = useLocation();

  const tabs = [
    { path: "/", label: "Dziś", icon: Dumbbell },
    { path: "/kalendarz", label: "Kalendarz", icon: CalendarDays },
    { path: "/trener", label: "Trener", icon: MessageCircle },
    { path: "/statystyki", label: "Statystyki", icon: BarChart3 },
    { path: "/historia", label: "Historia", icon: Clock },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-black/85 backdrop-blur-2xl border-t border-white/[0.08] pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-stretch justify-around">
        {tabs.map((tab) => {
          const isActive =
            tab.path === "/"
              ? location === "/"
              : location.startsWith(tab.path);
          return (
            <button
              key={tab.path}
              onClick={() => setLocation(tab.path)}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 pt-3 pb-2 border-t-2 transition-colors touch-target",
                isActive
                  ? "text-white border-white"
                  : "text-white/30 border-transparent hover:text-white/60"
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

export default function App() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border border-white/30 border-t-white" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen pb-20 pt-14">
      {/* Top Header */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-black/90 backdrop-blur-xl border-b border-white/[0.06] px-4 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Prewencja i Forma</div>
        <button onClick={() => window.location.href = "/ustawienia"} className="p-2 transition-colors text-white/50 hover:text-white/80">
          <Settings size={20} strokeWidth={1} />
        </button>
      </header>

      <Switch>
        <Route path="/" component={TodayPage} />
        <Route path="/kalendarz" component={CalendarPage} />
        <Route path="/trener" component={ChatPage} />
        <Route path="/statystyki" component={DashboardPage} />
        <Route path="/historia" component={HistoryPage} />
        <Route path="/ustawienia" component={SettingsPage} />
      </Switch>
      <BottomNav />
    </div>
  );
}
