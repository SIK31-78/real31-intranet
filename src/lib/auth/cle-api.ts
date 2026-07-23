// =============================================================================
// AUTH MACHINE de l'API v1 (cles Bearer) - generation, verification, wrapper.
// =============================================================================
//
// >>> LIGNE ROUGE (gravee DECISIONS.md, non negociable) <<<
// AUCUNE ecriture eStale reelle, AUCUN envoi de mail, AUCUNE suppression, AUCUN
// conclureAg / injection reprise via l'API ou le MCP. Ces gestes restent derriere
// le GO/STOP humain dans l'UI. L'API v1 n'expose que de la LECTURE large et DEUX
// ecritures internes sures (item de supervision, note compta) - rien d'autre ne
// doit jamais etre branche ici, quel que soit le scope invente plus tard.
//
// LE CONTRAT :
//   - la cle en clair ("real31_" + 32 octets aleatoires base64url) n'est montree
//     qu'UNE fois, a la creation (panneau /admin/cles-api). Seul son sha256 est
//     stocke ; la verification re-hashe la cle presentee et compare en TIMING-SAFE.
//   - auth DANS les handlers (wrapper avecCleApi), jamais dans le proxy Edge : le
//     proxy exclut /api/v1 (cf. src/proxy.ts).
//   - cle liee a un gestionnaire -> lectures cloisonnees a son portefeuille ;
//     cle cabinet (managerId absent) -> lecture transverse, ecritures INTERDITES
//     (regle domain/cle-api.verifierAcces).
//   - erreurs normalisees {ok:false, code, message} ; table absente -> 503
//     api_non_configuree (degradation propre, jamais un crash).

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  ApiNonConfigureeError,
  PREFIXE_LONGUEUR,
  estScopeEcriture,
  verifierAcces,
  usageApresRequete,
  type CleApi,
  type RefusCle,
  type ScopeApi,
} from "@/lib/domain/cle-api";
import { getClesApiRepository, getGestionnaireRepository } from "@/lib/adapters/router";

// --- Reponses JSON normalisees ------------------------------------------------
// Response natif (pas NextResponse) : zero dependance next/server -> les handlers
// se testent en vitest pur, et Next accepte un Response standard.

