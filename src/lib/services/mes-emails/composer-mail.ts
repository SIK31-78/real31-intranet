// Compositeur d'un mail SORTANT depuis la boîte partagée (syndicN), façon « F1 » de Crypto.
// Fournit les DONNÉES (copros ESTALE+Crypto de l'agence, contacts et dossiers ouverts d'une
// copro) et crée un BROUILLON — jamais d'envoi direct. L'objet/corps sont composés côté
// domaine (pur), ici on orchestre les ports. Le brouillon se crée sur clic (geste de
// validation) dès que Graph est branché ; l'envoi réel se fait dans Outlook. Expéditeur =
// syndicN (la boîte passée au provider). Le brouillon peut être rattaché à un dossier : son
// internetMessageId survit à l'envoi, « Ouvrir le mail » depuis le dossier le retrouve.

import { getContactsCoproProvider, getMailOutboundProvider, getReferentielTriProvider } from "@/lib/adapters/router";
import { boiteTriConfiguree, mailModuleActif } from "@/lib/domain/mail-gate";
import type { ContactCopro, CoproChoisissable } from "@/lib/domain/mes-emails-composition";
import type { Dossier } from "@/lib/domain/dossier";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { refEchange } from "@/lib/domain/echanges";
import { dossiersPourRattacher } from "@/lib/services/echanges/rechercher";
import { rattacherEmailAuDossier } from "@/lib/services/dossiers/rattacher-email";

export type { CoproChoisissable };

/**
 * La boîte partagée d'où part le mail : celle de l'agence (MAIL_BOITE_TRI). null si le module
 * n'est pas configuré ; "echantillon" en dev (aperçu possible, jamais de brouillon).
 */
export function boiteEnvoi(): string | null {
  return boiteTriConfiguree();
}

export async function listerCoprosComposition(): Promise<CoproChoisissable[]> {
  const ref = await getReferentielTriProvider().charger();
  return ref.copros
    .map((c) => ({ reference: c.reference, nom: c.nom, adresse: c.adresse, gestionnaire: c.gestionnaire?.nomComplet ?? null }))
    .sort((a, b) => a.reference.localeCompare(b.reference, "fr"));
}

export async function listerContactsComposition(reference: string): Promise<ContactCopro[]> {
  return getContactsCoproProvider().listerParCopro(reference);
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
  /** Dossier auquel rattacher le mail (facultatif). */
  dossierId?: string;
}

export interface ResultatBrouillon {
  /** true = rien n'a été écrit dans la boîte (Graph absent / pas de vraie boîte) : aperçu seulement. */
  simulation: boolean;
  boite: string | null;
  webLink?: string;
  /** Le mail a bien été inscrit au journal du dossier demandé. */
  rattache?: boolean;
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
  g: Pick<Gestionnaire, "id" | "initiales">,
): Promise<ResultatBrouillon> {
  const boite = boiteEnvoi();
  if (!brouillonPossible() || !boite) {
    return { simulation: true, boite };
  }
  const r = await getMailOutboundProvider().creerBrouillonNeuf({
    boite,
    sujet: d.objet,
    corps: d.corps,
    ...(d.a.length ? { a: d.a } : {}),
    ...(d.cc.length ? { cc: d.cc } : {}),
  });

  let rattache: boolean | undefined;
  if (d.dossierId && r.internetMessageId) {
    const resume = `Mail préparé pour ${d.a.slice(0, 2).join(", ") || "?"} : ${d.objet}`;
    rattache = await rattacherEmailAuDossier(d.dossierId, g.id, g.initiales, resume, refEchange(boite, r.internetMessageId));
  } else if (d.dossierId) {
    rattache = false; // Graph n'a pas rendu d'identifiant : on le dit plutôt que de faire semblant.
  }
  return {
    simulation: false,
    boite,
    ...(r.webLink ? { webLink: r.webLink } : {}),
    ...(rattache !== undefined ? { rattache } : {}),
  };
}
