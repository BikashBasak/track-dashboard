import { NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  authCookieOptions,
  getDashboardPassword,
  makeSessionToken,
} from "@/lib/auth/session";

export async function POST(request: Request) {
  const password = getDashboardPassword();
  if (!password) {
    return NextResponse.json(
      { error: "DASHBOARD_PASSWORD is not set on the server." },
      { status: 503 },
    );
  }

  let body: { password?: string } = {};
  try {
    body = (await request.json()) as { password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const submitted = String(body.password ?? "");
  if (!submitted || submitted !== password) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const token = await makeSessionToken(password);
  const secure = process.env.NODE_ENV === "production";
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, token, authCookieOptions(secure));
  return res;
}
