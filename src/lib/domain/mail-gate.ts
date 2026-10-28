// Gates de rollout du module mail (extrait de session.ts, place en domain/ car regle
// metier PURE : qui a acces au mail selon la config env, aucune dep technique ni auth).
// session.ts re-exporte ces symboles pour la retro-compat.
//
//   MAIL_SOURCE=graph          : le provider Graph reel est branche (sinon = Noop).
//   MAIL_PILOTES=a@x,b@y       : allowlist des emails habilites (vide = tous).
//
// Utilisations :
//   - mailModuleActif()        : gate GLOBAL (ex. bouton "mail au CS", ouvert des que
//                                le provider Graph est actif, cf. mail-reunion-actions).
//   - mailModuleActifPour(...) : double gate GLOBAL + allowlist (module "Mes e-mails",
//                                brouillons/agenda sinistre, projection Outlook AG/CS...).
//   - boitesTri() / boiteTri() : les boites triees et leurs capacites (MAIL_TRI_BOITES,
//                                27/10/2026), avec les coupe-circuits globaux du tri. Une
//                                entree "tri":false n'y figure JAMAIS (voir plus bas).
//   - boitesDestinationBascule() : ou un mail peut basculer (ADR-050) = les boites triees
//                                + les boites « destination seulement » ("tri":false,
//                                syndic1 pour ML le 28/10/2026, encore relevee par Crypto).

export function mailModuleActif(): boolean {
  return process.env.MAIL_SOURCE === "graph";
}

