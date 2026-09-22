import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { rpConfig, setChallenge } from "@/lib/webauthn";

export const runtime = "nodejs";

// Publica (login).
export async function POST(req: Request) {
  const { rpID } = rpConfig(req);

  const { data: creds } = await supabaseAdmin
    .from("credentials")
    .select("credential_id, transports");

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: (creds ?? []).map((c) => ({
      id: c.credential_id,
      transports: (c.transports ?? []) as never,
    })),
    userVerification: "preferred",
  });

  await setChallenge(options.challenge);
  return Response.json(options);
}
