import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser Supabase client. Uses only the public anon key, which is safe to
 * ship to the client BECAUSE Row Level Security policies (see
 * supabase/migrations/005_auth_security_foundation.sql) restrict what it can
 * read or write. There is intentionally no hardcoded fallback here — if the
 * env vars are missing, fail loudly instead of silently pointing at a
 * placeholder project.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase is not configured: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are missing."
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
