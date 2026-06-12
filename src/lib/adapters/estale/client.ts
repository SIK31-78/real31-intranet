// Client eStale (Phase B, ADR-022) : auth par cookie de session via le compte de
// service (POST /api/login), appels GraphQL sur /graphql/intranet. Tout le
// bricolage d'auth est isole ICI ; quand la cle API arrivera (ESTALE_API_KEY),
// on basculera sans toucher les adapters metier.
//
// Contraintes API (ADR-022) : rate limit 50 req/s, timeout 30 s -> requetes
// ciblees, pas de mega-queries. Endpoints verifies le 2026-06-12 :
//   login  POST https://api.estale.app/api/login  {email, password} -> cookie "estale"
//   gql    POST https://api.estale.app/graphql/intranet

const BASE = (process.env.ESTALE_BASE_URL ?? "https://api.estale.app").replace(/\/$/, "");

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
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new EstaleError(`Login eStale refuse (HTTP ${res.status})`, res.status);
  const cookies = res.headers.getSetCookie();
  if (cookies.length === 0) throw new EstaleError("Login eStale : aucun cookie de session recu");
  return cookies.map((c) => c.split(";")[0]).join("; ");
}

type GqlReponse<T> = { data?: T; errors?: { message: string }[] };

/** Execute une query GraphQL eStale. Re-login automatique (une fois) sur 401/403. */
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
      signal: AbortSignal.timeout(30_000),
    });

  let res = await appel();
  if (res.status === 401 || res.status === 403) {
    cookieSession = await login(); // session expiree : refresh paresseux (ADR-005)
    res = await appel();
  }
  if (!res.ok) throw new EstaleError(`GraphQL eStale HTTP ${res.status}`, res.status);

  const corps = (await res.json()) as GqlReponse<T>;
  if (corps.errors?.length) {
    throw new EstaleError(`GraphQL eStale : ${corps.errors.map((e) => e.message).join(" ; ")}`);
  }
  if (corps.data === undefined) throw new EstaleError("GraphQL eStale : reponse sans data");
  return corps.data;
}

/** L'integration eStale est-elle configuree (identifiants presents) ? */
export function estaleConfigure(): boolean {
  return Boolean(process.env.ESTALE_EMAIL && process.env.ESTALE_PASSWORD);
}
