// « Pas pour moi » (REA-327, Mylène 15/10/2026) : un mail de la boîte partagée rangé chez le
// mauvais binôme (St Martin rangé comme Les Rosiers) doit pouvoir PARTIR chez le binôme de la
// bonne copro, même si cette copro n'est pas dans le portefeuille de la personne. Le geste
// passe par le journal du tri : c'est lui qui distribue les mails aux binômes
// (boites-visibles), et il garde qui a fait quoi. Le retour pur et simple au tri
// (rendreAuTri) n'avait aucun appelant hors de son test : retiré le 27/10/2026.

import type { EntreeJournalTri } from "@/lib/domain/tri-emails";
import { boiteTri, type BoiteTriConfig } from "@/lib/domain/mail-gate";
import type { CoproDestination } from "@/lib/domain/recherche-copro-tolerante";
import { annulerRangement, depsParDefaut, rangerMail, resoudreDossier, type DepsRangement, type ResultatRangement } from "./ranger";

/** Même fenêtre que la distribution aux binômes. */
const FENETRE_JOURS = 45;

/** Le rangement en cours de ce mail dans la boîte (le plus récent, non annulé). */
async function rangementEnCours(boite: string, internetMessageId: string, deps: DepsRangement): Promise<EntreeJournalTri> {
  if (deps.boite !== boite) throw new Error("Ce mail n'est pas dans la boîte triée.");
  const depuis = new Date(Date.now() - FENETRE_JOURS * 86_400_000).toISOString();
  const e = await deps.repo.rangementActif(boite, internetMessageId, depuis);
  if (!e) throw new Error("Ce mail n'a pas été rangé par le tri : rien à rendre.");
  return e;
}

/**
 * Envoie le mail chez le binôme de la bonne copro : le rangement actuel est annulé, puis le
 * mail est rangé comme le ferait le tri (dossier du binôme, étiquette au code copro).
 */
export async function envoyerABonneCopro(
  boite: string,
  internetMessageId: string,
  reference: string,
  par: string,
  deps: DepsRangement = depsParDefaut(boiteTri(boite)),
): Promise<ResultatRangement> {
  const e = await rangementEnCours(boite, internetMessageId, deps);
  // Vérifie la destination AVANT de toucher au mail : une copro sans gestionnaire au mandat
  // ne doit pas laisser le mail revenu au tri à mi-chemin.
  const cible = await resoudreDossier({ type: "copro", reference }, deps);
  if (cible.cle === e.dossierCle && e.coproReference === cible.copro) {
    throw new Error(`Ce mail est déjà rangé pour ${cible.copro}.`);
  }
  await annulerRangement(e.id, par, deps);
  // En réel le mail a changé d'id en revenant en réception ; en simulation il n'a pas bougé.
  const pos = e.simulation || deps.simulation ? null : await deps.rangement.localiser(boite, internetMessageId);
  if (!e.simulation && !deps.simulation && !pos) throw new Error("Le mail est introuvable dans la boîte après son retour au tri.");
  return rangerMail(
    {
      messageId: pos?.messageId ?? e.messageId,
      internetMessageId,
      expediteur: e.expediteur,
      objet: e.objet,
      cible: { type: "copro", reference: cible.copro ?? reference },
      suggestion: null,
    },
    par,
    deps,
  );
}

/**
 * Les copros où envoyer le mail : toutes celles de la boîte triée (ses agences), pas le seul
 * portefeuille. Sans boîte : aucune.
 */
export async function coprosPourReaffecter(config: BoiteTriConfig | null, deps: DepsRangement = depsParDefaut(config)): Promise<CoproDestination[]> {
  if (!deps.boite) return [];
  const { copros } = await deps.referentiel.charger();
  return copros
    .map((c) => ({ reference: c.reference, nom: c.nom, adresse: c.adresse, gestionnaire: c.gestionnaire?.nomComplet ?? null }))
    .sort((a, b) => a.reference.localeCompare(b.reference));
}
