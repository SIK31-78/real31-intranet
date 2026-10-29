// Compositeur d'un mail SORTANT depuis la boîte partagée (syndicN), façon « F1 » de Crypto.
// Fournit les DONNÉES (copros ESTALE+Crypto de l'agence, contacts et dossiers ouverts d'une
// copro) et crée un BROUILLON, envoyé seulement si l'envoi de la boîte est ouvert (MAIL_ENVOI).
// L'objet/corps sont composés côté domaine (pur), ici on orchestre les ports. Le brouillon se
// crée sur clic (geste de validation) dès que Graph est branché, puis reçoit ses fichiers par
// tranches (27/10/2026, comme la réponse) avant de partir ou de rester dans Outlook. Expéditeur =
// syndicN (la boîte passée au provider). Le brouillon peut être rattaché à un dossier : son
// internetMessageId survit à l'envoi, « Ouvrir le mail » depuis le dossier le retrouve.
// Plusieurs boîtes (V2 du 27/10/2026) : la boîte d'envoi et les copros proposées sont celles
// de la boîte triée de l'agence de la personne (boiteDeComposition), plus une constante.

import {
  getContactsCoproProvider,
  getCoproRepository,
  getCoproprietairesEstaleProvider,
  getGestionnaireRepository,
  getMailOutboundProvider,
  getReferentielTriProvider,
} from "@/lib/adapters/router";
import { BOITE_ECHANTILLON, boitesTri, envoiMailPour, mailModuleActif, type BoiteTriConfig } from "@/lib/domain/mail-gate";
import { boiteDe } from "@/lib/services/tri-emails/acces";
import { donneesCoproEstale } from "@/lib/services/estale/donnees-copro-estale";
import { destinatairesConseilSyndical } from "@/lib/services/coproprietes/destinataires-conseil";
import { binomeEnCopie } from "@/lib/services/coproprietes/assistante-de-copro";
import { classerDestinataires, estAdresseReal31, type Collegue } from "@/lib/domain/destinataires-collegues";
import { conseilPourComposition, enLots, fusionnerContactsCopro, type ContactsComposition, type CoproChoisissable, type DestinataireTrouve } from "@/lib/domain/mes-emails-composition";
import { cleDeReference } from "@/lib/domain/tri-emails";
import { normaliserRef } from "@/lib/domain/copro-fusion";
import { getSignatureGestionnaire } from "./get-signature";
import type { Dossier } from "@/lib/domain/dossier";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { refEchange } from "@/lib/domain/echanges";
import { dossiersPourRattacher } from "@/lib/services/echanges/rechercher";
import { rattacherEmailAuDossier } from "@/lib/services/dossiers/rattacher-email";
import { DUREE_JETON_MS, scellerJeton, type JetonNeuf } from "./jeton-envoi";
import { brouillonNeufDe } from "./depot-piece-jointe";

export type { CoproChoisissable, ContactsComposition };

/**
 * La boîte triée de la personne pour composer : celle de son agence ; un super-admin sans
 * boîte d'agence prend la première de la config (`superAdmin` vient de l'appelant, auth).
 */
export async function boiteDeComposition(g: Pick<Gestionnaire, "agencyId">, superAdmin: boolean): Promise<BoiteTriConfig | null> {
  return (await boiteDe(g)) ?? (superAdmin ? (boitesTri()[0] ?? null) : null);
}

/**
 * La boîte partagée d'où part le mail : celle de l'agence de la personne. null si son agence
 * n'a pas de boîte ; "echantillon" en dev (aperçu possible, jamais de brouillon).
 */
export function boiteEnvoi(config: BoiteTriConfig | null): string | null {
  return config?.boite ?? null;
}

export async function listerCoprosComposition(config: BoiteTriConfig | null): Promise<CoproChoisissable[]> {
  const ref = await getReferentielTriProvider(config?.agences ?? []).charger();
  // Les copros inactives (gardees pour reconnaitre le courrier entrant) ne recoivent plus de mail.
  return ref.copros
    .filter((c) => !c.inactive)
    .map((c) => ({ reference: c.reference, nom: c.nom, adresse: c.adresse, gestionnaire: c.gestionnaire?.nomComplet ?? null }))
    .sort((a, b) => a.reference.localeCompare(b.reference, "fr"));
}

