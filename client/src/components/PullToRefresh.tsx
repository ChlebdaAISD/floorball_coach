import { useState, useRef, useCallback, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";

const THRESHOLD = 80; // px to pull before triggering refresh

interface Props {
  children: ReactNode;
  scrollContainerId?: string;
}

export function PullToRefresh({ children, scrollContainerId = "scroll-container" }: Props) {
  const queryClient = useQueryClient();
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const isPullingRef = useRef(false);

  const getScrollTop = () => {
    const el = document.getElementById(scrollContainerId);
    return el ? el.scrollTop : 0;
  };

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (getScrollTop() === 0) {
      startYRef.current = e.touches[0].clientY;
      isPullingRef.current = true;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPullingRef.current || startYRef.current === null) return;
    if (getScrollTop() > 0) {
      // User scrolled, cancel pull gesture
      startYRef.current = null;
      isPullingRef.current = false;
      setPullDistance(0);
      return;
    }

    const delta = e.touches[0].clientY - startYRef.current;
    if (delta > 0) {
      // Rubber-band effect: diminishing returns after threshold
      const clamped = Math.min(delta * 0.5, THRESHOLD * 1.2);
      setPullDistance(clamped);
    }
  }, []);

  const handleTouchEnd = useCallback(async () => {
    if (!isPullingRef.current) return;
    isPullingRef.current = false;
    startYRef.current = null;

    if (pullDistance >= THRESHOLD * 0.7 && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(0);
      try {
        await queryClient.invalidateQueries();
      } finally {
        setIsRefreshing(false);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, isRefreshing, queryClient]);

  const indicatorOpacity = Math.min(pullDistance / (THRESHOLD * 0.7), 1);
  const indicatorRotation = (pullDistance / THRESHOLD) * 360;

  return (
    <div
      className="relative flex flex-col flex-1 overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      {(pullDistance > 0 || isRefreshing) && (
        <div
          className="absolute top-0 left-0 right-0 z-10 flex items-center justify-center pointer-events-none"
          style={{
            height: `${Math.max(pullDistance, isRefreshing ? 40 : 0)}px`,
            opacity: isRefreshing ? 1 : indicatorOpacity,
            transition: pullDistance === 0 ? "height 0.2s ease, opacity 0.2s ease" : "none",
          }}
        >
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 border border-white/20"
            style={{
              transform: isRefreshing ? "none" : `rotate(${indicatorRotation}deg)`,
            }}
          >
            <RotateCcw
              size={14}
              strokeWidth={1.5}
              className={`text-white/60 ${isRefreshing ? "animate-spin" : ""}`}
            />
          </div>
        </div>
      )}

      {/* Content shifted down during pull */}
      <div
        className="flex-1 overflow-hidden"
        style={{
          transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : "none",
          transition: pullDistance === 0 ? "transform 0.2s ease" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
