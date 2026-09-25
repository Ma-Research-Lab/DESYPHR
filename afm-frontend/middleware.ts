import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  if (!request.cookies.has("bypass-tunnel-reminder")) {
    response.cookies.set("bypass-tunnel-reminder", "1", {
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      sameSite: "none",
      secure: true,
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
