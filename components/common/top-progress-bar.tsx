"use client";

import { useEffect, useState } from "react";
import { useLoading } from "@/lib/loading-context";
import { usePathname } from "next/navigation";

export function TopProgressBar() {
  const { isNavigating } = useLoading();
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    let interval: NodeJS.Timeout;

    if (isNavigating) {
      setVisible(true);
      setProgress(15);
      
      interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 85) {
            clearInterval(interval);
            return prev;
          }
          const diff = Math.max(1, (90 - prev) * 0.15);
          return Math.min(prev + diff, 88);
        });
      }, 100);
    } else {
      if (visible) {
        setProgress(100);
        timer = setTimeout(() => {
          setVisible(false);
          setProgress(0);
        }, 300);
      }
    }

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [isNavigating, visible]);

  // Also catch route changes automatically
  useEffect(() => {
    setVisible(true);
    setProgress(100);
    const timer = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [pathname]);

  if (!visible && progress === 0) return null;

  return (
    <div 
      aria-hidden="true" 
      className="fixed top-0 left-0 right-0 z-[99999] h-1 pointer-events-none overflow-hidden bg-transparent"
    >
      <div
        className="h-full bg-gradient-to-r from-amber-500 via-amber-300 to-amber-600 shadow-[0_0_12px_rgba(245,158,11,0.9)] transition-all ease-out duration-300"
        style={{
          width: `${progress}%`,
          opacity: visible ? 1 : 0,
        }}
      />
    </div>
  );
}