/**
 * Chercher un destinataire par son nom (ou son adresse) : la personne, toutes ses adresses et
 * ses copros, pour choisir à laquelle rattacher le mail (ou aucune : c'est parfois perso).
 */
export async function rechercherDestinataires(texte: string, config: BoiteTriConfig | null): Promise<DestinataireTrouve[]> {
  const [identites, copros, collegues] = await Promise.all([
    getContactsCoproProvider().rechercherIdentites(texte),
    listerCoprosComposition(config).catch(() => [] as CoproChoisissable[]),
    listerCollegues(),
  ]);
  // Les copros des agences de la boîte seulement : un copropriétaire d'une autre agence ne
  // sort pas. Une fiche sans copro (artisan, notaire) reste proposée.
  const parCle = new Map(copros.map((c) => [cleDeReference(c.reference) ?? c.reference, c]));
  const out: DestinataireTrouve[] = [];
  for (const i of identites) {
    const vues = new Set<string>();
    const siennes: DestinataireTrouve["copros"] = [];
    for (const x of i.copros) {
      const cle = cleDeReference(x.reference) ?? x.reference;
      const c = parCle.get(cle);
      if (!c || vues.has(cle)) continue;
      vues.add(cle);
      siennes.push({ ...c, qualite: x.qualite });
    }
    if (i.copros.length > 0 && siennes.length === 0) continue;
    const qualites = siennes.map((c) => c.qualite);
    const casquette =
      i.metier ??
      (qualites.includes("conseil_syndical")
        ? "conseil syndical"
        : qualites.includes("coproprietaire")
          ? "copropriétaire"
          : qualites.includes("locataire")
            ? "locataire"
            : "");
    out.push({ cle: i.cle, nom: i.nom, casquette, emails: i.emails, copros: siennes });
  }
  // Les collègues d'abord, les fiches clientes à leur nom marquées (décision 14, incident Elsa).
  return classerDestinataires(out, collegues, texte, 15);
}

// Les collègues changent rarement : relus au plus toutes les 10 minutes, pas à chaque frappe.
const DUREE_CACHE_COLLEGUES_MS = 10 * 60 * 1000;
let cacheCollegues: { jusqua: number; liste: Collegue[] } | null = null;

/**
 * Les salariés présents du cabinet (public."User", partis exclus) qui ont une adresse REAL31 :
 * proposés en tête de l'autocomplétion et reconnus à l'envoi (décision 14, 29/10/2026).
 * Lecture ratée : liste vide, l'autocomplétion reste celle de l'annuaire.
 */
export async function listerCollegues(): Promise<Collegue[]> {
  if (cacheCollegues && cacheCollegues.jusqua > Date.now()) return cacheCollegues.liste;
  try {
    const tous = await getGestionnaireRepository().listTous();
    const liste = tous
      .filter((u) => u.email && estAdresseReal31(u.email) && u.nomComplet.trim())
      .map((u) => ({ nom: u.nomComplet.trim(), email: u.email!.trim().toLowerCase() }));
    cacheCollegues = { jusqua: Date.now() + DUREE_CACHE_COLLEGUES_MS, liste };
    return liste;
  } catch (e) {
    console.warn("[composer] collègues indisponibles :", e instanceof Error ? e.message : e);
    return [];
  }
}

