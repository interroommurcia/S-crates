import { cookies } from "next/headers";

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

export async function setChallenge(challenge: string): Promise<void> {
  const jar = await cookies();
  jar.set(CHALLENGE_COOKIE, challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });
}

export async function getChallenge(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(CHALLENGE_COOKIE)?.value;
}

export async function clearChallenge(): Promise<void> {
  const jar = await cookies();
  jar.set(CHALLENGE_COOKIE, "", { path: "/", maxAge: 0 });
}
