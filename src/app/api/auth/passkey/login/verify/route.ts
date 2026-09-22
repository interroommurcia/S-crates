import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase-server";
import { rpConfig, getChallenge, clearChallenge } from "@/lib/webauthn";
import { SESSION_COOKIE, SESSION_MAX_AGE, createSessionToken } from "@/lib/auth";

export const runtime = "nodejs";

// Publica (login).
export async function POST(req: Request) {
  const body = await req.json();
  const { rpID, origin } = rpConfig(req);
  const expectedChallenge = await getChallenge();

  if (!expectedChallenge) {
    return Response.json({ error: "challenge expirado" }, { status: 400 });
  }

  const credId = body.credential?.id as string | undefined;
  if (!credId) return Response.json({ error: "sin credencial" }, { status: 400 });

  const { data: cred } = await supabaseAdmin
    .from("credentials")
    .select("*")
    .eq("credential_id", credId)
    .single();

  if (!cred) return Response.json({ error: "credencial desconocida" }, { status: 400 });

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.credential,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: cred.credential_id,
        publicKey: new Uint8Array(Buffer.from(cred.public_key, "base64")),
        counter: Number(cred.counter),
        transports: (cred.transports ?? []) as never,
      },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "verificacion fallida" },
      { status: 400 }
    );
  }

  await clearChallenge();

  if (!verification.verified) {
    return Response.json({ error: "no verificado" }, { status: 401 });
  }

  await supabaseAdmin
    .from("credentials")
    .update({
      counter: verification.authenticationInfo.newCounter,
      last_used_at: new Date().toISOString(),
    })
    .eq("credential_id", credId);

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