/**
 * Contacts d'une copro : l'annuaire Crypto, complété du conseil syndical ESTALE (retour du
 * 14/10). Pour une copro présente dans ESTALE, les copropriétaires viennent d'ESTALE et non
 * plus de Crypto (REA-356, 19/10/2026 : Crypto gardait d'anciens copropriétaires, le mail
 * « toute la copropriété » de la S178 est parti à 80 adresses). ESTALE en panne : repli sur
 * l'annuaire Crypto, comme avant, et on le note.
 * Le nombre de lots principaux accompagne les contacts : la confirmation d'envoi à toute la
 * copropriété s'en sert pour alerter (plus de copropriétaires que de lots = liste suspecte).
 * Le bouton « Conseil syndical » prend `conseil` : la cascade du mail de date d'AG (ESTALE,
 * sinon liste de diffusion CS), pas les fiches de l'annuaire cochées « conseil syndical ».
 * Il ajoute aussi en Cc `copieBinome` (28/10/2026) : l'autre membre du binôme de la copro que
 * `envoyeur` (la personne connectée, pas la boîte partagée), comme sur Crypto.
 */
export async function listerContactsComposition(reference: string, envoyeur?: string | null): Promise<ContactsComposition> {
  const ref = normaliserRef(reference);
  const [crypto, estale, proprietaires, copro, cascadeCS] = await Promise.all([
    getContactsCoproProvider().listerParCopro(reference),
    donneesCoproEstale(ref).catch(() => null),
    getCoproprietairesEstaleProvider()
      .listerJoignables(ref)
      .catch((err: unknown) => {
        console.warn(`[composer] copropriétaires ESTALE indisponibles pour ${ref}, repli sur l'annuaire Crypto :`, (err as Error).message);
        return null;
      }),
    // Garde-fou seulement : une lecture ratée ne bloque pas le compositeur.
    getCoproRepository()
      .findByCode(reference.trim().toUpperCase())
      .catch(() => null),
    // Le conseil syndical : la MÊME source que le mail de date d'AG (20/10/2026), et non
    // plus les fiches de l'annuaire cochées « conseil syndical ». Lecture ratée : rien, saisie à la main.
    destinatairesConseilSyndical(ref).catch((err: unknown) => {
      console.warn(`[composer] conseil syndical indisponible pour ${ref} :`, (err as Error).message);
      return { source: "aucune" as const, emails: [] as string[] };
    }),
  ]);
  const contacts = fusionnerContactsCopro(crypto, proprietaires, estale?.conseilSyndical ?? []);
  // Best-effort : un binôme introuvable ne prive pas des contacts (liste vide).
  const copieBinome = envoyeur ? await binomeEnCopie(copro, envoyeur) : [];
  return {
    contacts,
    lotsPrincipaux: copro?.lotsPrincipaux && copro.lotsPrincipaux > 0 ? copro.lotsPrincipaux : null,
    conseil: conseilPourComposition(cascadeCS, contacts),
    copieBinome,
  };
}

export type DossierComposition = Pick<Dossier, "id" | "titre" | "type" | "statut" | "coproCode">;

/** Dossiers OUVERTS de la copro dans le périmètre du gestionnaire (codes Crypto et ESTALE). */
export async function listerDossiersComposition(managerId: string, reference: string): Promise<DossierComposition[]> {
  return dossiersPourRattacher(managerId, reference);
}

export interface DemandeBrouillon {
  objet: string;
  corps: string;
  a: string[];
  cc: string[];
  /**
   * Copie cachée : « toute la copropriété » (REA-305). Découpée en plusieurs mails au-delà de
   * la limite d'Exchange ; sans « À », le mail est adressé à la boîte elle-même.
   */
  cci?: string[];
  /** Dossier auquel rattacher le mail (facultatif). */
  dossierId?: string;
  /** Corps mis en forme, nettoyé et habillé (REA-345, pilote) ; `corps` reste le texte équivalent. */
  corpsHtml?: string;
}

export interface ResultatBrouillon {
  /** true = rien n'a été écrit dans la boîte (Graph absent / pas de vraie boîte) : aperçu seulement. */
  simulation: boolean;
  /** true = le mail est PARTI (MAIL_ENVOI=on) ; false = brouillon à relire dans Outlook. */
  envoye?: boolean;
  boite: string | null;
  webLink?: string;
  /** Le mail a bien été inscrit au journal du dossier demandé. */
  rattache?: boolean;
  /** Nombre de mails créés : plus d'un quand la copie cachée a été découpée en lots. */
  mails?: number;
}

