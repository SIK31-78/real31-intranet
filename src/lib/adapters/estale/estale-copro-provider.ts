// Adapter eStale du CoproEstaleProvider : liste les copros du cabinet EN DIRECT via
// `me.agency.condos` (une seule requete pour les 7 copros REAL31, PAS 7 requetes condo).
// Le resultat mappe (identite + agence + equipe) est mis en CACHE MODULE a TTL court :
// on ne rappelle pas eStale (ni ne resout l'equipe) a chaque rendu de page.
//
// Depend UNIQUEMENT de ports (GestionnaireRepository, AgenceRepository) injectes par le
// routeur : la regle boundaries interdit a un adapter d'en importer un autre. eStale ne
// porte PAS les dates d'AG/CS -> les copros renvoyees sont SANS date (le composite complete).

import type { CoproEstaleProvider } from "@/lib/ports/copro-estale-provider";
import type { GestionnaireRepository } from "@/lib/ports/gestionnaire-repository";
import type { AgenceRepository } from "@/lib/ports/agence-repository";
import type { Adresse, Copropriete, MembreEquipe, RoleEquipe } from "@/lib/domain/copropriete";
import { normaliserRef } from "@/lib/domain/copro-fusion";
import { estaleGql } from "./client";

// --- Requete liste : me.agency.condos donne les 7 copros (me.collaborator.condos n'en
//     donnerait que 2). Champs strictement necessaires a l'identite + agence + equipe.
const QUERY_CONDOS = `{
  me { agency { condos(archived: false) {
    id
    reference
    name
    address { housenumber street addressL2 addressL3 postcode city }
    establishment { name }
    collaborators { id fullname email }
  } } }
}`;

type CondoNode = {
  id: string;
  reference: string;
  name: string;
  address: {
    housenumber: string | null;
    street: string | null;
    addressL2: string | null;
    addressL3: string | null;
    postcode: string | null;
    city: string | null;
  } | null;
  establishment: { name: string | null } | null;
  collaborators: { id: string; fullname: string; email: string | null }[];
};

// Cache module (persiste entre requetes, partage entre instances de l'adapter, perdu au
// cold start serverless -> TTL court suffit). Stocke les copros DEJA mappees.
let cache: { copros: Copropriete[]; expire: number } | null = null;
const TTL_MS = (Number(process.env.ESTALE_CACHE_TTL_S) || 10 * 60) * 1000;

// Cache NEGATIF : un echec eStale (panne / lenteur) est memorise BRIEVEMENT. Cette liste est
// dans le chemin critique de CHAQUE page (le composite l'appelle avant tout) : sans ce cache,
// un eStale KO ferait re-tenter (et re-payer le timeout) a chaque rendu. Ici on re-jette tout
// de suite pendant la fenetre -> le composite degrade sur le miroir en ~0 ms. Fenetre courte
// pour re-tenter vite une fois l'incident passe.
let echecNeg: { expire: number; message: string } | null = null;
const TTL_ECHEC_MS = (Number(process.env.ESTALE_CACHE_ECHEC_S) || 60) * 1000;

// Dedup IN-FLIGHT : N rendus concurrents d'une meme requete liste partagent 1 seul appel
// eStale (au lieu d'en lancer autant). Libere en `finally` (succes comme echec).
let enVol: Promise<Copropriete[]> | null = null;

// Timeout DEDIE a la requete liste : bien plus court que le timeout general du client eStale
// (10 s), car cette requete est dans le chemin critique de toutes les pages -> on degrade vite
// sur le miroir plutot que de faire patienter le gestionnaire. Surchargeable par env.
const TIMEOUT_LISTE_MS = Number(process.env.ESTALE_TIMEOUT_LISTE_MS) || 3_000;

/** Reset du cache (tests) : positif, negatif ET in-flight. */
export function _resetCacheCoprosEstale(): void {
  cache = null;
  echecNeg = null;
  enVol = null;
}

/** "REAL 31 - HLS" -> "HLS" : le code d'agence est le suffixe apres "REAL 31 - ". */
function codeAgenceDepuisEtablissement(nom: string | null | undefined): string | undefined {
  if (!nom) return undefined;
  const m = nom.trim().match(/-\s*([A-Za-z]+)\s*$/);
  return m ? m[1].toUpperCase() : undefined;
}

/** public."User".role brut -> role d'equipe intranet ; null si hors des 3 roles metier. */
function roleEquipeDe(roleTable: string | null | undefined): RoleEquipe | null {
  switch ((roleTable ?? "").trim().toUpperCase()) {
    case "GESTIONNAIRE":
      return "gestionnaire";
    case "ASSISTANT":
      return "assistant";
    case "COMPTABLE":
      return "comptable";
    default:
      return null; // ADMIN / DIRECTEUR_SYNDIC / AUTRE... : hors equipe affichee
  }
}

