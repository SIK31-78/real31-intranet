// Service : annonce de la prochaine AG aux copropriétaires par un mailing ESTALE
// (REA-144). Assemble les données (référentiel, confirmation de la date d'AG, agence),
// rend le texte par le domaine, et demande au port de créer le BROUILLON. Rien n'est
// envoyé d'ici : l'envoi se lance dans ESTALE par le gestionnaire, après relecture.
//
// Gardes, dans l'ordre : périmètre d'écriture (ADR-041), copro ESTALE (une copro Crypto
// n'a pas de copropriétaires dans ESTALE), drapeau ESTALE_MAILING_ACTIF (SE999 seule
// tant qu'il n'est pas à "1"), puis les préconditions du texte (date, heure, lieu,
// date limite pas encore passée). Passe par le routeur (ADR-001).

import { getAgenceRepository, getCoproRepository, getMailingEstaleProvider } from "@/lib/adapters/router";
import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";
import { getConfirmations } from "@/lib/services/coproprietes/confirmation-evenement";
import {
  choisirModeleAnnonce,
  lieuAnnonce,
  refusAnnonce,
  refusGardeMailing,
  rendreAnnonceAg,
  type ModeleAnnonceAg,
} from "@/lib/domain/annonce-ag-mailing";
import type { MailingCree } from "@/lib/ports/mailing-estale-provider";

export interface AuteurAnnonce {
  id: string;
  nomComplet: string;
  email?: string | undefined;
  /** Ligne directe du gestionnaire si un jour le profil la porte ; absente = omise. */
  ligneDirecte?: string | undefined;
}

export interface ApercuAnnonceAg {
  coproCode: string;
  modele: ModeleAnnonceAg;
  /** Modèle proposé par la règle (le gestionnaire peut en choisir un autre). */
  modelePropose: ModeleAnnonceAg;
  raisonModele: string;
  agDateISO: string;
  dateLimiteISO: string;
  titre: string;
  objet: string;
  texte: string;
  html: string;
  /** Raison pour laquelle la création sera refusée (garde d'activation), sinon null. */
  refusCreation: string | null;
}

export type Resultat<T> = { ok: true; valeur: T } | { ok: false; raison: string };

async function preparer(
  coproCode: string,
  auteur: AuteurAnnonce,
  aujourdhuiISO: string,
  modeleChoisi?: ModeleAnnonceAg,
): Promise<Resultat<ApercuAnnonceAg>> {
  await exigerPerimetre(coproCode, auteur.id);
  const copro = await getCoproRepository().findByCode(coproCode);
  if (!copro) return { ok: false, raison: "Copropriété introuvable." };
  if (copro.source !== "estale") {
    return {
      ok: false,
      raison:
        "Cette copropriété est gérée dans Crypto : ses copropriétaires ne sont pas dans ESTALE, le mailing n'est possible que pour les copropriétés ESTALE.",
    };
  }

  const ag = copro.prochaineAg;
  // La salle, le lieu libre et le mode vivent sur la confirmation de la date d'AG. Une
  // confirmation posée pour une AUTRE date (replanifiée depuis) ne vaut plus pour celle-ci.
  const confirmation = (await getConfirmations(copro.code)).find(
    (c) => c.type === "AG" && ag && c.date === ag.date,
  );
  const agenceCode = copro.agenceId
    ? ((await getAgenceRepository().listerAgences()).find((a) => a.id === copro.agenceId)?.code ?? null)
    : null;
  const lieu = lieuAnnonce({
    lieuLibre: confirmation?.lieuLibre,
    salleEmail: confirmation?.salleEmail,
    agenceCode,
  });

  const refus = refusAnnonce({ agDateISO: ag?.date, heure: ag?.heure, lieu, aujourdhuiISO });
  if (refus || !ag || !ag.heure || !lieu) return { ok: false, raison: refus ?? "Annonce impossible." };

  const propose = choisirModeleAnnonce({ modeReunion: confirmation?.modeReunion, agConnect: copro.agConnect });
  const modele = modeleChoisi ?? propose.modele;
  const rendu = rendreAnnonceAg({
    modele,
    agDateISO: ag.date,
    heure: ag.heure,
    lieu,
    gestionnaire: { nomComplet: auteur.nomComplet, ligneDirecte: auteur.ligneDirecte },
  });
  const [a, m, j] = ag.date.split("-");
  return {
    ok: true,
    valeur: {
      coproCode: copro.code,
      modele,
      modelePropose: propose.modele,
      raisonModele: propose.raison,
      agDateISO: ag.date,
      dateLimiteISO: rendu.dateLimiteISO,
      titre: `${copro.code} - Annonce de l'AG du ${j}/${m}/${a}`,
      objet: rendu.objet,
      texte: rendu.texte,
      html: rendu.html,
      refusCreation: refusGardeMailing(copro.code, process.env.ESTALE_MAILING_ACTIF),
    },
  };
}

/** Aperçu du texte, sans rien créer. */
export async function apercuAnnonceAg(
  coproCode: string,
  auteur: AuteurAnnonce,
  aujourdhuiISO: string,
  modele?: ModeleAnnonceAg,
): Promise<Resultat<ApercuAnnonceAg>> {
  return preparer(coproCode, auteur, aujourdhuiISO, modele);
}

/**
 * Crée le mailing dans ESTALE, NON ENVOYÉ. Le texte est recalculé côté serveur (jamais
 * repris du client) : ce qui part dans ESTALE est exactement ce que la règle produit.
 */
export async function creerAnnonceAg(
  coproCode: string,
  auteur: AuteurAnnonce,
  aujourdhuiISO: string,
  modele?: ModeleAnnonceAg,
): Promise<Resultat<MailingCree>> {
  const apercu = await preparer(coproCode, auteur, aujourdhuiISO, modele);
  if (!apercu.ok) return apercu;
  const a = apercu.valeur;
  if (a.refusCreation) return { ok: false, raison: a.refusCreation };
  try {
    const mailing = await getMailingEstaleProvider().creerBrouillon({
      coproCode: a.coproCode,
      titre: a.titre,
      objet: a.objet,
      contenuHtml: a.html,
      ...(auteur.email ? { repondreA: auteur.email } : {}),
    });
    return { ok: true, valeur: mailing };
  } catch (e) {
    return { ok: false, raison: `ESTALE a refusé la création du mailing : ${(e as Error).message}` };
  }
}

/** La copro est-elle gérée dans ESTALE (sinon pas de bouton d'annonce : copro Crypto) ? */
export async function annonceAgPossible(coproCode: string): Promise<boolean> {
  const copro = await getCoproRepository().findByCode(coproCode);
  return copro?.source === "estale";
}
