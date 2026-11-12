import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Rutas publicas (no requieren sesion)
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/passkey/login",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Anti-CSRF: ninguna peticion que modifique estado puede venir de otro origen.
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    let sameOrigin = true;
    if (origin) {
      try {
        sameOrigin = new URL(origin).host === req.headers.get("host");
      } catch {
        sameOrigin = false;
      }
    }
    if (!sameOrigin || req.headers.get("sec-fetch-site") === "cross-site") {
      return jsonNoIndex({ error: "origen no permitido" }, 403);
    }
  }

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const authed = await verifySessionToken(token);

  if (!authed && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return jsonNoIndex({ error: "no autorizado" }, 401);
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const res = NextResponse.redirect(url);
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  }

  // Si ya esta autenticado y va a /login, mandarlo a la home
  if (authed && pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

function jsonNoIndex(body: unknown, status: number) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|robots.txt).*)"],
};
