import { supabaseAdmin } from "./supabase-server";

// Limitador de intentos de login. Persistente en Supabase (tabla login_attempts,
// ver supabase-schema-v18.sql) porque en serverless la memoria no se comparte
// entre instancias. Si la tabla no esta disponible cae a un limitador en memoria
// (mas debil, pero nunca deja el login sin freno).

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP = 5; // fallos por IP en la ventana
const MAX_GLOBAL = 20; // fallos totales en la ventana (ataque distribuido)

const memory: { ip: string; at: number }[] = [];

export function clientIp(req: Request): string {
  // En Vercel estas cabeceras las fija la plataforma (no el cliente).
  const h = req.headers;
  const raw =
    h.get("x-vercel-forwarded-for") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for") ?? "";
  return raw.split(",")[0].trim().slice(0, 64) || "unknown";
}

function memoryBlocked(ip: string): boolean {
  const since = Date.now() - WINDOW_MS;
  while (memory.length && memory[0].at < since) memory.shift();
  return (
    memory.filter((a) => a.ip === ip).length >= MAX_PER_IP || memory.length >= MAX_GLOBAL
  );
}

/** true si hay que rechazar el intento (demasiados fallos recientes). */
export async function loginBlocked(ip: string): Promise<boolean> {
  if (memoryBlocked(ip)) return true;
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const [perIp, global] = await Promise.all([
    supabaseAdmin
      .from("login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", since),
    supabaseAdmin
      .from("login_attempts")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since),
  ]);
  if (perIp.error || global.error) {
    console.error(
      "[rate-limit] login_attempts no disponible (¿falta ejecutar supabase-schema-v18.sql?):",
      perIp.error?.message ?? global.error?.message
    );
    return false; // ya se comprobo el limitador en memoria arriba
  }
  return (perIp.count ?? 0) >= MAX_PER_IP || (global.count ?? 0) >= MAX_GLOBAL;
}

export async function recordLoginFailure(ip: string): Promise<void> {
  memory.push({ ip, at: Date.now() });
  if (memory.length > 500) memory.shift();
  const { error } = await supabaseAdmin.from("login_attempts").insert({ ip });
  if (error) console.error("[rate-limit] no se pudo registrar el fallo:", error.message);
}

/** Limpieza perezosa de intentos antiguos (se llama tras un login correcto). */
export async function purgeOldAttempts(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await supabaseAdmin.from("login_attempts").delete().lt("created_at", cutoff);
}
