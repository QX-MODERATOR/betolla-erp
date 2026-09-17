"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";

type ToastVariant = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  duration?: number;
  isExiting?: boolean;
}

interface ToastContextType {
  showToast: (message: string, variant?: ToastVariant, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    // Return a no-op if outside provider (e.g., during SSR)
    return { showToast: () => {} };
  }
  return context;
}

const VARIANT_STYLES: Record<ToastVariant, { bg: string; icon: any; iconColor: string }> = {
  success: {
    bg: "bg-emerald-50 border-emerald-200 text-emerald-900",
    icon: CheckCircle2,
    iconColor: "text-emerald-500",
  },
  error: {
    bg: "bg-rose-50 border-rose-200 text-rose-900",
    icon: AlertCircle,
    iconColor: "text-rose-500",
  },
  warning: {
    bg: "bg-amber-50 border-amber-200 text-amber-900",
    icon: AlertTriangle,
    iconColor: "text-amber-500",
  },
  info: {
    bg: "bg-blue-50 border-blue-200 text-blue-900",
    icon: Info,
    iconColor: "text-blue-500",
  },
};

const PROGRESS_COLORS: Record<ToastVariant, string> = {
  success: "bg-emerald-500",
  error: "bg-rose-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const { bg, icon: Icon, iconColor } = VARIANT_STYLES[toast.variant];
  const duration = toast.duration || 3000;
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (progressRef.current) {
      // Trigger the CSS transition after mount
      requestAnimationFrame(() => {
        if (progressRef.current) {
          progressRef.current.style.width = "0%";
        }
      });
    }
  }, [duration]);

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-2xl border shadow-lg shadow-stone-200/50 ${bg} ${
        toast.isExiting ? "animate-toastOut" : "animate-toastIn"
      } relative overflow-hidden min-w-[280px] max-w-md`}
      role="alert"
    >
      <Icon className={`w-5 h-5 ${iconColor} shrink-0 mt-0.5`} />
      <p className="text-sm font-semibold flex-1 leading-relaxed">{toast.message}</p>
      <button aria-label="إغلاق"
        onClick={() => onDismiss(toast.id)}
        className="p-1 rounded-lg hover:bg-stone-200/50 text-stone-500 transition shrink-0 cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-stone-200/30">
        <div
          ref={progressRef}
          className={`h-full ${PROGRESS_COLORS[toast.variant]} rounded-full`}
          style={{
            width: "100%",
            transition: `width ${duration}ms linear`,
          }}
        />
      </div>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const dismissToast = useCallback((id: string) => {
    // Mark as exiting first for exit animation
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, isExiting: true } : t)));
    // Remove after animation completes
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 200);
    // Clear the auto-dismiss timer
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "success", duration = 3000) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const toast: Toast = { id, message, variant, duration };
      setToasts((prev) => [...prev.slice(-4), toast]); // Keep max 5 toasts

      const timer = setTimeout(() => {
        dismissToast(id);
      }, duration);
      timersRef.current.set(id, timer);
    },
    [dismissToast]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast Container */}
      {toasts.length > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[99998] flex flex-col items-center gap-2 pointer-events-none">
          {toasts.map((toast) => (
            <div key={toast.id} className="pointer-events-auto">
              <ToastItem toast={toast} onDismiss={dismissToast} />
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}
