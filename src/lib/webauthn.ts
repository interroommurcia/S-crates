import { cookies } from "next/headers";
import { signValue, verifySignedValue } from "./auth";

export const RP_NAME = "Sócrates";
export const CHALLENGE_COOKIE = "wa_challenge";
const USER_NAME = "socrates";

// Un solo usuario: handle fijo.
export function userId(): Uint8Array<ArrayBuffer> {
  const s = "socrates-user";
  const view = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i);
  return view;
}

export function userName(): string {
  return USER_NAME;
}

export function rpConfig(req: Request): { rpID: string; origin: string } {
  const host = req.headers.get("host") ?? "localhost:3000";
  const proto =
    req.headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const rpID = host.split(":")[0];
  return { rpID, origin: `${proto}://${host}` };
}

const CHALLENGE_TTL = 300; // segundos

// El challenge viaja en una cookie FIRMADA y con caducidad: asi el cliente no
// puede fijar un challenge arbitrario (lo que permitiria reutilizar una
// respuesta de passkey capturada en el pasado).
export async function setChallenge(challenge: string): Promise<void> {
  const exp = Date.now() + CHALLENGE_TTL * 1000;
  const value = `${challenge}.${exp}`;
  const sig = await signValue("wa-challenge", value);
  const jar = await cookies();
  jar.set(CHALLENGE_COOKIE, `${value}.${sig}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: CHALLENGE_TTL,
  });
}

export async function getChallenge(): Promise<string | undefined> {
  const jar = await cookies();
  const raw = jar.get(CHALLENGE_COOKIE)?.value;
  if (!raw) return undefined;
  const parts = raw.split(".");
  if (parts.length !== 3) return undefined;
  const [challenge, exp, sig] = parts;
  if (!(await verifySignedValue("wa-challenge", `${challenge}.${exp}`, sig))) return undefined;
  if (!(Number(exp) > Date.now())) return undefined;
  return challenge;
}

export async function clearChallenge(): Promise<void> {
  const jar = await cookies();
  jar.set(CHALLENGE_COOKIE, "", { path: "/", maxAge: 0 });
}
