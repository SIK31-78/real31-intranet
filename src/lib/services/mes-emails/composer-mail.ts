// Compositeur d'un mail SORTANT depuis la boîte partagée (syndicN), façon « F1 » de Crypto.
// Fournit les DONNÉES (copros ESTALE+Crypto de l'agence, contacts et dossiers ouverts d'une
// copro) et crée un BROUILLON, jamais d'envoi direct. L'objet/corps sont composés côté
// domaine (pur), ici on orchestre les ports. Le brouillon se crée sur clic (geste de
// validation) dès que Graph est branché ; l'envoi réel se fait dans Outlook. Expéditeur =
// syndicN (la boîte passée au provider). Le brouillon peut être rattaché à un dossier : son
// internetMessageId survit à l'envoi, « Ouvrir le mail » depuis le dossier le retrouve.

import {
  getContactsCoproProvider,
  getCoproRepository,
  getCoproprietairesEstaleProvider,
  getMailOutboundProvider,
  getReferentielTriProvider,
} from "@/lib/adapters/router";
import { boiteTriConfiguree, envoiMailActif, mailModuleActif } from "@/lib/domain/mail-gate";
import { donneesCoproEstale } from "@/lib/services/estale/donnees-copro-estale";
import { enLots, fusionnerContactsCopro, type ContactsComposition, type CoproChoisissable, type DestinataireTrouve } from "@/lib/domain/mes-emails-composition";
import type { PieceJointeMail } from "@/lib/ports/mail-outbound-provider";
import { cleDeReference } from "@/lib/domain/tri-emails";
import { normaliserRef } from "@/lib/domain/copro-fusion";
import { getSignatureGestionnaire } from "./get-signature";
import type { Dossier } from "@/lib/domain/dossier";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { refEchange } from "@/lib/domain/echanges";
import { dossiersPourRattacher } from "@/lib/services/echanges/rechercher";
import { rattacherEmailAuDossier } from "@/lib/services/dossiers/rattacher-email";

export type { CoproChoisissable, ContactsComposition };

/**
 * La boîte partagée d'où part le mail : celle de l'agence (MAIL_BOITE_TRI). null si le module
 * n'est pas configuré ; "echantillon" en dev (aperçu possible, jamais de brouillon).
 */
export function boiteEnvoi(): string | null {
  return boiteTriConfiguree();
}

