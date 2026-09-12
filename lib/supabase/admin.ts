import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. BYPASSES Row Level Security entirely.
 *
 * Server-only. Never import this from a Client Component, never send its
 * output to the browser, and never log the key it reads.
 *
 * Allowed callers: user-provisioning scripts (scripts/provision_users.mjs)
 * and narrow, explicitly-audited server-side operations (e.g. the login
 * rate-limit store in lib/rate-limit.ts). Do NOT use this for anything a
 * request handler could instead do with the caller's own session via
 * lib/supabase/server.ts.
 */
let cachedClient: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("getSupabaseAdminClient() must never be called from browser code.");
  }

  if (cachedClient) return cachedClient;

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  cachedClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedClient;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env.local and fill in real Supabase project values.`
    );
  }
  return value;
}