/** Le bouton du compositeur ENVOIE-t-il (MAIL_ENVOI=on ET `envoi` de la boîte) ou crée-t-il un brouillon ? */
export function envoiDirectComposition(config: BoiteTriConfig | null): boolean {
  return brouillonPossible(config) && envoiMailPour(boiteEnvoi(config));
}

/** Un brouillon peut-il être créé (Graph branché et vraie boîte partagée configurée) ? */
export function brouillonPossible(config: BoiteTriConfig | null): boolean {
  const boite = boiteEnvoi(config);
  return mailModuleActif() && Boolean(boite) && boite !== BOITE_ECHANTILLON;
}

// Le mail neuf part en TROIS temps depuis le 27/10/2026, comme la réponse (REA-421) :
//   1. preparerComposition crée le(s) brouillon(s) dans la boîte (destinataires, objet, corps,
//      signature) et rend un jeton chiffré par brouillon ;
//   2. le navigateur dépose chaque fichier par tranches sur chaque brouillon (/mes-emails/pj/depot) ;
//   3. finaliserComposition envoie (mode « envoyer ») ou laisse le brouillon, puis inscrit le mail
//      au journal du dossier ; un fichier refusé en route : abandonnerComposition les supprime.
// Avant, les fichiers voyageaient en base64 dans l'action, plafonnés à 2,5 Mo au total.

export interface PreparationComposition {
  /** true = aperçu seulement (Graph absent / pas de vraie boîte) : aucun brouillon, aucun jeton. */
  simulation: boolean;
  boite: string | null;
  /** Le mail partira à la finalisation (sinon il reste en brouillon dans Outlook). */
  envoi?: boolean;
  /** Un jeton par brouillon (un par lot de copie cachée), dans l'ordre des lots. */
  jetons?: string[];
  webLink?: string;
  mails?: number;
}

/**
 * Crée le(s) brouillon(s) NEUF(S) dans la boîte partagée, sans rien envoyer. Le mode (envoi ou
 * brouillon) est décidé ICI, garde d'envoi comprise (MAIL_ENVOI et `envoi` de la boîte), et
 * scellé dans le jeton : la finalisation ne peut pas l'élargir. Un échec en route supprime les
 * brouillons déjà créés (pas d'orphelin dans la boîte).
 */
export async function preparerComposition(
  d: DemandeBrouillon,
  g: Gestionnaire,
  config: BoiteTriConfig | null,
): Promise<PreparationComposition> {
  const boite = boiteEnvoi(config);
  if (!brouillonPossible(config) || !boite) {
    return { simulation: true, boite };
  }
  // Signitic ne passe pas sur un brouillon créé par l'app : on pose la signature nous-mêmes.
  const signatureHtml = await getSignatureGestionnaire(g);
  const outbound = getMailOutboundProvider();
  // Toute la copropriété (REA-305) : la copie cachée part en lots sous la limite d'Exchange,
  // un mail par lot. Sans « À », le mail est adressé à la boîte elle-même.
  const a = d.a.length ? d.a : d.cci?.length ? [boite] : [];
  const lots = d.cci?.length ? enLots(d.cci) : [[]];
  const mode = envoiMailPour(boite) ? "envoyer" : "brouillon";
  const crees: { id: string; webLink?: string; internetMessageId?: string }[] = [];
  try {
    for (const cci of lots) {
      const cree = await outbound.creerBrouillonNeuf({
        boite,
        sujet: d.objet,
        corps: d.corps,
        ...(d.corpsHtml ? { corpsHtml: d.corpsHtml } : {}),
        ...(a.length ? { a } : {}),
        ...(d.cc.length ? { cc: d.cc } : {}),
        ...(cci.length ? { cci } : {}),
        ...(signatureHtml ? { signatureHtml } : {}),
      });
      // Sans id, ni dépôt de fichier ni envoi ne sont possibles.
      if (!cree.id) throw new Error("Graph n'a pas rendu l'identifiant du brouillon.");
      crees.push({ ...cree, id: cree.id });
    }
  } catch (e) {
    await supprimerBrouillons(boite, crees.map((c) => c.id));
    throw e;
  }
  const pour = d.cci?.length ? `toute la copropriété (${d.cci.length} adresses)` : d.a.slice(0, 2).join(", ") || "?";
  const exp = Date.now() + DUREE_JETON_MS;
  const jetons = crees.map((c, lot) =>
    scellerJeton({
      nature: "neuf",
      boite,
      draftId: c.id,
      gid: g.id,
      mode,
      lot,
      lots: crees.length,
      ...(lot === 0 && c.internetMessageId ? { internetMessageId: c.internetMessageId } : {}),
      ...(lot === 0 && d.dossierId ? { dossier: { id: d.dossierId, pour, objet: d.objet } } : {}),
      exp,
    }),
  );
  return {
    simulation: false,
    boite,
    envoi: mode === "envoyer",
    jetons,
    ...(crees[0]?.webLink ? { webLink: crees[0].webLink } : {}),
    mails: crees.length,
  };
}