// Parse a chaque appel : les env de Next 16 peuvent changer selon le contexte de
// rendu (build vs runtime). Le cout est negligeable (split d'une chaine courte).
function pilotes(): string[] {
  return (process.env.MAIL_PILOTES ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Le module mail est-il actif POUR ce gestionnaire (gate global + allowlist pilotes) ? */
export function mailModuleActifPour(email: string | null | undefined): boolean {
  if (!mailModuleActif()) return false;
  const liste = pilotes();
  if (liste.length === 0) return true;
  return Boolean(email && liste.includes(email.toLowerCase()));
}

// --- Tri des e-mails V2 : les boîtes triées (ADR-046, révision V2 du 27/10/2026) ----------
//
// Une boîte triée par agence (ou par groupe d'agences : syndic2 sert LGC et ASN), décrite
// dans MAIL_TRI_BOITES (JSON) :
//   [{"boite":"syndic4@real31.fr","agences":["HLS"],"depuis":"2026-10-14",
//     "ecriture":true,"automatique":true,"envoi":false}, ...]
// Absente : repli sur les variables d'avant (MAIL_BOITE_TRI, MAIL_TRI_AGENCE, MAIL_TRI_DEPUIS),
// une seule boîte, comme avant le 27/10/2026 (la prod Vercel n'a pas encore la variable).
// Les interrupteurs globaux MAIL_TRI_ECRITURE, MAIL_TRI_AUTO et MAIL_ENVOI restent des
// coupe-circuits : une capacité n'est active que si l'interrupteur global ET la boîte la
// donnent. Déplacer ASN sur sa propre boîte = changer la variable, pas le code.
//
// Boîte « destination seulement » (ADR-050, décision Sekou du 28/10/2026) : une entrée avec
// "tri":false (défaut true), ex. {"boite":"syndic1@real31.fr","agences":["ML"],"tri":false,
// "ecriture":true}. L'équipe ML travaille encore sous Crypto, dont la relève lit la réception
// de syndic1 : l'intranet ne la trie pas, ne la montre nulle part (tri, « E-mails », comptables,
// tâche planifiée), mais on peut y FAIRE BASCULER un mail mal arrivé dans une boîte triée.
// `automatique` et `envoi` y sont facultatifs et ne peuvent pas valoir true. Le jour où ML passe
// sur l'intranet, on retire "tri":false (et on ajoute depuis/automatique/envoi). Une agence reste
// dans UNE seule entrée, triée ou non : sa boîte est unique.
//   - boitesTri() / boiteTri() / boiteTriDeLAgence() : les boîtes TRIÉES seulement (tout ce qui
//     trie, montre ou compte des mails passe par là) ;
//   - boitesDestinationBascule() / boiteDestinationBascule() : triées + destination seulement,
//     pour la seule bascule.

/** Une boîte triée et ce qu'on y permet. */
export interface BoiteTriConfig {
  /** Adresse en minuscules, ou "echantillon" (mails fictifs, développement). */
  boite: string;
  /** Codes d'agence (HLS, LGC, ASN, ML) en majuscules : leurs collaborateurs trient cette boîte. */
  agences: string[];
  /** Mise en service (AAAA-MM-JJ) : seuls les mails reçus depuis entrent dans la file. null = toute la réception. */
  depuis: string | null;
  /** Le tri écrit vraiment dans la boîte (avec MAIL_TRI_ECRITURE=on). */
  ecriture: boolean;
  /** La tâche planifiée range seule (avec MAIL_TRI_AUTO=on). */
  automatique: boolean;
  /** L'envoi réel depuis la boîte est permis (avec MAIL_ENVOI=on). */
  envoi: boolean;
}

/**
 * Une entrée de MAIL_TRI_BOITES telle que lue : une boîte triée (`tri` true) ou une boîte
 * « destination seulement » de la bascule (`tri` false). Seules les listes de bascule la rendent ;
 * boitesTri() rend des BoiteTriConfig sans ce drapeau, et jamais une entrée non triée.
 */
export interface BoiteConfig extends BoiteTriConfig {
  /** La boîte est triée par l'intranet. false = destination de bascule seulement (ADR-050). */
  tri: boolean;
}

/** La boîte fictive du développement. */
export const BOITE_ECHANTILLON = "echantillon";

const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lit et valide MAIL_TRI_BOITES. Pur. Lève une erreur LISIBLE (quelle entrée, quel champ) :
 * une config fausse ne doit pas ouvrir une boîte à la mauvaise agence. Refusé aussi : une
 * boîte en double, une agence dans deux boîtes (la boîte d'un collaborateur doit être unique),
 * triées ou non. Rend TOUTES les entrées, avec leur drapeau `tri` : les appelants passent par
 * boitesTri() (triées) ou boitesDestinationBascule() (bascule).
 */
export function lireBoitesTri(brut: string): BoiteConfig[] {
  let json: unknown;
  try {
    json = JSON.parse(brut);
  } catch {
    throw new Error("MAIL_TRI_BOITES n'est pas un JSON lisible.");
  }
  if (!Array.isArray(json)) throw new Error("MAIL_TRI_BOITES doit être un tableau de boîtes.");
  const boites: BoiteConfig[] = [];
  const agencesVues = new Map<string, string>();
  json.forEach((e: unknown, i) => {
    const ou = `MAIL_TRI_BOITES[${i}]`;
    if (typeof e !== "object" || e === null || Array.isArray(e)) throw new Error(`${ou} doit être un objet.`);
    const o = e as Record<string, unknown>;
    const boite = typeof o.boite === "string" ? o.boite.trim().toLowerCase() : "";
    if (boite !== BOITE_ECHANTILLON && !/^[^\s@]+@[^\s@]+$/.test(boite)) throw new Error(`${ou}.boite doit être une adresse e-mail (ou « echantillon »).`);
    if (boites.some((b) => b.boite === boite)) throw new Error(`${ou} : la boîte ${boite} est déjà décrite.`);
    if (!Array.isArray(o.agences) || o.agences.length === 0 || o.agences.some((a) => typeof a !== "string" || !a.trim())) {
      throw new Error(`${ou}.agences doit être une liste non vide de codes d'agence (ex. ["HLS"]).`);
    }
    const agences = [...new Set((o.agences as string[]).map((a) => a.trim().toUpperCase()))];
    for (const a of agences) {
      const deja = agencesVues.get(a);
      if (deja) throw new Error(`${ou} : l'agence ${a} est déjà triée dans ${deja}.`);
      agencesVues.set(a, boite);
    }
    let depuis: string | null = null;
    if (o.depuis !== undefined && o.depuis !== null) {
      if (typeof o.depuis !== "string" || !RE_DATE.test(o.depuis.trim())) throw new Error(`${ou}.depuis doit être une date AAAA-MM-JJ.`);
      depuis = o.depuis.trim();
    }
    if (o.tri !== undefined && typeof o.tri !== "boolean") throw new Error(`${ou}.tri doit valoir true ou false (absent = true).`);
    const tri = o.tri !== false;
    if (!tri && boite === BOITE_ECHANTILLON) throw new Error(`${ou} : la boîte « echantillon » est forcément triée (pas de "tri":false).`);
    if (typeof o.ecriture !== "boolean") throw new Error(`${ou}.ecriture doit valoir true ou false.`);
    for (const champ of ["automatique", "envoi"] as const) {
      // Destination seulement : rien n'y est trié ni envoyé par l'intranet ; le champ est facultatif.
      if (!tri && (o[champ] === undefined || o[champ] === false)) continue;
      if (!tri) throw new Error(`${ou}.${champ} : une boîte non triée ("tri":false) ne peut pas avoir ${champ} à true.`);
      if (typeof o[champ] !== "boolean") throw new Error(`${ou}.${champ} doit valoir true ou false.`);
    }
    boites.push({
      boite,
      agences,
      depuis,
      ecriture: o.ecriture,
      automatique: o.automatique === true,
      envoi: o.envoi === true,
      tri,
    });
  });
  return boites;
}

/**
 * La boîte qui rangeait seule avant la config par boîte (décision Sekou du 20/10/2026). Ne
 * sert qu'au REPLI sans MAIL_TRI_BOITES, pour que la prod garde exactement son comportement
 * tant que la variable n'est pas posée sur Vercel. Avec la config, c'est `automatique` qui décide.
 */
const BOITE_AUTOMATIQUE_DU_REPLI = "syndic4@real31.fr";

/** Repli sans MAIL_TRI_BOITES : la boîte unique d'avant le 27/10/2026. */
function boiteDuRepli(): BoiteTriConfig[] {
  const boite = (process.env.MAIL_BOITE_TRI ?? "").trim().toLowerCase();
  if (!boite) return [];
  const agence = (process.env.MAIL_TRI_AGENCE ?? "").trim().toUpperCase();
  const depuis = (process.env.MAIL_TRI_DEPUIS ?? "").trim();
  return [
    {
      boite,
      agences: agence ? [agence] : [],
      depuis: RE_DATE.test(depuis) ? depuis : null,
      // Avant la config, les interrupteurs globaux décidaient seuls : la boîte ne retire rien.
      ecriture: true,
      automatique: boite === BOITE_AUTOMATIQUE_DU_REPLI,
      envoi: true,
    },
  ];
}

/**
 * Les boîtes triées, dans l'ordre de la config (la première sert de défaut). Lu à chaque
 * appel (les tests changent l'environnement). Config illisible : AUCUNE boîte (le module
 * disparaît) et l'erreur part dans les journaux. On ne fait pas tomber toutes les pages de
 * l'intranet (la barre latérale lit la config) pour une faute de frappe dans une variable.
 */
export function boitesTri(): BoiteTriConfig[] {
  // Une boîte « destination seulement » ("tri":false) n'est JAMAIS rendue ici : ni triée, ni
  // lue par la tâche planifiée, ni montrée dans le tri, « E-mails » ou l'onglet des comptables.
  // Le drapeau est retiré : une BoiteTriConfig est toujours une boîte triée.
  return boitesConfigurees()
    .filter((b) => b.tri)
    .map((b) => ({ boite: b.boite, agences: b.agences, depuis: b.depuis, ecriture: b.ecriture, automatique: b.automatique, envoi: b.envoi }));
}

/** Toutes les entrées de la config (triées ou non), lues à chaque appel ; [] si illisible. */
function boitesConfigurees(): BoiteConfig[] {
  const brut = (process.env.MAIL_TRI_BOITES ?? "").trim();
  if (!brut) return boiteDuRepli().map((b) => ({ ...b, tri: true }));
  try {
    return lireBoitesTri(brut);
  } catch (e) {
    console.error(`[mail-gate] ${e instanceof Error ? e.message : String(e)} Le tri des e-mails est coupé.`);
    return [];
  }
}

/** La config d'une boîte triée par son adresse, ou null si elle n'est pas (ou plus) dans la config, ou pas triée. */
export function boiteTri(adresse: string | null | undefined): BoiteTriConfig | null {
  const cle = (adresse ?? "").trim().toLowerCase();
  if (!cle) return null;
  return boitesTri().find((b) => b.boite === cle) ?? null;
}

/**
 * Les boîtes vers lesquelles un mail peut BASCULER (ADR-050) : les boîtes triées et les boîtes
 * « destination seulement » ("tri":false), dans l'ordre de la config. Ne sert qu'à la bascule.
 */
export function boitesDestinationBascule(): BoiteConfig[] {
  return boitesConfigurees();
}

/** Une destination de bascule par son adresse (triée ou destination seulement), ou null. */
export function boiteDestinationBascule(adresse: string | null | undefined): BoiteConfig | null {
  const cle = (adresse ?? "").trim().toLowerCase();
  if (!cle) return null;
  return boitesConfigurees().find((b) => b.boite === cle) ?? null;
}

/** La boîte triée d'une agence (code HLS, LGC...), ou null. */
export function boiteTriDeLAgence(agence: string | null | undefined): BoiteTriConfig | null {
  const code = (agence ?? "").trim().toUpperCase();
  if (!code) return null;
  return boitesTri().find((b) => b.agences.includes(code)) ?? null;
}

/**
 * Compatibilité (V1 du tri) : l'adresse de la PREMIÈRE boîte triée, ou null. Plus aucun
 * appelant du module ne s'en sert depuis le 27/10/2026 (boiteDe pour les écrans et les
 * actions, boitesTri pour la tâche planifiée) ; gardé le temps de la migration.
 * @deprecated passer une boîte explicite.
 */
export function boiteTriConfiguree(): string | null {
  return boitesTri()[0]?.boite ?? null;
}

/**
 * Écran « Échanges » : les boîtes communes de chaque agence, ex. « HLS=syndic4@real31.fr ».
 * Une agence absente n'a pas l'écran (ouverture à Houilles seulement, décision du 12/10).
 */
export function boitesParAgenceBrut(): string {
  return process.env.MAIL_BOITES_AGENCE ?? "";
}

/** Minuit heure de Paris du jour AAAA-MM-JJ, en ISO UTC ; null si la date est absente ou illisible. */
export function minuitParis(jour: string | null | undefined): string | null {
  const brut = (jour ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(brut);
  if (!m) return null;
  // Minuit a Paris : UTC+2 l'ete, UTC+1 l'hiver. On calcule le decalage du jour vise.
  const midiUtc = new Date(`${brut}T12:00:00Z`);
  const heureParis = Number(midiUtc.toLocaleString("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }));
  const decalage = heureParis - 12;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), -decalage)).toISOString().replace(".000Z", "Z");
}

/**
 * Mise en service du tri d'une boîte : seuls les mails recus a partir de sa date `depuis`
 * (minuit heure de Paris) entrent dans la file. Le stock d'avant reste ou il est (syndic4 :
 * 18 233 mails en reception le 12/10/2026). Sans boîte : la première de la config. Sans
 * MAIL_TRI_BOITES : MAIL_TRI_DEPUIS, comme avant. Absente ou illisible = toute la reception.
 */
export function debutTri(boite?: string | null): string | null {
  if (!(process.env.MAIL_TRI_BOITES ?? "").trim()) return minuitParis(process.env.MAIL_TRI_DEPUIS);
  const config = boite ? boiteTri(boite) : (boitesTri()[0] ?? null);
  return minuitParis(config?.depuis);
}

/**
 * Un mail de la boite partagee compte-t-il dans « mes mails » ? Seulement s'il est arrive
 * apres la mise en service du tri de cette boîte : le stock d'avant se traite dans Outlook,
 * meme si le tri l'a range pendant les essais. Sans date : tout compte.
 */
export function recuDepuisDebutTri(receivedAt: string, boite?: string | null): boolean {
  const debut = debutTri(boite);
  if (!debut) return true;
  const recu = Date.parse(receivedAt);
  return Number.isNaN(recu) || recu >= Date.parse(debut);
}

/**
 * Interrupteur GLOBAL d'écriture du tri (MAIL_TRI_ECRITURE=on) : coupé, tout rangement est
 * simulé et journalisé comme tel, dans toutes les boîtes. La règle est qu'aucun vrai mail ne
 * bouge sans l'accord de Sekou (ADR-046). Pour une boîte : ecritureTriPour.
 */
export function ecritureTriActive(): boolean {
  return (process.env.MAIL_TRI_ECRITURE ?? "").trim().toLowerCase() === "on";
}

/** Le tri ÉCRIT-il dans cette boîte ? Interrupteur global ET `ecriture` de la boîte ; jamais l'échantillon. */
export function ecritureTriPour(config: BoiteTriConfig | null | undefined): boolean {
  return Boolean(config && config.boite !== BOITE_ECHANTILLON && config.ecriture && ecritureTriActive());
}

/**
 * Interrupteur GLOBAL du rangement automatique (MAIL_TRI_AUTO=on, decision Sekou du
 * 20/10/2026). Coupe par defaut, pour l'arreter partout sans redeployer. Pour une boîte :
 * triAutomatiquePour.
 */
export function triAutomatiqueActif(): boolean {
  return (process.env.MAIL_TRI_AUTO ?? "").trim().toLowerCase() === "on";
}

/** La tâche planifiée range-t-elle seule dans cette boîte ? Interrupteur global ET `automatique` de la boîte. */
export function triAutomatiquePour(config: BoiteTriConfig | null | undefined): boolean {
  return Boolean(config && config.automatique && triAutomatiqueActif());
}

/**
 * Interrupteur GLOBAL de l'envoi réel depuis une boîte PARTAGÉE (MAIL_ENVOI=on). Garde-fou
 * dédié, séparé de MAIL_SOURCE (qui branche Graph) : tant qu'il est coupé, on passe par le
 * BROUILLON (créé sur clic, relu et envoyé dans Outlook). La réponse depuis la boîte perso
 * n'est pas concernée. Même esprit qu'ecritureTriActive() (ADR-046/047). Pour une boîte :
 * envoiMailPour.
 */
export function envoiMailActif(): boolean {
  return (process.env.MAIL_ENVOI ?? "").trim().toLowerCase() === "on";
}

/**
 * L'envoi réel depuis cette boîte partagée est-il permis ? Interrupteur global ET `envoi` de
 * la boîte (27/10/2026). Une boîte hors de la config : non.
 */
export function envoiMailPour(boite: string | null | undefined): boolean {
  return envoiMailActif() && Boolean(boiteTri(boite)?.envoi);
}

/**
 * Lit la config des boîtes de réception des factures ESTALE, une PAR AGENCE (une par
 * établissement ESTALE, lue via l'API le 13/10/2026 : Condo.invoice.inbox), au format
 * « HLS=xxx@invoice.estale.app,LGC=yyy@invoice.estale.app ». Pur, testable.
 */
export function lireRobotsFacture(brut: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const paire of brut.split(/[,;]/)) {
    const [agence, adresse] = paire.split("=").map((s) => s?.trim() ?? "");
    if (agence && adresse && /^[^\s@]+@[^\s@]+$/.test(adresse)) out[agence.toUpperCase()] = adresse.toLowerCase();
  }
  return out;
}

/**
 * Adresse de réception des factures ESTALE de l'agence (MAIL_ROBOT_FACTURE_ESTALE) : on y
 * transmet une facture avec sa codification (« 601000 - DGP NETTOYAGE - Entretien EV »).
 * L'adresse n'est PAS dans le dépôt Git (une boîte qui injecte des factures dans la compta) :
 * .env.local et Vercel seulement. null si l'agence n'est pas configurée.
 */
export function robotFactureEstale(agence: string | null | undefined): string | null {
  if (!agence) return null;
  return lireRobotsFacture(process.env.MAIL_ROBOT_FACTURE_ESTALE ?? "")[agence.trim().toUpperCase()] ?? null;
}
