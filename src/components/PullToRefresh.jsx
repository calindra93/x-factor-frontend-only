import React, { useState, useRef, useEffect } from "react";
import { Loader2 } from "lucide-react";

export default function PullToRefresh({ onRefresh, children }) {
  const [startY, setStartY] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [canPull, setCanPull] = useState(false);
  const containerRef = useRef(null);

  const PULL_THRESHOLD = 80;
  const MAX_PULL = 120;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e) => {
      // Only allow pull-to-refresh if already at the top of the scroll
      if (container.scrollTop === 0 && !isRefreshing) {
        setCanPull(true);
        setStartY(e.touches[0].clientY);
      }
    };

    const handleTouchMove = (e) => {
      if (!canPull || isRefreshing) return;

      const currentY = e.touches[0].clientY;
      const distance = Math.max(0, currentY - startY);
      
      // Apply resistance to the pull
      const resistedDistance = Math.min(distance * 0.5, MAX_PULL);
      setPullDistance(resistedDistance);

      // Prevent scrolling if pulling
      if (distance > 10) {
        e.preventDefault();
      }
    };

    const handleTouchEnd = async () => {
      if (!canPull || isRefreshing) return;

      if (pullDistance >= PULL_THRESHOLD) {
        setIsRefreshing(true);
        try {
          await onRefresh();
        } catch (error) {
          console.error("Refresh failed:", error);
        } finally {
          setIsRefreshing(false);
        }
      }

      setCanPull(false);
      setPullDistance(0);
      setStartY(0);
    };

    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [canPull, isRefreshing, pullDistance, startY, onRefresh]);

  const spinnerOpacity = Math.min(pullDistance / PULL_THRESHOLD, 1);
  const shouldSpin = isRefreshing || pullDistance >= PULL_THRESHOLD;

  return (
    <div ref={containerRef} className="overflow-y-auto h-full relative">
      {/* Pull indicator */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-center pointer-events-none transition-opacity"
        style={{
          height: `${pullDistance}px`,
          opacity: spinnerOpacity,
        }}
      >
        <Loader2
          className={`w-6 h-6 text-red-400 ${shouldSpin ? "animate-spin" : ""}`}
          style={{
            transform: `scale(${Math.min(pullDistance / PULL_THRESHOLD, 1)})`,
          }}
        />
      </div>

      {/* Content */}
      <div
        style={{
          transform: isRefreshing
            ? `translateY(${PULL_THRESHOLD}px)`
            : `translateY(${pullDistance}px)`,
          transition: isRefreshing || !canPull ? "transform 0.2s ease-out" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}