// Compositeur d'un mail SORTANT depuis la boîte partagée (syndicN), façon « F1 » de Crypto.
// Fournit les DONNÉES (copros ESTALE+Crypto de l'agence, contacts d'une copro) et crée un
// BROUILLON — jamais d'envoi. L'objet/corps sont composés côté domaine (pur), ici on
// orchestre les ports. Garde-fou : tant qu'envoiMailActif() est faux, rien n'écrit dans la
// boîte (aperçu seul). Envoi au nom de syndicN = la boîte passée au provider.

import { getContactsCoproProvider, getMailOutboundProvider, getReferentielTriProvider } from "@/lib/adapters/router";
import { boiteTriConfiguree, envoiMailActif } from "@/lib/domain/mail-gate";
import type { ContactCopro, CoproChoisissable } from "@/lib/domain/mes-emails-composition";

export type { CoproChoisissable };

/** La boîte partagée d'où part le mail (null si le module n'est pas configuré sur cette agence). */
export function boiteEnvoi(): string | null {
  const b = boiteTriConfiguree();
  return b && b !== "echantillon" ? b : b; // "echantillon" en dev, null si absent
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

export interface DemandeBrouillon {
  objet: string;
  corps: string;
  a: string[];
  cc: string[];
}

export interface ResultatBrouillon {
  /** true = rien n'a été écrit dans la boîte (envoi coupé) : aperçu seulement. */
  simulation: boolean;
  boite: string | null;
  webLink?: string;
}

/**
 * Crée un brouillon NEUF dans la boîte partagée (statut Draft, jamais envoyé). Si l'envoi
 * n'est pas ouvert (MAIL_ENVOI≠on) ou si aucune boîte n'est configurée, renvoie simulation:true
 * sans toucher la boîte. On ne propose JAMAIS l'envoi direct ici (toujours un brouillon relu).
 */
export async function creerBrouillonComposition(d: DemandeBrouillon): Promise<ResultatBrouillon> {
  const boite = boiteEnvoi();
  if (!envoiMailActif() || !boite || boite === "echantillon") {
    return { simulation: true, boite };
  }
  const r = await getMailOutboundProvider().creerBrouillonNeuf({
    boite,
    sujet: d.objet,
    corps: d.corps,
    ...(d.a.length ? { a: d.a } : {}),
    ...(d.cc.length ? { cc: d.cc } : {}),
  });
  return { simulation: false, boite, ...(r.webLink ? { webLink: r.webLink } : {}) };
}
