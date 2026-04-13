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
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-800 bg-slate-950/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around">
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
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors touch-target",
                isActive ? "text-blue-400" : "text-slate-500",
              )}
            >
              <tab.icon className="h-5 w-5" />
              <span>{tab.label}</span>
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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen pb-20 pt-14">
      {/* Top Header with Settings */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800 px-4 flex items-center justify-between">
        <div className="font-bold text-lg">Prewencja i Forma</div>
        <button onClick={() => window.location.href = "/ustawienia"} className="p-2 transition-colors hover:text-blue-400 text-slate-400">
          <Settings className="h-6 w-6" />
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
