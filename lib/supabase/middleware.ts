import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session (if needed) inside Next.js middleware and
 * returns both the resolved user and the response object that carries any
 * updated session cookies. This is the standard @supabase/ssr middleware
 * pattern — it MUST run on every request so refresh tokens rotate correctly
 * and sessions don't silently expire mid-use.
 */
export async function updateSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // Fail closed: without Supabase configured we cannot verify anyone's
    // session, so treat every request as unauthenticated rather than
    // silently letting requests through.
    return { response, user: null };
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // IMPORTANT: do not run other logic between createServerClient and
  // getUser(). getUser() revalidates the token against Supabase Auth and
  // refreshes it if needed — using getSession() here would trust a
  // potentially stale/forged cookie instead.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