/**
 * Les brouillons d'une composition, si TOUS les jetons sont intacts, à la personne, et de la
 * même composition (même boîte, même mode, lots 0..n-1 au complet). null sinon.
 */
function brouillonsDe(jetons: string[], gid: string): JetonNeuf[] | null {
  const l: JetonNeuf[] = [];
  for (const jeton of jetons) {
    const j = brouillonNeufDe(jeton, gid);
    if (!j) return null;
    l.push(j);
  }
  l.sort((x, y) => x.lot - y.lot);
  const premier = l[0];
  if (!premier || premier.lots !== l.length) return null;
  const memes = l.every((j, i) => j.lot === i && j.lots === premier.lots && j.boite === premier.boite && j.mode === premier.mode);
  return memes ? l : null;
}

async function supprimerBrouillons(boite: string, ids: string[]): Promise<void> {
  const outbound = getMailOutboundProvider();
  for (const id of ids) {
    try {
      await outbound.supprimerBrouillon({ boite, id });
    } catch (e) {
      console.warn("[composer] brouillon abandonné non supprimé :", e instanceof Error ? e.message : e);
    }
  }
}

/**
 * Le mail est prêt (fichiers déposés) : il part si le jeton le permet, sinon il reste en
 * brouillon dans Outlook. Puis il est inscrit au journal du dossier demandé (contrôle de
 * périmètre inclus) : créer puis envoyer garde l'internetMessageId, qui survit à l'envoi.
 * null : jetons expirés, falsifiés ou d'une autre personne.
 */
export async function finaliserComposition(jetons: string[], g: Gestionnaire): Promise<ResultatBrouillon | null> {
  const l = brouillonsDe(jetons, g.id);
  const premier = l?.[0];
  if (!l || !premier) return null;
  const envoye = premier.mode === "envoyer";
  if (envoye) {
    const outbound = getMailOutboundProvider();
    for (const j of l) await outbound.envoyerBrouillon({ boite: j.boite, id: j.draftId });
  }
  let rattache: boolean | undefined;
  if (premier.dossier && premier.internetMessageId) {
    const resume = `${envoye ? "Mail envoyé à" : "Mail préparé pour"} ${premier.dossier.pour} : ${premier.dossier.objet}`;
    rattache = await rattacherEmailAuDossier(premier.dossier.id, g.id, g.initiales, resume, refEchange(premier.boite, premier.internetMessageId));
  } else if (premier.dossier) {
    rattache = false; // Graph n'a pas rendu d'identifiant : on le dit plutôt que de faire semblant.
  }
  return { simulation: false, envoye, boite: premier.boite, ...(rattache !== undefined ? { rattache } : {}), mails: l.length };
}

/** Un fichier n'a pas pu être joint : les brouillons incomplets sont retirés de la boîte. */
export async function abandonnerComposition(jetons: string[], gid: string): Promise<boolean> {
  const l = brouillonsDe(jetons, gid);
  const premier = l?.[0];
  if (!l || !premier) return false;
  await supprimerBrouillons(premier.boite, l.map((j) => j.draftId));
  return true;
}
