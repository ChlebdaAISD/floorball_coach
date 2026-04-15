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
    <nav className="shrink-0 bg-black/85 backdrop-blur-2xl border-t border-white/[0.08] pb-[env(safe-area-inset-bottom)]">
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
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div
        className="relative flex w-full max-w-[430px] flex-col overflow-hidden bg-black md:rounded-[32px] md:border md:border-white/[0.08] md:shadow-2xl"
        style={{ height: "min(100vh, 900px)" }}
      >
        <div className="flex-1 overflow-y-auto">
          <Switch>
            <Route path="/" component={TodayPage} />
            <Route path="/kalendarz" component={CalendarPage} />
            <Route path="/trener" component={ChatPage} />
            <Route path="/statystyki" component={DashboardPage} />
            <Route path="/historia" component={HistoryPage} />
            <Route path="/ustawienia" component={SettingsPage} />
          </Switch>
        </div>
        <BottomNav />
      </div>
    </div>
  );
}
