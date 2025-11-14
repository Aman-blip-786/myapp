import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        detectSessionInUrl: false,
      },
    }
  );

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("Auth error:", error);
    } else if (data.session) {
      cookies().set("sb-access-token", data.session.access_token, {
        path: "/",
        httpOnly: true,
      });
      cookies().set("sb-refresh-token", data.session.refresh_token, {
        path: "/",
        httpOnly: true,
      });
    }
  }

  return NextResponse.redirect(new URL("/dashboard", requestUrl.origin));
}
