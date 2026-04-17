import { CalendarDays, Dumbbell, MessageCircle, BarChart3, Clock, type LucideIcon } from "lucide-react";

export interface Tab {
  path: string;
  label: string;
  icon: LucideIcon;
}

export const TABS: Tab[] = [
  { path: "/", label: "Dziś", icon: Dumbbell },
  { path: "/kalendarz", label: "Kalendarz", icon: CalendarDays },
  { path: "/trener", label: "Trener", icon: MessageCircle },
  { path: "/statystyki", label: "Statystyki", icon: BarChart3 },
  { path: "/historia", label: "Historia", icon: Clock },
];

export function currentTabIndex(location: string): number {
  if (location === "/") return 0;
  const idx = TABS.findIndex((t) => t.path !== "/" && location.startsWith(t.path));
  return idx === -1 ? 0 : idx;
}
