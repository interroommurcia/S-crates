import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "./auth";

// Defensa en profundidad: cada route handler verifica la sesion por si mismo,
// sin depender solo del middleware (que ha tenido bypasses historicos en Next).
// Devuelve una Response 401 si no hay sesion valida, o null si se puede seguir.
export async function requireSession(): Promise<Response | null> {
  const jar = await cookies();
  if (await verifySessionToken(jar.get(SESSION_COOKIE)?.value)) return null;
  return Response.json(
    { error: "no autorizado" },
    { status: 401, headers: { "X-Robots-Tag": "noindex, nofollow" } }
  );
}
