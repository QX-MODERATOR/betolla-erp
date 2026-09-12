import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client bound to Next.js request cookies via @supabase/ssr.
 * Uses the public anon key — safe here because all authorization is enforced by
 * Postgres Row Level Security policies, not by trusting this client.
 *
 * Use this inside Route Handlers and Server Components for anything that should
 * run as the currently signed-in user (auth.signInWithPassword, auth.getUser, etc).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Route Handlers can always set cookies; this only throws when called
          // from a Server Component render, which never happens for our usage.
        }
      },
    },
  });
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
