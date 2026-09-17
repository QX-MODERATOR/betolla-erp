"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { I18nProvider } from "@/lib/i18n";
import { LoadingProvider } from "@/lib/loading-context";
import { LoadingOverlay } from "@/components/common/loading-overlay";
import { TopProgressBar } from "@/components/common/top-progress-bar";
import { ProfileProvider } from "@/lib/profile-context";
import { DateFilterProvider } from "@/lib/date-context";
import { ProfileSettingsModal } from "@/components/profile/profile-settings-modal";
import { ToastProvider } from "@/components/common/toast";
import { SearchProvider } from "@/lib/search-context";
import { OrderSearchModal } from "@/components/search/order-search-modal";
import { PushRegistration } from "@/components/common/push-registration";
import { ConfirmProvider } from "@/components/common/confirm-dialog";
import { DialogA11y } from "@/components/common/dialog-a11y";

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/login";

  if (isAuthPage) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex flex-col justify-center">
        {children}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <PushRegistration />
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {process.env.NEXT_PUBLIC_BETOLLA_TEST_MODE === '1' && <p role="status" className="mb-4 rounded-xl bg-amber-100 p-3 text-amber-950">بيئة اختبار محلية معزولة — جميع البيانات هنا تجريبية</p>}
          {children}
        </main>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
      <DialogA11y />
      <I18nProvider>
        <LoadingProvider>
          <ProfileProvider>
            <DateFilterProvider>
              <SearchProvider>
                <TopProgressBar />
                <LoadingOverlay />
                <ProfileSettingsModal />
                <OrderSearchModal />
                <ShellInner>{children}</ShellInner>
              </SearchProvider>
            </DateFilterProvider>
          </ProfileProvider>
        </LoadingProvider>
      </I18nProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}

