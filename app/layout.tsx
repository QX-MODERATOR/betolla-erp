import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-cairo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Betolla Cosmetics ERP | بيتولا كوزمتكس",
  description: "نظام إدارة المبيعات، المخزون، والعملاء المتكامل لشركة بيتولا لمستحضرات التجميل",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Betolla ERP",
  },
};

export const viewport: Viewport = {
  themeColor: "#d97706",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body className="font-sans antialiased bg-stone-100 text-stone-900 min-h-screen">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
