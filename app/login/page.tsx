"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { 
  Lock, 
  User, 
  KeyRound, 
  Eye, 
  EyeOff, 
  Sparkles, 
  AlertCircle, 
  CheckCircle2
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { useLoading } from "@/lib/loading-context";
import { LanguageSwitcher } from "@/components/common/language-switcher";

// Role-based welcome messages
const ROLE_WELCOME: Record<string, { ar: string; en: string }> = {
  admin: {
    ar: "تم التحقق وتأكيد الهوية بنجاح! جاري تحويلك للوحة التحكم...",
    en: "Authentication successful! Redirecting to Dashboard...",
  },
  sales_rep: {
    ar: "مرحباً! تم التحقق بنجاح وجاري نقلك إلى بوابة المبيعات...",
    en: "Welcome! Access verified, redirecting to Sales Portal...",
  },
  driver_manager: {
    ar: "مرحباً ضياء! جاري نقلك إلى لوحة إدارة السائقين...",
    en: "Welcome Diya! Redirecting to Driver Management...",
  },
  driver: {
    ar: "مرحباً! جاري نقلك إلى طلبات التوصيل...",
    en: "Welcome! Redirecting to Delivery Orders...",
  },
  finance: {
    ar: "مرحباً! جاري نقلك إلى القسم المالي...",
    en: "Welcome! Redirecting to Finance...",
  },
};

function LoginForm() {
  const { dir, t } = useLanguage();
  const { startLoading, stopLoading } = useLoading();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("from") || "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!username.trim() || !password.trim()) {
      setError(dir === "rtl" ? "يرجى إدخال اسم المستخدم وكلمة المرور." : "Please enter your username and password.");
      return;
    }

    try {
      setIsLoading(true);
      startLoading({
        ar: "جاري التحقق من بيانات الدخول...",
        en: "Verifying your credentials..."
      });

      // Credentials travel over HTTPS to the server, which authenticates
      // against Supabase Auth and sets a secure HttpOnly session cookie.
      // No token is ever handled or stored by client-side JavaScript.
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || (dir === "rtl" ? "فشل تسجيل الدخول. يرجى التحقق من البيانات." : "Login failed. Please check your credentials."));
      }

      // Cache the (non-sensitive) profile locally purely so the UI can
      // render the sidebar/header instantly on next load without waiting on
      // a round trip. This is never the source of truth for authorization —
      // every request is re-checked server-side against the session cookie.
      if (data.user) {
        localStorage.setItem("betolla_user", JSON.stringify(data.user));
      }

      const targetUrl = data.redirectUrl || returnUrl;
      const role = data.user?.role || "admin";
      const welcomeMsg = ROLE_WELCOME[role] || ROLE_WELCOME.admin;
      setSuccess(dir === "rtl" ? welcomeMsg.ar : welcomeMsg.en);

      // Redirect to destination with clean page reload so all contexts bootstrap with the new user
      setTimeout(() => {
        window.location.href = targetUrl;
      }, 500);
    } catch (err: any) {
      stopLoading();
      setError(err?.message || (dir === "rtl" ? "حدث خطأ أثناء محاولة تسجيل الدخول." : "An error occurred while attempting to sign in."));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-gray-50 via-white to-gray-100 flex flex-col items-center justify-center p-4 sm:p-6 text-gray-900 font-sans selection:bg-amber-500 selection:text-white">
      
      {/* Subtle ambient background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 right-1/4 w-96 h-96 bg-amber-100/40 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 left-1/4 w-96 h-96 bg-amber-50/50 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        
        {/* Top Language Switcher Bar */}
        <div className={`flex ${dir === "rtl" ? "justify-start" : "justify-end"} mb-4`}>
          <LanguageSwitcher variant="pill" />
        </div>

        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 via-amber-400 to-amber-300 text-white shadow-xl shadow-amber-500/20 mb-4 ring-4 ring-amber-100">
            <Sparkles className="w-8 h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
            {t("login_title")}
          </h1>
          <p className="text-sm text-amber-600 font-medium mt-1">
            {t("login_subtitle")}
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white border border-gray-200 rounded-3xl p-6 sm:p-8 shadow-xl shadow-gray-200/60 relative overflow-hidden">
          
          {/* Subtle amber top border highlight */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />

          {/* Alerts */}
          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5 animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{error}</div>
            </div>
          )}

          {success && (
            <div className="mb-5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-start gap-2.5 animate-in fade-in slide-in-from-top-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{success}</div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            
            {/* Username Input */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                {t("username_label")}
              </label>
              <div className="relative">
                <User className={`w-4 h-4 text-gray-400 absolute ${dir === "rtl" ? "right-3.5" : "left-3.5"} top-1/2 -translate-y-1/2 pointer-events-none`} />
                <input
                  type="text"
                  required
                  placeholder={t("username_placeholder")}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={`w-full ${dir === "rtl" ? "pr-10 pl-4 text-right" : "pl-10 pr-4 text-left"} py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition`}
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-gray-600">
                  {t("password_label")}
                </label>
              </div>
              <div className="relative">
                <KeyRound className={`w-4 h-4 text-gray-400 absolute ${dir === "rtl" ? "right-3.5" : "left-3.5"} top-1/2 -translate-y-1/2 pointer-events-none`} />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder={t("password_placeholder") || "••••••••••••"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full ${dir === "rtl" ? "pr-10 pl-10 text-right" : "pl-10 pr-10 text-left"} py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition font-mono`}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className={`absolute ${dir === "rtl" ? "left-3" : "right-3"} top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition cursor-pointer`}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3.5 px-4 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-500 text-white font-bold rounded-xl shadow-lg shadow-amber-500/25 transition duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>{t("logging_in")}</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>{t("login_button")}</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer info */}
        <div className="text-center mt-6 text-xs text-gray-400">
          {t("copyright")}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
