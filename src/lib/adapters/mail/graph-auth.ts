// Auth Microsoft Graph app-only (client credentials), partagee par les adapters
// mail (lecture + ecriture). Token obtenu avec le secret de l'app ; l'acces aux
// boites est borne cote tenant par l'Application Access Policy.

export const GRAPH = "https://graph.microsoft.com/v1.0";

// Timeout de TOUS les appels Graph (surchargeable via GRAPH_TIMEOUT_MS). Sans lui, un
// Graph qui hang (panne, throttling silencieux) bloque la server action jusqu'au timeout
// plateforme (plusieurs minutes) : le gestionnaire re-clique, et un envoi peut partir en
// double. 30 s est large pour une requete Graph qui marche.
const TIMEOUT_MS = Number(process.env.GRAPH_TIMEOUT_MS) || 30_000;

/**
 * fetch vers Graph avec timeout systematique + UN retry sur 429/5xx pour les GET
 * uniquement (idempotents), en honorant Retry-After (plafonne a 5 s). Les ecritures
 * (POST/PATCH/DELETE) ne sont JAMAIS rejouees ici : un send/move rejoue apres un 5xx
 * tardif creerait un doublon ; c'est l'appelant (humain) qui decide.
 */
export async function graphFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = TIMEOUT_MS,
): Promise<Response> {
  const appel = () => fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  let r = await appel();
  const methode = (init.method ?? "GET").toUpperCase();
  if (methode === "GET" && (r.status === 429 || r.status >= 500)) {
    const retryAfter = Number(r.headers.get("retry-after"));
    await new Promise((res) =>
      setTimeout(res, Math.min(5_000, retryAfter > 0 ? retryAfter * 1000 : 1_000)),
    );
    r = await appel();
  }
  return r;
}

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
    // Timeout aussi sur le POST OAuth : un login.microsoftonline.com qui hang bloque
    // TOUT le module mail/calendrier (le token est le prealable de chaque appel).
    signal: AbortSignal.timeout(TIMEOUT_MS),
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
  const r = await graphFetch(url, { headers: { Authorization: `Bearer ${tk}` } });
  if (!r.ok) throw new Error(`Graph resoudre message ${r.status} : ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { value?: { id: string }[] };
  const id = j.value?.[0]?.id;
  if (!id) throw new Error("Message introuvable dans la boite (deplace ou supprime ?).");
  return id;
}
