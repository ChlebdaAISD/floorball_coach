import { useCallback, useRef, type ReactNode } from "react";
import { useLocation } from "wouter";
import { TABS, currentTabIndex } from "@/lib/tabs";

const HORIZONTAL_LOCK_PX = 10;
const HORIZONTAL_RATIO = 1.5;
const TRIGGER_DISTANCE_PX = 60;
const MAX_DURATION_MS = 500;

type Mode = "idle" | "horizontal" | "vertical";

function shouldIgnoreTarget(target: EventTarget | null): boolean {
  let el: HTMLElement | null = target as HTMLElement | null;
  while (el) {
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (el.hasAttribute?.("data-no-swipe")) return true;
    el = el.parentElement;
  }
  return false;
}

export function SwipeableRoutes({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const modeRef = useRef<Mode>("idle");
  const ignoreRef = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    ignoreRef.current = shouldIgnoreTarget(e.target);
    if (ignoreRef.current) {
      startRef.current = null;
      modeRef.current = "idle";
      return;
    }
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    modeRef.current = "idle";
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (ignoreRef.current || !startRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - startRef.current.x;
    const dy = touch.clientY - startRef.current.y;

    if (modeRef.current === "idle") {
      if (Math.abs(dx) > HORIZONTAL_LOCK_PX && Math.abs(dx) > Math.abs(dy) * HORIZONTAL_RATIO) {
        modeRef.current = "horizontal";
      } else if (Math.abs(dy) > HORIZONTAL_LOCK_PX) {
        modeRef.current = "vertical";
      }
    }
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (ignoreRef.current || !startRef.current) {
        startRef.current = null;
        modeRef.current = "idle";
        ignoreRef.current = false;
        return;
      }
      const endTouch = e.changedTouches[0];
      const dx = endTouch.clientX - startRef.current.x;
      const dy = endTouch.clientY - startRef.current.y;
      const dt = Date.now() - startRef.current.t;
      const locked = modeRef.current === "horizontal";
      startRef.current = null;
      modeRef.current = "idle";

      if (!locked) return;
      if (dt > MAX_DURATION_MS) return;
      if (Math.abs(dx) < TRIGGER_DISTANCE_PX) return;
      if (Math.abs(dx) <= Math.abs(dy)) return;

      const idx = currentTabIndex(location);
      const nextIdx = dx < 0 ? idx + 1 : idx - 1;
      if (nextIdx < 0 || nextIdx >= TABS.length) return;
      setLocation(TABS[nextIdx].path);
      document.getElementById("scroll-container")?.scrollTo({ top: 0 });
    },
    [location, setLocation],
  );

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className="flex flex-1 flex-col min-h-0"
    >
      {children}
    </div>
  );
}
