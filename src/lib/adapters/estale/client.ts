// Client Estale (Phase B, ADR-022) : auth par cookie de session via le compte de
// service (POST /api/login), appels GraphQL sur /graphql/intranet. Tout le
// bricolage d'auth est isole ICI ; quand la cle API arrivera (ESTALE_API_KEY),
// on basculera sans toucher les adapters metier.
//
// Contraintes API (ADR-022) : rate limit 50 req/s, timeout serveur 30 s -> requetes
// ciblees, pas de mega-queries. NB : notre abort client est plus court (TIMEOUT_MS)
// pour degrader vite en cas de panne. Endpoints verifies le 2026-06-12 :
//   login  POST https://api.estale.app/api/login  {email, password} -> cookie "estale"
//   gql    POST https://api.estale.app/graphql/intranet

const BASE = (process.env.ESTALE_BASE_URL ?? "https://api.estale.app").replace(/\/$/, "");

// Timeout client : court expres. Si l'API Estale hang (panne), la fiche/ODJ doivent
// se degrader (banniere) vite, sans faire patienter le gestionnaire. 10 s est large
// pour une requete ciblee qui marche (rate limit Estale = 50 req/s).
const TIMEOUT_MS = 10_000;

// Cookie de session en cache module (re-login automatique sur 401/403).
let cookieSession: string | null = null;

class EstaleError extends Error {
  constructor(message: string, readonly statut?: number) {
    super(message);
    this.name = "EstaleError";
  }
}

async function login(): Promise<string> {
  const email = process.env.ESTALE_EMAIL;
  const password = process.env.ESTALE_PASSWORD;
  if (!email || !password) {
    throw new EstaleError("ESTALE_EMAIL / ESTALE_PASSWORD manquants (cf. .env.local.example)");
  }
  const res = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new EstaleError(`Login Estale refuse (HTTP ${res.status})`, res.status);
  const cookies = res.headers.getSetCookie();
  if (cookies.length === 0) throw new EstaleError("Login Estale : aucun cookie de session recu");
  return cookies.map((c) => c.split(";")[0]).join("; ");
}

type GqlReponse<T> = { data?: T; errors?: { message: string; extensions?: unknown; path?: unknown }[] };

/** Execute une query GraphQL Estale. Re-login automatique (une fois) sur 401/403. */
export async function estaleGql<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  cookieSession ??= await login();

  const appel = async (): Promise<Response> =>
    fetch(`${BASE}/graphql/intranet`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieSession! },
      body: JSON.stringify({ query, ...(variables ? { variables } : {}) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  let res = await appel();
  if (res.status === 401 || res.status === 403) {
    cookieSession = await login(); // session expiree : refresh paresseux (ADR-005)
    res = await appel();
  }
  // Estale a des 5xx passagers (502/503/504) : un retry court avant d'abandonner.
  if (res.status >= 500) {
    await new Promise((r) => setTimeout(r, 600));
    res = await appel();
  }
  if (!res.ok) throw new EstaleError(`GraphQL Estale HTTP ${res.status}`, res.status);

  const corps = (await res.json()) as GqlReponse<T>;
  if (corps.errors?.length) {
    // Le message affiche a l'humain reste generique (souvent un catch-all cote eStale) :
    // on logge la requete + la reponse d'erreur COMPLETE (extensions, path) cote serveur
    // pour pouvoir diagnostiquer sans deviner.
    console.error("[estale/client] erreur GraphQL", {
      query: query.slice(0, 200),
      variables,
      errors: corps.errors,
    });
    throw new EstaleError(`GraphQL Estale : ${corps.errors.map((e) => e.message).join(" ; ")}`);
  }
  if (corps.data === undefined) throw new EstaleError("GraphQL Estale : reponse sans data");
  return corps.data;
}

/** L'integration Estale est-elle configuree (identifiants presents) ? */
export function estaleConfigure(): boolean {
  return Boolean(process.env.ESTALE_EMAIL && process.env.ESTALE_PASSWORD);
}
