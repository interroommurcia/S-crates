import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { rpConfig, getChallenge, clearChallenge } from "@/lib/webauthn";

export const runtime = "nodejs";

// Protegida por middleware (requiere sesion).
export async function POST(req: Request) {
  const body = await req.json();
  const { rpID, origin } = rpConfig(req);
  const expectedChallenge = await getChallenge();

  if (!expectedChallenge) {
    return Response.json({ error: "challenge expirado" }, { status: 400 });
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.credential,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "verificacion fallida" },
      { status: 400 }
    );
  }

  await clearChallenge();

  if (!verification.verified || !verification.registrationInfo) {
    return Response.json({ error: "no verificado" }, { status: 400 });
  }

  const { credential } = verification.registrationInfo;
  const { error } = await supabaseAdmin.from("credentials").insert({
    credential_id: credential.id,
    public_key: Buffer.from(credential.publicKey).toString("base64"),
    counter: credential.counter,
    transports: credential.transports ?? [],
    label: body.label ?? null,
  });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
