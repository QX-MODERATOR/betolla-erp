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
import { encryptPayload } from "@/lib/security";
import { useLanguage } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/common/language-switcher";

function LoginForm() {
  const { dir, t } = useLanguage();
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

      // Client-side AES-GCM 256-bit Payload Encryption
      const encryptedPackage = await encryptPayload({
        username: username.trim(),
        password: password,
      });

      // Transmit encrypted payload to the server
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "BetollaSecureClient",
        },
        body: JSON.stringify(encryptedPackage),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || (dir === "rtl" ? "فشل تسجيل الدخول. يرجى التحقق من البيانات." : "Login failed. Please check your credentials."));
      }

      // Save Bearer Token locally for client API header requests
      if (data.token) {
        localStorage.setItem("betolla_token", data.token);
        localStorage.setItem("betolla_user", JSON.stringify(data.user));
      }

      const targetUrl = data.redirectUrl || (data.user?.role === "sales_rep" ? "/sales" : returnUrl);
      setSuccess(
        data.user?.role === "sales_rep"
          ? (dir === "rtl" ? "مرحباً يا رحمة! تم التحقق بنجاح وجاري نقلك إلى بوابة المبيعات..." : "Welcome Rahma! Access verified, redirecting to Sales Portal...")
          : (dir === "rtl" ? "تم التحقق وتأكيد الهوية بنجاح! جاري تحويلك للوحة التحكم..." : "Authentication successful! Redirecting to Dashboard...")
      );

      // Redirect to destination
      setTimeout(() => {
        router.push(targetUrl);
        router.refresh();
      }, 700);
    } catch (err: any) {
      setError(err?.message || (dir === "rtl" ? "حدث خطأ أثناء محاولة تسجيل الدخول." : "An error occurred while attempting to sign in."));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-stone-950 via-stone-900 to-stone-950 flex flex-col items-center justify-center p-4 sm:p-6 text-stone-100 font-sans selection:bg-amber-500 selection:text-stone-950">
      
      {/* Ambient background glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 left-1/4 w-96 h-96 bg-amber-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        
        {/* Top Language Switcher Bar */}
        <div className={`flex ${dir === "rtl" ? "justify-start" : "justify-end"} mb-4`}>
          <LanguageSwitcher variant="pill" />
        </div>

        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 via-amber-400 to-amber-300 text-stone-950 shadow-xl shadow-amber-500/20 mb-4 ring-4 ring-amber-500/20">
            <Sparkles className="w-8 h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            {t("login_title")}
          </h1>
          <p className="text-sm text-amber-400/90 font-medium mt-1">
            {t("login_subtitle")}
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-stone-900/90 border border-stone-800 backdrop-blur-xl rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/60 relative overflow-hidden">
          
          {/* Subtle gold top border highlight */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-amber-500 to-transparent" />

          {/* Alerts */}
          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-200 text-xs flex items-start gap-2.5 animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{error}</div>
            </div>
          )}

          {success && (
            <div className="mb-5 p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-200 text-xs flex items-start gap-2.5 animate-in fade-in slide-in-from-top-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{success}</div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            
            {/* Username Input */}
            <div>
              <label className="block text-xs font-semibold text-stone-300 mb-1.5">
                {t("username_label")}
              </label>
              <div className="relative">
                <User className={`w-4 h-4 text-stone-500 absolute ${dir === "rtl" ? "right-3.5" : "left-3.5"} top-1/2 -translate-y-1/2 pointer-events-none`} />
                <input
                  type="text"
                  required
                  placeholder={t("username_placeholder")}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={`w-full ${dir === "rtl" ? "pr-10 pl-4 text-right" : "pl-10 pr-4 text-left"} py-3 bg-stone-950/70 border border-stone-700/80 rounded-xl text-stone-100 placeholder-stone-500 text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition`}
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-stone-300">
                  {t("password_label")}
                </label>
              </div>
              <div className="relative">
                <KeyRound className={`w-4 h-4 text-stone-500 absolute ${dir === "rtl" ? "right-3.5" : "left-3.5"} top-1/2 -translate-y-1/2 pointer-events-none`} />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder={t("password_placeholder") || "••••••••••••"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full ${dir === "rtl" ? "pr-10 pl-10 text-right" : "pl-10 pr-10 text-left"} py-3 bg-stone-950/70 border border-stone-700/80 rounded-xl text-stone-100 placeholder-stone-500 text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition font-mono`}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className={`absolute ${dir === "rtl" ? "left-3" : "right-3"} top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-200 transition cursor-pointer`}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3.5 px-4 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-bold rounded-xl shadow-lg shadow-amber-500/25 transition duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-stone-950 border-t-transparent rounded-full animate-spin" />
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
        <div className="text-center mt-6 text-xs text-stone-500">
          {t("copyright")}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-stone-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
