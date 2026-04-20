import { useState, useRef, useCallback, type ReactNode } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";

const THRESHOLD = 80; // px to pull before triggering refresh

interface Props {
  children: ReactNode;
  scrollContainerId?: string;
  /** If provided, only these queries are invalidated on pull. Otherwise all. */
  queryKeys?: QueryKey[];
}

function isScrollable(el: HTMLElement): boolean {
  if (el.scrollHeight <= el.clientHeight) return false;
  const overflowY = window.getComputedStyle(el).overflowY;
  return overflowY === "auto" || overflowY === "scroll";
}

// Walk up from target to find the nearest vertically scrollable ancestor.
// PTR should only activate when that ancestor is the designated scroll container
// AND it's at scrollTop === 0. If the target sits inside a nested scroll (e.g.
// chat messages list) that has its own scroll, we skip PTR entirely so the inner
// scroll handles the gesture natively.
function findScrollableAncestor(target: EventTarget | null): HTMLElement | null {
  let el: HTMLElement | null = target as HTMLElement | null;
  while (el) {
    if (el.hasAttribute?.("data-no-pull-to-refresh")) return el;
    if (isScrollable(el)) return el;
    el = el.parentElement;
  }
  return null;
}

export function PullToRefresh({ children, scrollContainerId = "scroll-container", queryKeys }: Props) {
  const queryClient = useQueryClient();
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const isPullingRef = useRef(false);

  const getScrollContainer = () => document.getElementById(scrollContainerId);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const container = getScrollContainer();
      if (!container) return;

      const scrollable = findScrollableAncestor(e.target);
      if (!scrollable) return;

      // Opt-out: element (or ancestor) marked as no-PTR.
      if (scrollable.hasAttribute("data-no-pull-to-refresh")) return;

      // Only trigger PTR when the nearest scroll ancestor IS the designated
      // container. If a nested scroll sits between target and container, let
      // the nested scroll own the gesture.
      if (scrollable !== container) return;

      if (container.scrollTop !== 0) return;

      startYRef.current = e.touches[0].clientY;
      isPullingRef.current = true;
    },
    [scrollContainerId],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isPullingRef.current || startYRef.current === null) return;
      const container = getScrollContainer();
      if (container && container.scrollTop > 0) {
        startYRef.current = null;
        isPullingRef.current = false;
        setPullDistance(0);
        return;
      }

      const delta = e.touches[0].clientY - startYRef.current;
      if (delta > 0) {
        // Rubber-band effect
        const clamped = Math.min(delta * 0.5, THRESHOLD * 1.2);
        setPullDistance(clamped);
      } else if (delta < 0) {
        // Finger moving up — user wants to scroll, not refresh. Release.
        startYRef.current = null;
        isPullingRef.current = false;
        setPullDistance(0);
      }
    },
    [scrollContainerId],
  );

  const handleTouchEnd = useCallback(async () => {
    if (!isPullingRef.current) return;
    isPullingRef.current = false;
    startYRef.current = null;

    const dist = pullDistance;
    setPullDistance(0);

    if (dist >= THRESHOLD * 0.7 && !isRefreshing) {
      setIsRefreshing(true);
      try {
        if (queryKeys && queryKeys.length > 0) {
          await Promise.all(
            queryKeys.map((key) => queryClient.invalidateQueries({ queryKey: key })),
          );
        } else {
          await queryClient.invalidateQueries();
        }
      } finally {
        setIsRefreshing(false);
      }
    }
  }, [pullDistance, isRefreshing, queryClient, queryKeys]);

  const indicatorOpacity = Math.min(pullDistance / (THRESHOLD * 0.7), 1);
  const indicatorRotation = (pullDistance / THRESHOLD) * 360;
  const showIndicator = pullDistance > 4 || isRefreshing;

  return (
    <div
      className="relative flex flex-col flex-1 min-h-0"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator — absolutely positioned above content */}
      {showIndicator && (
        <div
          className="absolute top-0 left-0 right-0 z-10 flex items-center justify-center pointer-events-none"
          style={{
            height: 40,
            opacity: isRefreshing ? 1 : indicatorOpacity,
          }}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 border border-white/20">
            <RotateCcw
              size={14}
              strokeWidth={1.5}
              className={`text-white/60 ${isRefreshing ? "animate-spin" : ""}`}
              style={!isRefreshing ? { transform: `rotate(${indicatorRotation}deg)` } : undefined}
            />
          </div>
        </div>
      )}

      {/* Content — shifted down during pull */}
      <div
        className="flex flex-col flex-1 min-h-0"
        style={{
          transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined,
          transition: pullDistance === 0 ? "transform 0.2s ease" : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
