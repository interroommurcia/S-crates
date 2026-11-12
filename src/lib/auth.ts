// Compatible con Edge (Web Crypto). Usado por middleware y rutas de auth.

const enc = new TextEncoder();

function secret(): string {
  return (process.env.AUTH_SECRET ?? "").replace(/[^\x20-\x7E]/g, "");
}

function b64url(bytes: ArrayBuffer): string {
  const b = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64url(sig);
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export const SESSION_COOKIE = "socrates_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 dias

export async function createSessionToken(): Promise<string> {
  const exp = Date.now() + SESSION_MAX_AGE * 1000;
  const payload = String(exp);
  const sig = await hmac(payload);
  return `${payload}.${sig}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token || !secret()) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmac(payload);
  if (!timingSafeEqual(sig, expected)) return false;
  const exp = Number(payload);
  return Number.isFinite(exp) && exp > Date.now();
}

// Firma generica con separacion de dominio (p.ej. el challenge de WebAuthn),
// para que una firma de un contexto no valga en otro.
export async function signValue(domain: string, value: string): Promise<string> {
  return hmac(`${domain}:${value}`);
}

export async function verifySignedValue(
  domain: string,
  value: string,
  sig: string
): Promise<boolean> {
  if (!secret()) return false;
  return timingSafeEqual(sig, await signValue(domain, value));
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function pbkdf2Hex(
  password: string,
  saltHex: string,
  iterations: number
): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(saltHex), iterations },
    key,
    256
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// AUTH_PASSWORD_HASH admite dos formatos:
//  - "pbkdf2:<iteraciones>:<saltHex>:<hashHex>"  (recomendado; ver scripts/hash-password.mjs)
//  - "<sha256Hex>"  (heredado: sin sal y rapido de crackear si el hash se filtra)
export async function verifyPassword(password: string): Promise<boolean> {
  const hash = (process.env.AUTH_PASSWORD_HASH ?? "").replace(/[^\x20-\x7E]/g, "").toLowerCase();
  if (!hash || password.length > 256) return false;

  if (hash.startsWith("pbkdf2:")) {
    const [, iterS, saltHex, hashHex] = hash.split(":");
    const iterations = Number(iterS);
    if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 5_000_000) return false;
    if (!/^[0-9a-f]{16,}$/.test(saltHex ?? "") || !/^[0-9a-f]{64}$/.test(hashHex ?? "")) return false;
    return timingSafeEqual(await pbkdf2Hex(password, saltHex, iterations), hashHex);
  }

  const got = await sha256Hex(password);
  return timingSafeEqual(got, hash);
}
