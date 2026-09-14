import type { Metadata, Viewport } from "next";
import { Tajawal } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";

const tajawal = Tajawal({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700", "800"],
  variable: "--font-tajawal",
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
  themeColor: "#9e8959",
  width: "device-width",
  initialScale: 1,

};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={tajawal.variable}>
      <body className="font-sans antialiased bg-[#faf7f2] text-[#2b2926] min-h-screen">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
