import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/app/(auth)/safe-next";

/**
 * PKCE callback for email links (confirmation, magic link, recovery) and
 * OAuth. Exchanges the one-time `code` for a session cookie, then sends the
 * user on to `next` (relative paths only) or the dashboard.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
    console.error("auth callback: code exchange failed", error.message);
  }

  const failure = new URL("/sign-in", origin);
  failure.searchParams.set("error", "auth_callback");
  return NextResponse.redirect(failure);
}
