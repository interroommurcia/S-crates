import { generateRegistrationOptions } from "@simplewebauthn/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import {
  RP_NAME,
  rpConfig,
  userId,
  userName,
  setChallenge,
} from "@/lib/webauthn";

export const runtime = "nodejs";

// Protegida por middleware (requiere sesion).
export async function POST(req: Request) {
  const { rpID } = rpConfig(req);

  const { data: existing } = await supabaseAdmin
    .from("credentials")
    .select("credential_id, transports");

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userID: userId(),
    userName: userName(),
    attestationType: "none",
    excludeCredentials: (existing ?? []).map((c) => ({
      id: c.credential_id,
      transports: (c.transports ?? []) as never,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  await setChallenge(options.challenge);
  return Response.json(options);
}