export async function listerCoprosComposition(): Promise<CoproChoisissable[]> {
  const ref = await getReferentielTriProvider().charger();
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
export async function rechercherDestinataires(texte: string): Promise<DestinataireTrouve[]> {
  const [identites, copros] = await Promise.all([
    getContactsCoproProvider().rechercherIdentites(texte),
    listerCoprosComposition().catch(() => [] as CoproChoisissable[]),
  ]);
  // Les copros de l'AGENCE seulement (MAIL_TRI_AGENCE) : un copropriétaire de La Garenne ne
  // sort pas pour Houilles. Une fiche sans copro (artisan, notaire) reste proposée.
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
  return out.slice(0, 15);
}

/**
 * Contacts d'une copro : l'annuaire Crypto, complété du conseil syndical ESTALE (retour du
 * 14/10). Pour une copro présente dans ESTALE, les copropriétaires viennent d'ESTALE et non
 * plus de Crypto (REA-356, 19/10/2026 : Crypto gardait d'anciens copropriétaires, le mail
 * « toute la copropriété » de la S178 est parti à 80 adresses). ESTALE en panne : repli sur
 * l'annuaire Crypto, comme avant, et on le note.
 * Le nombre de lots principaux accompagne les contacts : la confirmation d'envoi à toute la
 * copropriété s'en sert pour alerter (plus de copropriétaires que de lots = liste suspecte).
 */
export async function listerContactsComposition(reference: string): Promise<ContactsComposition> {
  const ref = normaliserRef(reference);
  const [crypto, estale, proprietaires, copro] = await Promise.all([
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
  ]);
  return {
    contacts: fusionnerContactsCopro(crypto, proprietaires, estale?.conseilSyndical ?? []),
    lotsPrincipaux: copro?.lotsPrincipaux && copro.lotsPrincipaux > 0 ? copro.lotsPrincipaux : null,
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
  /** Fichiers joints depuis l'ordinateur. */
  piecesJointes?: PieceJointeMail[];
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

/** Le bouton du compositeur ENVOIE-t-il (MAIL_ENVOI=on) ou crée-t-il un brouillon ? */
export function envoiDirectComposition(): boolean {
  return brouillonPossible() && envoiMailActif();
}

/** Un brouillon peut-il être créé (Graph branché et vraie boîte partagée configurée) ? */
export function brouillonPossible(): boolean {
  const boite = boiteEnvoi();
  return mailModuleActif() && Boolean(boite) && boite !== "echantillon";
}

/**
 * Crée un brouillon NEUF dans la boîte partagée (statut Draft, rien n'est envoyé) : c'est le
 * geste de validation, le mail se relit et part depuis Outlook (ADR-047). Sans Graph ou sans
 * vraie boîte, renvoie simulation:true sans rien écrire. Jamais d'envoi direct ici.
 * Si un dossier est demandé, le mail est inscrit à son journal (contrôle de périmètre inclus).
 */
export async function creerBrouillonComposition(
  d: DemandeBrouillon,
  g: Gestionnaire,
): Promise<ResultatBrouillon> {
  const boite = boiteEnvoi();
  if (!brouillonPossible() || !boite) {
    return { simulation: true, boite };
  }
  // Signitic ne passe pas sur un brouillon créé par l'app : on pose la signature nous-mêmes.
  const signatureHtml = await getSignatureGestionnaire(g);
  const outbound = getMailOutboundProvider();
  // Toute la copropriété (REA-305) : la copie cachée part en lots sous la limite d'Exchange,
  // un mail par lot. Sans « À », le mail est adressé à la boîte elle-même.
  const a = d.a.length ? d.a : d.cci?.length ? [boite] : [];
  const lots = d.cci?.length ? enLots(d.cci) : [[]];
  const envoi = envoiMailActif();
  let r: Awaited<ReturnType<typeof outbound.creerBrouillonNeuf>> = {};
  let envoye = false;
  for (const [i, cci] of lots.entries()) {
    const cree = await outbound.creerBrouillonNeuf({
      boite,
      sujet: d.objet,
      corps: d.corps,
      ...(d.corpsHtml ? { corpsHtml: d.corpsHtml } : {}),
      ...(a.length ? { a } : {}),
      ...(d.cc.length ? { cc: d.cc } : {}),
      ...(cci.length ? { cci } : {}),
      ...(signatureHtml ? { signatureHtml } : {}),
      ...(d.piecesJointes?.length ? { piecesJointes: d.piecesJointes } : {}),
    });
    if (i === 0) r = cree;
    // Envoi réel (MAIL_ENVOI=on) : le brouillon part aussitôt. Créer puis envoyer garde
    // l'internetMessageId, qui rattache le mail au dossier.
    if (envoi && cree.id) {
      await outbound.envoyerBrouillon({ boite, id: cree.id });
      envoye = true;
    }
  }

  let rattache: boolean | undefined;
  if (d.dossierId && r.internetMessageId) {
    const pour = d.cci?.length ? `toute la copropriété (${d.cci.length} adresses)` : d.a.slice(0, 2).join(", ") || "?";
    const resume = `${envoye ? "Mail envoyé à" : "Mail préparé pour"} ${pour} : ${d.objet}`;
    rattache = await rattacherEmailAuDossier(d.dossierId, g.id, g.initiales, resume, refEchange(boite, r.internetMessageId));
  } else if (d.dossierId) {
    rattache = false; // Graph n'a pas rendu d'identifiant : on le dit plutôt que de faire semblant.
  }
  return {
    simulation: false,
    envoye,
    boite,
    ...(r.webLink ? { webLink: r.webLink } : {}),
    ...(rattache !== undefined ? { rattache } : {}),
    mails: lots.length,
  };
}
