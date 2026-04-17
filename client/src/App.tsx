import { Route, Switch } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import LoginPage from "@/pages/LoginPage";
import TodayPage from "@/pages/TodayPage";
import CalendarPage from "@/pages/CalendarPage";
import ChatPage from "@/pages/ChatPage";
import DashboardPage from "@/pages/DashboardPage";
import HistoryPage from "@/pages/HistoryPage";
import OnboardingPage from "@/pages/OnboardingPage";
import { BottomNav } from "@/components/BottomNav";
import { SettingsModal } from "@/components/SettingsModal";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { TopNavProvider, TopNavHost } from "@/contexts/TopNavContext";
import { PullToRefresh } from "@/components/PullToRefresh";
import { SwipeableRoutes } from "@/components/SwipeableRoutes";

export default function App() {
  const { isAuthenticated, isLoading, needsOnboarding } = useAuth();

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

  if (needsOnboarding) {
    return <OnboardingPage />;
  }

  return (
    <SettingsProvider>
      <TopNavProvider>
        <div className="flex min-h-screen items-center justify-center bg-zinc-950">
          <div
            className="relative flex w-full max-w-[430px] flex-col overflow-hidden bg-black md:rounded-[32px] md:border md:border-white/[0.08] md:shadow-2xl"
            style={{ height: "min(100dvh, 900px)" }}
          >
            <div className="shrink-0">
              <TopNavHost />
            </div>
            <PullToRefresh>
              <div id="scroll-container" className="flex flex-1 flex-col overflow-y-auto">
                <SwipeableRoutes>
                  <Switch>
                    <Route path="/" component={TodayPage} />
                    <Route path="/kalendarz" component={CalendarPage} />
                    <Route path="/trener" component={ChatPage} />
                    <Route path="/statystyki" component={DashboardPage} />
                    <Route path="/historia" component={HistoryPage} />
                  </Switch>
                </SwipeableRoutes>
              </div>
            </PullToRefresh>
            <BottomNav />
            <SettingsModal />
          </div>
        </div>
      </TopNavProvider>
    </SettingsProvider>
  );
}
