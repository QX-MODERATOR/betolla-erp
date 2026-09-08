"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { I18nProvider } from "@/lib/i18n";
import { LoadingProvider } from "@/lib/loading-context";
import { LoadingOverlay } from "@/components/common/loading-overlay";
import { TopProgressBar } from "@/components/common/top-progress-bar";

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/login";

  if (isAuthPage) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col justify-center">
        {children}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <LoadingProvider>
        <TopProgressBar />
        <LoadingOverlay />
        <ShellInner>{children}</ShellInner>
      </LoadingProvider>
    </I18nProvider>
  );
}

