// Auth Microsoft Graph app-only (client credentials), partagee par les adapters
// mail (lecture + ecriture). Token obtenu avec le secret de l'app ; l'acces aux
// boites est borne cote tenant par l'Application Access Policy.
//
// IDENTIFIANTS IMMUABLES (REA-420, 27/10/2026) : tout appel mail (URL en /messages ou
// /mailFolders : lectures, delta, move, PATCH, pieces jointes, brouillons) part avec
// `Prefer: IdType="ImmutableId"`, ajoute a la suite des preferences deja posees (un seul
// en-tete, valeurs separees par des virgules : Graph applique les deux, constate sur syndic4).
// Avant, un mail deplace changeait d'id : d'ou `localiser` partout et un `message_id` de
// journal faux des qu'on glissait un mail a la main. Constate sur syndic4 le 27/10/2026 :
//   - Graph accepte les DEUX formats en entree, avec ou sans l'en-tete : les ids mutables
//     deja stockes (journal, index de la reception) continuent de marcher ;
//   - les ids de dossiers ne changent pas (l'en-tete ne concerne que les elements) :
//     `intranet_tri_dossier.folder_id` reste valable.
// Transition : l'identifiant de reference reste `internet_message_id` ; `message_id` du
// journal est informatif. L'index de la reception est relu en entier au premier passage
// (jeton delta marque, graph-reception-delta.ts) pour y remplacer les anciens ids. Les
// calendriers ne sont pas concernes (leurs ids d'evenements restent ceux d'avant).

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
  init = avecIdsImmuables(url, init);
  const appel = () => fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  let r = await appel();
  const methode = (init.method ?? "GET").toUpperCase();
  // 401 avec un jeton applicatif : il a ete revoque ou a expire plus tot que prevu. On en
  // redemande un et on rejoue UNE fois, toutes methodes confondues (la requete n'est pas
  // partie cote Graph). Audit du 27/10/2026.
  if (r.status === 401 && entete(init.headers, "authorization")?.startsWith("Bearer ")) {
    oublierJeton();
    const neuf = await jetonGraph();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${neuf}`);
    r = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
  }
  if (methode === "GET" && (r.status === 429 || r.status >= 500)) {
    const retryAfter = Number(r.headers.get("retry-after"));
    await new Promise((res) =>
      setTimeout(res, Math.min(5_000, retryAfter > 0 ? retryAfter * 1000 : 1_000)),
    );
    r = await appel();
  }
  return r;
}

/** Un appel aux mails d'une boite (elements ou dossiers), pas au calendrier ni a SharePoint. */
const URL_MAIL = /\/(messages|mailFolders)(\/|\?|\(|$)/i;

/**
 * Ajoute `IdType="ImmutableId"` aux preferences d'un appel mail, sans ecraser celles deja
 * posees (`outlook.body-content-type="text"`, `odata.maxpagesize`). Exporte pour les tests.
 */
export function avecIdsImmuables(url: string, init: RequestInit): RequestInit {
  if (!URL_MAIL.test(url.split("?")[0] ?? url)) return init;
  const headers = new Headers(init.headers);
  const prefer = headers.get("prefer");
  if (prefer && /idtype\s*=/i.test(prefer)) return init;
  headers.set("Prefer", prefer ? `${prefer}, IdType="ImmutableId"` : 'IdType="ImmutableId"');
  return { ...init, headers };
}

function entete(headers: HeadersInit | undefined, nom: string): string | null {
  if (!headers) return null;
  return new Headers(headers).get(nom);
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
// La PROMESSE en cours est partagee : a froid, N requetes paralleles ne font plus N POST
// OAuth (audit du 27/10/2026).
let _tokenEnCours: Promise<string> | null = null;

export async function jetonGraph(): Promise<string> {
  if (_tokenCache && Date.now() < _tokenCache.expiresAt - 60_000) return _tokenCache.value;
  if (!_tokenEnCours) {
    _tokenEnCours = demanderJeton().finally(() => {
      _tokenEnCours = null;
    });
  }
  return _tokenEnCours;
}

/** Oublie le jeton en cache (401 : revoque ou expire plus tot que prevu). */
function oublierJeton(): void {
  _tokenCache = null;
}

async function demanderJeton(): Promise<string> {
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

/**
 * Petit cache des ids resolus, par (boite, internetMessageId) : depuis les identifiants
 * immuables (27/10/2026), l'id d'un mail ne change plus quand il est deplace ; seule une
 * suppression definitive le rend caduc (l'appel suivant repond alors 404). 10 min, 2 000
 * entrees au plus (la plus ancienne part la premiere).
 */
const IDS_RESOLUS = new Map<string, { id: string; jusqua: number }>();
const IDS_RESOLUS_MS = 10 * 60_000;
const IDS_RESOLUS_MAX = 2_000;

/** Resout l'id Graph (immuable) d'un message par son internetMessageId. */
export async function resoudreMessageId(
  tk: string,
  boite: string,
  internetMessageId: string,
): Promise<string> {
  const cle = `${boite.trim().toLowerCase()}|${internetMessageId}`;
  const connu = IDS_RESOLUS.get(cle);
  if (connu && Date.now() < connu.jusqua) return connu.id;
  if (connu) IDS_RESOLUS.delete(cle);
  const imid = internetMessageId.replace(/'/g, "''"); // echappe les quotes OData
  const url =
    `${GRAPH}/users/${encodeURIComponent(boite)}/messages` +
    `?$filter=${encodeURIComponent(`internetMessageId eq '${imid}'`)}&$select=id&$top=1`;
  const r = await graphFetch(url, { headers: { Authorization: `Bearer ${tk}` } });
  if (!r.ok) throw new Error(`Graph resoudre message ${r.status} : ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { value?: { id: string }[] };
  const id = j.value?.[0]?.id;
  if (!id) throw new Error("Message introuvable dans la boite (deplace ou supprime ?).");
  // Une Map garde l'ordre d'insertion : la plus ancienne entree part la premiere.
  const plusAncienne = IDS_RESOLUS.keys().next();
  if (IDS_RESOLUS.size >= IDS_RESOLUS_MAX && !plusAncienne.done) IDS_RESOLUS.delete(plusAncienne.value);
  IDS_RESOLUS.set(cle, { id, jusqua: Date.now() + IDS_RESOLUS_MS });
  return id;
}
