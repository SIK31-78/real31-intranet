// Auth Microsoft Graph app-only (client credentials), partagee par les adapters
// mail (lecture + ecriture). Token obtenu avec le secret de l'app ; l'acces aux
// boites est borne cote tenant par l'Application Access Policy.

export const GRAPH = "https://graph.microsoft.com/v1.0";

function tenant(): string | null {
  const m = (process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER || "").match(
    /login\.microsoftonline\.com\/([^/]+)/,
  );
  return m?.[1] ?? null;
}

// Cache module-level du token applicatif : meme token pour toute l'app, valable ~3600s.
// Evite un POST OAuth a Microsoft a chaque appel Graph (le cookie eStale fait deja pareil).
let _tokenCache: { value: string; expiresAt: number } | null = null;

export async function jetonGraph(): Promise<string> {
  if (_tokenCache && Date.now() < _tokenCache.expiresAt - 60_000) return _tokenCache.value;
  const t = tenant();
  const id = process.env.AUTH_MICROSOFT_ENTRA_ID_ID;
  const secret = process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET;
  if (!t || !id || !secret) {
    throw new Error("Identifiants Entra absents (AUTH_MICROSOFT_ENTRA_ID_ID/SECRET/ISSUER).");
  }
  const r = await fetch(`https://login.microsoftonline.com/${t}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!r.ok) throw new Error(`Token Graph ${r.status} : ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error("Token Graph : access_token absent.");
  _tokenCache = { value: j.access_token, expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return j.access_token;
}

/** Resout l'id Graph courant d'un message par son internetMessageId (immuable). */
export async function resoudreMessageId(
  tk: string,
  boite: string,
  internetMessageId: string,
): Promise<string> {
  const imid = internetMessageId.replace(/'/g, "''"); // echappe les quotes OData
  const url =
    `${GRAPH}/users/${encodeURIComponent(boite)}/messages` +
    `?$filter=${encodeURIComponent(`internetMessageId eq '${imid}'`)}&$select=id&$top=1`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${tk}` } });
  if (!r.ok) throw new Error(`Graph resoudre message ${r.status} : ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { value?: { id: string }[] };
  const id = j.value?.[0]?.id;
  if (!id) throw new Error("Message introuvable dans la boite (deplace ou supprime ?).");
  return id;
}