function adresseDe(a: CondoNode["address"]): Adresse {
  const ligne1 = [a?.housenumber, a?.street].filter(Boolean).join(" ").trim();
  const ligne2 = [a?.addressL2, a?.addressL3].filter(Boolean).join(", ").trim();
  return {
    ligne1,
    ...(ligne2 ? { ligne2 } : {}),
    codePostal: a?.postcode ?? "",
    ville: a?.city ?? "",
  };
}

export class EstaleCoproProvider implements CoproEstaleProvider {
  constructor(
    private readonly gestionnaires: GestionnaireRepository,
    private readonly agences: AgenceRepository,
  ) {}

  async listerCoprosEstale(): Promise<Copropriete[]> {
    if (cache && Date.now() < cache.expire) return cache.copros;
    // Echec recent encore chaud : on re-jette immediatement (le composite retombe sur le
    // miroir en ~0 ms au lieu de re-payer un timeout eStale).
    if (echecNeg && Date.now() < echecNeg.expire) throw new Error(echecNeg.message);
    // Un appel identique est deja en vol : on s'y greffe (1 fetch pour N appelants concurrents).
    if (enVol) return enVol;

    enVol = this.chargerEtMapper()
      .then((copros) => {
        cache = { copros, expire: Date.now() + TTL_MS };
        echecNeg = null; // succes : purge un eventuel cache negatif
        return copros;
      })
      .catch((err) => {
        // Memorise l'echec brievement, puis re-jette (comportement inchange pour l'appelant).
        echecNeg = { expire: Date.now() + TTL_ECHEC_MS, message: (err as Error).message };
        throw err;
      })
      .finally(() => {
        enVol = null; // libere le verrou in-flight
      });
    return enVol;
  }

  /** Charge (timeout dedie court) et mappe les copros eStale. Isole pour la dedup in-flight. */
  private async chargerEtMapper(): Promise<Copropriete[]> {
    const data = await estaleGql<{ me: { agency: { condos: CondoNode[] } | null } }>(
      QUERY_CONDOS,
      undefined,
      { timeoutMs: TIMEOUT_LISTE_MS },
    );
    const condos = data.me.agency?.condos ?? [];

    // Agence : code (HLS/LGC/ML/ASN) -> id technique (pour renseigner copro.agenceId, comme
    // le miroir, afin que la resolution codeAgence en aval fonctionne a l'identique).
    const agences = await this.agences.listerAgences();
    const idParCode = new Map(agences.map((a) => [a.code.toUpperCase(), a.id]));

    // Equipe : on resout chaque email de collaborateur UNE fois (dedup cross-copros) vers
    // public."User" (role + id). Les emails externes (support+...@estale.fr) ne resolvent pas.
    const emails = [
      ...new Set(
        condos.flatMap((c) => c.collaborators.map((co) => co.email).filter((e): e is string => Boolean(e))),
      ),
    ];
    const resolus = await Promise.all(
      emails.map(async (email) => [email.toLowerCase(), await this.gestionnaires.findByEmail(email)] as const),
    );
    const userParEmail = new Map(resolus);

    const deepBase = process.env.ESTALE_DEEPLINK_BASE;
    const copros: Copropriete[] = condos.map((c) => {
      const equipe: MembreEquipe[] = [];
      let managerId: string | undefined;
      let assistantId: string | undefined;
      for (const co of c.collaborators) {
        const user = co.email ? userParEmail.get(co.email.toLowerCase()) : null;
        if (!user) continue;
        const role = roleEquipeDe(user.role);
        if (!role) continue;
        equipe.push({
          initiales: user.initiales,
          nomComplet: user.nomComplet,
          role,
        });
        // managerId = PREMIER gestionnaire trouve (ordre eStale) ; idem assistant.
        if (role === "gestionnaire" && !managerId) managerId = user.id;
        if (role === "assistant" && !assistantId) assistantId = user.id;
      }

      const codeAgence = codeAgenceDepuisEtablissement(c.establishment?.name);
      const agenceId = codeAgence ? idParCode.get(codeAgence) : undefined;

      return {
        code: normaliserRef(c.reference),
        source: "estale" as const,
        nom: c.name,
        adresse: adresseDe(c.address),
        statut: "active" as const,
        // Lots / exercice / prise en gestion : non demandes dans la requete liste (light,
        // 1 requete pour 7 copros). Le detail financier eStale arrive par CondoEstaleProvider.
        lotsPrincipaux: 0,
        lotsAutres: 0,
        exercice: { debut: "-", fin: "-" },
        priseEnGestion: "-",
        equipe,
        ...(managerId ? { managerId } : {}),
        ...(assistantId ? { assistantId } : {}),
        ...(agenceId ? { agenceId } : {}),
        ...(deepBase ? { estaleDeepLink: `${deepBase}/condo/${c.id}` } : {}),
      };
    });

    // Le cache POSITIF est pose par l'appelant (listerCoprosEstale) apres succes.
    return copros;
  }

  async getCoproEstale(code: string): Promise<Copropriete | null> {
    const cible = normaliserRef(code);
    const copros = await this.listerCoprosEstale();
    return copros.find((c) => normaliserRef(c.code) === cible) ?? null;
  }
}
