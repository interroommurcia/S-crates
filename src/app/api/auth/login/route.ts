import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  verifyPassword,
} from "@/lib/auth";
import { clientIp, loginBlocked, recordLoginFailure, purgeOldAttempts } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { password } = (await req.json().catch(() => ({}))) as { password?: unknown };
  const ip = clientIp(req);

  // Bloqueo por demasiados fallos recientes (por IP y global). El passkey
  // sigue funcionando aunque el login por contraseña este bloqueado.
  if (await loginBlocked(ip)) {
    return Response.json(
      { error: "Demasiados intentos. Espera 15 minutos o entra con passkey." },
      { status: 429, headers: { "Retry-After": "900" } }
    );
  }

  // Retardo fijo adicional
  await new Promise((r) => setTimeout(r, 600));

  if (typeof password !== "string" || !password || !(await verifyPassword(password))) {
    await recordLoginFailure(ip);
    return Response.json({ error: "Contraseña incorrecta" }, { status: 401 });
  }
  void purgeOldAttempts().catch(() => {});

  const token = await createSessionToken();
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  return Response.json({ ok: true });
}
