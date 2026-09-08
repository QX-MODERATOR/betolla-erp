"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";

export type LoadingMessage = {
  ar?: string;
  en?: string;
} | string;

interface LoadingContextType {
  isLoading: boolean;
  loadingMessage: LoadingMessage | null;
  startLoading: (message?: LoadingMessage) => void;
  stopLoading: () => void;
  withLoading: <T>(fn: () => Promise<T>, message?: LoadingMessage) => Promise<T>;
  isNavigating: boolean;
  startNavigation: () => void;
  stopNavigation: () => void;
}

const LoadingContext = createContext<LoadingContextType>({
  isLoading: false,
  loadingMessage: null,
  startLoading: () => {},
  stopLoading: () => {},
  withLoading: async (fn) => fn(),
  isNavigating: false,
  startNavigation: () => {},
  stopNavigation: () => {},
});

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<LoadingMessage | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const pathname = usePathname();
  const previousPathname = useRef(pathname);

  // Automatically finish route transition when pathname changes
  useEffect(() => {
    if (previousPathname.current !== pathname) {
      previousPathname.current = pathname;
      setIsNavigating(false);
      setIsLoading(false);
      setLoadingMessage(null);
    }
  }, [pathname]);

  const startLoading = useCallback((message?: LoadingMessage) => {
    setLoadingMessage(message || null);
    setIsLoading(true);
  }, []);

  const stopLoading = useCallback(() => {
    setIsLoading(false);
    setLoadingMessage(null);
  }, []);

  const startNavigation = useCallback(() => {
    setIsNavigating(true);
  }, []);

  const stopNavigation = useCallback(() => {
    setIsNavigating(false);
  }, []);

  const withLoading = useCallback(async <T,>(
    fn: () => Promise<T>,
    message?: LoadingMessage
  ): Promise<T> => {
    startLoading(message);
    try {
      return await fn();
    } finally {
      stopLoading();
    }
  }, [startLoading, stopLoading]);

  return (
    <LoadingContext.Provider
      value={{
        isLoading,
        loadingMessage,
        startLoading,
        stopLoading,
        withLoading,
        isNavigating,
        startNavigation,
        stopNavigation,
      }}
    >
      {children}
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  return useContext(LoadingContext);
}
