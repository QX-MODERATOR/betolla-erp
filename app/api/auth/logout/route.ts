import { NextResponse } from "next/server";
import { extractTokenFromRequest, verifyAuthTokenSignature } from "@/lib/auth";
import { revokeToken } from "@/lib/session";
import { clearedSessionCookie } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

// Ends this session on the server (the token stops working everywhere), then clears the cookie.
export async function POST(req: Request) {
  const token = extractTokenFromRequest(req);
  const session = token ? await verifyAuthTokenSignature(token) : null;
  if (session) await revokeToken(session.user.id, session.tokenId, session.expiresAt);

  const response = NextResponse.json({ success: true, message: "تم تسجيل الخروج بنجاح" });
  response.cookies.set(clearedSessionCookie(req));
  return response;
}
