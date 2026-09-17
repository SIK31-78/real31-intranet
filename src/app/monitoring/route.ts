// Tunnel Sentry maison : les evenements du navigateur passent par notre domaine (les
// bloqueurs coupent *.sentry.io), mais on ne relaie QUE vers notre projet (cf.
// lib/securite/tunnel-sentry). Route publique par construction (le proxy l'exclut), sans
// PII : le corps est une enveloppe Sentry deja expurgee cote client.

import { destinationEnveloppe, TAILLE_MAX_ENVELOPPE } from "@/lib/securite/tunnel-sentry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const taille = Number(req.headers.get("content-length") ?? 0);
  if (taille > TAILLE_MAX_ENVELOPPE) return new Response(null, { status: 413 });
  const enveloppe = await req.text();
  if (enveloppe.length > TAILLE_MAX_ENVELOPPE) return new Response(null, { status: 413 });

  const destination = destinationEnveloppe(enveloppe, process.env.NEXT_PUBLIC_SENTRY_DSN);
  if (!destination) return new Response(null, { status: 400 });

  try {
    const r = await fetch(destination, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body: enveloppe,
    });
    return new Response(null, { status: r.ok ? 200 : r.status });
  } catch {
    // Sentry injoignable : le navigateur n'a rien a en faire, on ne fait pas de bruit.
    return new Response(null, { status: 502 });
  }
}
