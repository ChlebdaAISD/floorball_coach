import { useCallback, useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { useLocation } from "wouter";
import { TABS, currentTabIndex } from "@/lib/tabs";

const LOCK_PX = 10;
const HORIZONTAL_RATIO = 1.2;
const COMMIT_RATIO = 0.22; // of container width
const COMMIT_MIN_PX = 60;
const COMMIT_MAX_MS = 500;
const ANIM_MS = 260;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const EDGE_DAMPING = 0.3;

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
  const [dragX, setDragX] = useState(0);
  const [animating, setAnimating] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const modeRef = useRef<Mode>("idle");
  const ignoreRef = useRef(false);
  const pendingRef = useRef<{ path: string; width: number } | null>(null);

  const onTouchStart = useCallback(
    (e: TouchEvent) => {
      if (animating) return;
      ignoreRef.current = shouldIgnoreTarget(e.target);
      if (ignoreRef.current) {
        startRef.current = null;
        modeRef.current = "idle";
        return;
      }
      const t = e.touches[0];
      startRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
      modeRef.current = "idle";
    },
    [animating],
  );

  const onTouchMove = useCallback(
    (e: TouchEvent) => {
      if (ignoreRef.current || !startRef.current || animating) return;
      const t = e.touches[0];
      const dx = t.clientX - startRef.current.x;
      const dy = t.clientY - startRef.current.y;

      if (modeRef.current === "idle") {
        if (Math.abs(dx) > LOCK_PX && Math.abs(dx) > Math.abs(dy) * HORIZONTAL_RATIO) {
          modeRef.current = "horizontal";
        } else if (Math.abs(dy) > LOCK_PX) {
          modeRef.current = "vertical";
          startRef.current = null;
          return;
        }
      }

      if (modeRef.current === "horizontal") {
        const idx = currentTabIndex(location);
        const atLeftEdge = idx === 0 && dx > 0;
        const atRightEdge = idx === TABS.length - 1 && dx < 0;
        const effective = atLeftEdge || atRightEdge ? dx * EDGE_DAMPING : dx;
        setDragX(effective);
      }
    },
    [animating, location],
  );

  const onTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (ignoreRef.current || !startRef.current) {
        startRef.current = null;
        modeRef.current = "idle";
        ignoreRef.current = false;
        return;
      }
      const endTouch = e.changedTouches[0];
      const dx = endTouch.clientX - startRef.current.x;
      const dt = Date.now() - startRef.current.t;
      const locked = modeRef.current === "horizontal";
      startRef.current = null;
      modeRef.current = "idle";

      if (!locked) {
        if (dragX !== 0) {
          setAnimating(true);
          setDragX(0);
        }
        return;
      }

      const width = containerRef.current?.offsetWidth ?? window.innerWidth;
      const threshold = Math.max(COMMIT_MIN_PX, width * COMMIT_RATIO);
      const idx = currentTabIndex(location);
      const dir = dx < 0 ? 1 : -1;
      const nextIdx = idx + dir;
      const canCommit =
        dt < COMMIT_MAX_MS && Math.abs(dx) >= threshold && nextIdx >= 0 && nextIdx < TABS.length;

      setAnimating(true);
      if (canCommit) {
        pendingRef.current = { path: TABS[nextIdx].path, width };
        setDragX(dir === 1 ? -width : width);
      } else {
        pendingRef.current = null;
        setDragX(0);
      }
    },
    [location, dragX],
  );

  const onTransitionEnd = useCallback(() => {
    if (!animating) return;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) {
      setLocation(pending.path);
      document.getElementById("scroll-container")?.scrollTo({ top: 0 });
      setDragX(0);
    }
    setAnimating(false);
  }, [animating, setLocation]);

  // Safety net: if transitionend doesn't fire (e.g. DOM interrupted), clear state after max animation duration.
  useEffect(() => {
    if (!animating) return;
    const timer = window.setTimeout(() => {
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) {
        setLocation(pending.path);
        document.getElementById("scroll-container")?.scrollTo({ top: 0 });
        setDragX(0);
      }
      setAnimating(false);
    }, ANIM_MS + 120);
    return () => window.clearTimeout(timer);
  }, [animating, setLocation]);

  return (
    <div
      ref={containerRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTransitionEnd={onTransitionEnd}
      className="flex flex-1 flex-col min-h-0"
      style={{
        transform: `translate3d(${dragX}px, 0, 0)`,
        transition: animating ? `transform ${ANIM_MS}ms ${EASE}` : "none",
        willChange: "transform",
        touchAction: "pan-y",
      }}
    >
      {children}
    </div>
  );
}
