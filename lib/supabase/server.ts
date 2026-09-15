import { createClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase Client
 * Uses the service role key to bypass RLS and ensures no cached queries.
 */
export function createServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('خدمة الحفظ غير مهيأة. لم يتم تأكيد أي حفظ.');
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: (url, options = {}) => {
        return fetch(url, {
          ...options,
          cache: 'no-store',
        });
      },
    },
  });
}