/** Reponse JSON de succes (toujours {ok:true, ...}). */
export function okJson(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** Reponse JSON d'erreur normalisee {ok:false, code, message}. */
export function erreurJson(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ ok: false, code, message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const REFUS_HTTP: Record<RefusCle, { status: number; message: string }> = {
  cle_invalide: { status: 401, message: "Clé API absente, inconnue ou mal formée." },
  cle_revoquee: { status: 401, message: "Clé API révoquée." },
  cle_expiree: { status: 401, message: "Clé API expirée." },
  scope_manquant: { status: 403, message: "Scope insuffisant pour cette opération." },
  ecriture_exige_gestionnaire: {
    status: 403,
    message: "Toute écriture exige une clé liée à un gestionnaire (clé cabinet = lecture seule).",
  },
};

// --- Generation / hash --------------------------------------------------------

/** sha256 hex d'une cle en clair (LA forme stockee et comparee). */
export function hashCleApi(cle: string): string {
  return createHash("sha256").update(cle, "utf8").digest("hex");
}

/** Genere une cle machine : "real31_" + 32 octets aleatoires en base64url. */
export function genererCleApi(): string {
  return `real31_${randomBytes(32).toString("base64url")}`;
}

/** Comparaison TIMING-SAFE de deux sha256 hex (longueur constante 64). */
function hashsEgaux(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// --- Gestion des cles (panneau /admin/cles-api, garde super-admin en amont) ---

export interface CleCreee {
  /** La cle EN CLAIR - a afficher UNE seule fois, jamais persistee ni loguee. */
  cleEnClair: string;
  enregistrement: CleApi;
}

/** Cree une cle : genere le clair, ne persiste que le hash + le prefixe d'affichage. */
export async function creerCleApi(input: {
  nom: string;
  scopes: ScopeApi[];
  managerId?: string;
  creePar?: string;
  expiresAt?: string;
}): Promise<CleCreee> {
  const cleEnClair = genererCleApi();
  const enregistrement = await getClesApiRepository().creer({
    nom: input.nom,
    cleHash: hashCleApi(cleEnClair),
    prefixe: cleEnClair.slice(0, PREFIXE_LONGUEUR),
    scopes: input.scopes,
    ...(input.managerId ? { managerId: input.managerId } : {}),
    ...(input.creePar ? { creePar: input.creePar } : {}),
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
  });
  return { cleEnClair, enregistrement };
}

export async function listerClesApi(): Promise<CleApi[]> {
  return getClesApiRepository().lister();
}

export async function revoquerCleApi(id: string): Promise<void> {
  return getClesApiRepository().revoquer(id, new Date().toISOString());
}

// --- Verification (chemin chaud de chaque requete /api/v1) --------------------

/** Contexte d'acces passe aux handlers apres authentification. */
export interface AccesApi {
  cle: CleApi;
  /** Gestionnaire lie (cloisonnement) ; absent = cle cabinet -> lecture transverse. */
  managerId?: string;
  /** Auteur a journaliser pour les ECRITURES (initiales du gestionnaire lie). */
  auteur: { initiales: string; nomComplet: string };
}

export type VerdictVerification =
  | { ok: true; acces: AccesApi }
  | { ok: false; refus: RefusCle };

/**
 * Verifie l'en-tete `Authorization: Bearer real31_...` pour un scope requis.
 * Touche last_used_at + compteur journalier quand la cle est acceptee.
 */
export async function verifierCleApi(
  authorization: string | null,
  scopeRequis: ScopeApi,
): Promise<VerdictVerification> {
  const m = /^Bearer\s+(real31_[A-Za-z0-9_-]{20,120})$/.exec(authorization ?? "");
  if (!m) return { ok: false, refus: "cle_invalide" };

  const repo = getClesApiRepository();
  const hash = hashCleApi(m[1]);
  const cle = await repo.findByHash(hash);
  // Re-verification TIMING-SAFE du hash apres la resolution (le lookup base fait
  // deja l'egalite, la comparaison constante ici est la ceinture-bretelles exigee).
  if (!cle || !hashsEgaux(hash, cle.cleHash)) return { ok: false, refus: "cle_invalide" };

  const nowISO = new Date().toISOString();
  const verdict = verifierAcces(cle, scopeRequis, nowISO);
  if (!verdict.ok) return { ok: false, refus: verdict.refus };

  // Compteur d'usage (visibilite admin). Best-effort : ne bloque jamais la requete.
  const usage = usageApresRequete(cle, nowISO.slice(0, 10));
  await repo.enregistrerUsage(cle.id, nowISO, usage.usageJour, usage.usageJourDate);

  // Auteur des ecritures : les initiales du gestionnaire lie (resolu seulement si
  // necessaire - un GET ne paie pas la requete annuaire).
  let auteur = { initiales: "API", nomComplet: cle.nom };
  if (estScopeEcriture(scopeRequis) && cle.managerId) {
    const g = await getGestionnaireRepository().findById(cle.managerId);
    if (g) auteur = { initiales: g.initiales, nomComplet: g.nomComplet };
  }

  const sansHash: CleApi & { cleHash?: string } = { ...cle };
  delete sansHash.cleHash;
  return {
    ok: true,
    acces: {
      cle: sansHash,
      ...(cle.managerId ? { managerId: cle.managerId } : {}),
      auteur,
    },
  };
}

// --- Wrapper de handler -------------------------------------------------------

type HandlerApi<C> = (req: Request, ctx: C, acces: AccesApi) => Promise<Response>;

/**
 * Enrobe un handler /api/v1 : auth Bearer + scope + erreurs normalisees.
 * L'auth vit ICI, dans le handler (jamais dans le proxy Edge, exclu pour /api/v1).
 */
export function avecCleApi<C>(scopeRequis: ScopeApi, handler: HandlerApi<C>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      const verdict = await verifierCleApi(req.headers.get("authorization"), scopeRequis);
      if (!verdict.ok) {
        const { status, message } = REFUS_HTTP[verdict.refus];
        return erreurJson(status, verdict.refus, message);
      }
      return await handler(req, ctx, verdict.acces);
    } catch (e) {
      if (e instanceof ApiNonConfigureeError) {
        return erreurJson(
          503,
          "api_non_configuree",
          "Clés API non configurées : la table intranet_api_keys n'est pas encore créée.",
        );
      }
      // Cloisonnement leve par les services (exigerPerimetre) : refus propre, pas une 500.
      if (e instanceof Error && /hors du p[ée]rim[èe]tre/i.test(e.message)) {
        return erreurJson(403, "hors_perimetre", "Copropriété hors du périmètre de cette clé.");
      }
      console.error("[api/v1] erreur interne :", e);
      return erreurJson(500, "erreur_interne", "Erreur interne de l'API.");
    }
  };
}

// --- Idempotence best-effort des ecritures ------------------------------------
// Memoire de PROCESS (Map bornee) : rejouer un POST avec le meme header
// `Idempotency-Key` (par cle API) ne re-applique pas l'ecriture. LIMITE assumee et
// documentee (docs/api-v1.md) : best-effort - un redemarrage / une autre instance
// serverless ne s'en souvient pas. Les ecritures v1 restent de toute facon
// idempotentes-friendly (poser deux fois le meme statut = meme etat final).

const IDEMPOTENCE_MAX = 1000;
const dejaTraites = new Map<string, string>(); // "cleId|idempotencyKey" -> ISO du 1er traitement

/** Deja traite ? Enregistre la cle d'idempotence au passage (si fournie). */
export function idempotenceDejaVue(cleId: string, idempotencyKey: string | null): boolean {
  if (!idempotencyKey) return false;
  const k = `${cleId}|${idempotencyKey}`;
  if (dejaTraites.has(k)) return true;
  if (dejaTraites.size >= IDEMPOTENCE_MAX) {
    // Eviction du plus ancien (ordre d'insertion de la Map) : borne memoire simple.
    const premier = dejaTraites.keys().next().value;
    if (premier !== undefined) dejaTraites.delete(premier);
  }
  dejaTraites.set(k, new Date().toISOString());
  return false;
}
