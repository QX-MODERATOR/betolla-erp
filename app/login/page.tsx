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
import { encryptPayload, isEncryptionSupported } from "@/lib/security";
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
        ar: "جاري تسجيل الدخول والتحقق من الحساب...",
        en: "Logging in & verifying credentials..."
      });

      // Prepare payload - encrypt with AES-256 if supported (Secure Context), otherwise transmit cleanly
      let payloadBody: any = {
        username: username.trim(),
        password: password,
      };

      if (isEncryptionSupported()) {
        try {
          const encryptedPackage = await encryptPayload(payloadBody);
          if (encryptedPackage) {
            payloadBody = encryptedPackage;
          }
        } catch (encErr) {
          console.warn("Client encryption fallback:", encErr);
        }
      }

      // Transmit payload to the server
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "BetollaSecureClient",
        },
        body: JSON.stringify(payloadBody),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || (dir === "rtl" ? "فشل تسجيل الدخول. يرجى التحقق من البيانات." : "Login failed. Please check your credentials."));
      }

      // Save Bearer Token locally for client API header requests & middleware fallback
      if (data.token) {
        localStorage.setItem("betolla_token", data.token);
        localStorage.setItem("betolla_user", JSON.stringify(data.user));
        try {
          document.cookie = `betolla_token=${encodeURIComponent(data.token)}; path=/; max-age=604800; SameSite=Lax`;
        } catch (cookieErr) {
          console.warn("Could not set client cookie:", cookieErr);
        }
      }

      let targetUrl = data.redirectUrl || returnUrl;
      if (!targetUrl || targetUrl === "/login") {
        targetUrl = "/";
      }

      const role = data.user?.role || "admin";
      const welcomeMsg = ROLE_WELCOME[role] || ROLE_WELCOME.admin;
      setSuccess(dir === "rtl" ? welcomeMsg.ar : welcomeMsg.en);

      // Redirect to destination with clean page reload so all contexts bootstrap with the new user
      setTimeout(() => {
        window.location.replace(targetUrl);
      }, 400);
    } catch (err: any) {
      stopLoading();
      setError(err?.message || (dir === "rtl" ? "حدث خطأ أثناء محاولة تسجيل الدخول." : "An error occurred while attempting to sign in."));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#faf7f2] flex flex-col items-center justify-center p-4 sm:p-6 text-[#2b2926] font-sans selection:bg-[#9e8959] selection:text-[#160f02]">
      
      {/* Subtle ambient gold background glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 right-1/4 w-96 h-96 bg-[#9e8959]/10 rounded-full blur-3xl animate-float" />
        <div className="absolute -bottom-40 left-1/4 w-96 h-96 bg-[#c28a40]/10 rounded-full blur-3xl animate-float-delayed" />
      </div>

      <div className="relative w-full max-w-md">
        
        {/* Top Language Switcher Bar */}
        <div className={`flex ${dir === "rtl" ? "justify-start" : "justify-end"} mb-4`}>
          <LanguageSwitcher variant="pill" />
        </div>

        {/* Brand Header */}
        <div className="text-center mb-6">
          {/* Official Betolla Brand Logo */}
          <div className="inline-flex items-center justify-center p-3.5 rounded-2xl bg-gradient-to-br from-[#160f02] to-[#241a08] border border-[#554625] shadow-xl shadow-black/20 mb-3 ring-4 ring-[#9e8959]/20">
            <img 
              src="/brand/betolla-logo-clean.png" 
              alt="Betolla Cosmetics" 
              className="h-10 w-auto object-contain filter brightness-0 invert"
            />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#2b2926]">
            {t("login_title")}
          </h1>
          <p className="text-sm text-[#9e8959] font-bold mt-1">
            {t("login_subtitle")}
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white border border-[#e8dfcf] rounded-3xl p-6 sm:p-8 shadow-xl shadow-[#e8dfcf]/60 relative overflow-hidden">
          
          {/* Subtle gold top border highlight */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#9e8959] to-transparent" />

          {/* Alerts */}
          {error && (
            <div role="alert" id="login-error" className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5 animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed font-medium">{error}</div>
            </div>
          )}

          {success && (
            <div role="status" className="mb-5 p-3.5 rounded-xl bg-[#533f16]/10 border border-[#533f16]/25 text-[#533f16] text-xs flex items-start gap-2.5 animate-in fade-in slide-in-from-top-2">
              <CheckCircle2 className="w-4 h-4 text-[#533f16] shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed font-medium">{success}</div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            
            {/* Username Input */}
            <div>
              <label htmlFor="login-username" className="block text-xs font-semibold text-[#6b655d] mb-1.5">
                {t("username_label")}
              </label>
              <div className="relative">
                <User className={`w-4 h-4 text-[#6b655d]/70 absolute ${dir === "rtl" ? "right-3.5" : "left-3.5"} top-1/2 -translate-y-1/2 pointer-events-none`} />
                <input
                  id="login-username" aria-describedby={error ? "login-error" : undefined}
                  type="text"
                  required
                  placeholder={t("username_placeholder")}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={`w-full ${dir === "rtl" ? "pr-10 pl-4 text-right" : "pl-10 pr-4 text-left"} py-3 bg-[#faf7f2] border border-[#e8dfcf] rounded-xl text-[#2b2926] placeholder-[#6b655d]/60 text-base focus:outline-none focus:border-[#9e8959] focus:ring-2 focus:ring-[#9e8959]/20 transition`}
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-password" className="block text-xs font-semibold text-[#6b655d]">
                  {t("password_label")}
                </label>
              </div>
              <div className="relative">
                <KeyRound className={`w-4 h-4 text-[#6b655d]/70 absolute ${dir === "rtl" ? "right-3.5" : "left-3.5"} top-1/2 -translate-y-1/2 pointer-events-none`} />
                <input
                  id="login-password" aria-describedby={error ? "login-error" : undefined}
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder={t("password_placeholder") || "••••••••••••"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full ${dir === "rtl" ? "pr-10 pl-10 text-right" : "pl-10 pr-10 text-left"} py-3 bg-[#faf7f2] border border-[#e8dfcf] rounded-xl text-[#2b2926] placeholder-[#6b655d]/60 text-base focus:outline-none focus:border-[#9e8959] focus:ring-2 focus:ring-[#9e8959]/20 transition font-mono`}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-pressed={showPassword}
                  aria-label={dir === "rtl" ? (showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور") : (showPassword ? "Hide password" : "Show password")}
                  className={`absolute ${dir === "rtl" ? "left-0" : "right-0"} top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-[#6b655d] hover:text-[#2b2926] transition cursor-pointer`}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3.5 px-4 bg-gradient-to-r from-[#9e8959] via-[#bda66d] to-[#9e8959] hover:from-[#bda66d] hover:to-[#9e8959] text-[#160f02] font-black rounded-xl shadow-lg shadow-[#9e8959]/30 transition duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed active:scale-95"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#160f02] border-t-transparent rounded-full animate-spin" />
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
        <div className="text-center mt-6 text-xs text-[#6b655d]">
          {t("copyright")}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#faf7f2] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#9e8959] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
