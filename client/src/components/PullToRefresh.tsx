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
    }
  }, []);

  const handleTouchEnd = useCallback(async () => {
    if (!isPullingRef.current) return;
    isPullingRef.current = false;
    startYRef.current = null;

    const dist = pullDistance;
    setPullDistance(0);

    if (dist >= THRESHOLD * 0.7 && !isRefreshing) {
      setIsRefreshing(true);
      try {
        await queryClient.invalidateQueries();
      } finally {
        setIsRefreshing(false);
      }
    }
  }, [pullDistance, isRefreshing, queryClient]);

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
