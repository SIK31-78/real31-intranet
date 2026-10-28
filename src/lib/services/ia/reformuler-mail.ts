// Reformuler un mail (ADR-051, 28/10/2026) : vérifie le texte et le plafond du jour, appelle le
// modèle, nettoie et contrôle la sortie, journalise l'usage (jamais le texte). Le texte de la
// personne n'est jamais perdu : tout échec rend un message, et c'est l'écran qui garde
// l'original (la reformulation ne remplace rien d'elle-même, et « Annuler la reformulation »
// le rend à l'identique).

import { getIaUsageRepository, getReformulationProvider } from "@/lib/adapters/router";
import {
  DELAI_MS,
  FONCTION_REFORMULATION,
  MESSAGE_ECHEC,
  MODELE_DEFAUT,
  SYSTEME_REFORMULATION,
  construireMessage,
  controlerSortie,
  coutEstime,
  jourParis,
  maxTokensPour,
  messageRefus,
  nettoyerSortie,
  plafondJour,
  restaurerBalises,
  verifierTexte,
  type NatureMail,
  type RaisonRefus,
} from "@/lib/domain/reformulation";
import { ErreurReformulation, type ReformulationProvider } from "@/lib/ports/reformulation-provider";
import type { LigneUsageIa } from "@/lib/ports/ia-usage-repository";
import { signaler, signalerException, tracer } from "@/lib/observabilite";

export type DemandeReformulationMail = { texte: string; nature: NatureMail; objet?: string | null };

export type ResultatReformulation =
  | { ok: true; texte: string; inchange: boolean }
  | { ok: false; message: string };

/** Qui demande : un collaborateur connecté (id technique et initiales, rien d'autre). */
export type Demandeur = { id: string; initiales: string; incarnation: boolean };

/** Le bouton s'affiche-t-il ? (interrupteur posé et clé présente) */
export function reformulationDisponible(): boolean {
  return getReformulationProvider() !== null;
}

export function modeleReformulation(): string {
  return process.env.IA_MODELE_REFORMULATION?.trim() || MODELE_DEFAUT;
}

const MESSAGES_ERREUR: Record<ErreurReformulation["code"], string> = {
  delai: "La reformulation a pris trop de temps, votre texte est intact. Réessayez dans un instant.",
  saturation: "Le service de reformulation est saturé, votre texte est intact. Réessayez dans un instant.",
  credit: "La reformulation est indisponible pour le moment (crédit IA épuisé), votre texte est intact.",
  configuration: MESSAGE_ECHEC,
  api: MESSAGE_ECHEC,
};

/** Le journal ne doit jamais faire échouer la reformulation : une erreur est signalée, pas levée. */
async function journaliser(ligne: LigneUsageIa): Promise<void> {
  try {
    await getIaUsageRepository().enregistrer(ligne);
  } catch (e) {
    signalerException(e, { source: "ia-usage" });
  }
}

export async function reformulerMail(
  qui: Demandeur,
  demande: DemandeReformulationMail,
  options: { provider?: ReformulationProvider | null; maintenant?: Date } = {},
): Promise<ResultatReformulation> {
  const provider = options.provider === undefined ? getReformulationProvider() : options.provider;
  if (!provider) return { ok: false, message: "La reformulation n'est pas activée." };

  const verif = verifierTexte(demande.texte);
  if (!verif.ok) return { ok: false, message: verif.message };

  const jour = jourParis(options.maintenant ?? new Date());
  const plafond = plafondJour(process.env.IA_REFORMULATION_PLAFOND_JOUR);
  try {
    const deja = await getIaUsageRepository().compterDuJour(qui.id, FONCTION_REFORMULATION, jour);
    if (deja !== null && deja >= plafond) {
      return { ok: false, message: `Vous avez atteint le plafond de ${plafond} reformulations pour aujourd'hui, votre texte est intact.` };
    }
  } catch (e) {
    // Journal illisible : on ne bloque pas la personne pour autant.
    signalerException(e, { source: "ia-usage" });
  }

  const modele = modeleReformulation();
  const texte = demande.texte.trim();
  const debut = Date.now();
  const base = { fonction: FONCTION_REFORMULATION, gestionnaireId: qui.id, initiales: qui.initiales, incarnation: qui.incarnation, jour };

  let reponse;
  try {
    reponse = await provider.reformuler({
      systeme: SYSTEME_REFORMULATION,
      message: construireMessage({ texte, nature: demande.nature, objet: demande.objet ?? null }),
      modele,
      maxTokens: maxTokensPour(texte),
      delaiMs: DELAI_MS,
    });
  } catch (e) {
    const err = e instanceof ErreurReformulation ? e : new ErreurReformulation("api", "erreur inattendue");
    const dureeMs = Date.now() - debut;
    await journaliser({ ...base, modele, tokensEntree: 0, tokensSortie: 0, coutEstime: null, dureeMs, succes: false, erreur: err.code });
    tracer("ia", "reformulation en échec", { gestionnaire: qui.id, modele, code: err.code, duree: String(dureeMs) });
    if (err.code === "credit" || err.code === "configuration") signaler(`Reformulation IA : ${err.message}`, { source: "ia" });
    else if (err.code === "api") signalerException(e, { source: "ia" });
    return { ok: false, message: MESSAGES_ERREUR[err.code] };
  }

  const dureeMs = Date.now() - debut;
  const conso = {
    modele: reponse.modele,
    tokensEntree: reponse.tokensEntree,
    tokensSortie: reponse.tokensSortie,
    coutEstime: coutEstime(reponse.modele, reponse.tokensEntree, reponse.tokensSortie),
    dureeMs,
  };

  // Coupée (max_tokens) ou refusée par le modèle : rien à contrôler. Sinon, nettoyage puis
  // contrôles : une sortie écartée ne remplace jamais le texte.
  let raison: RaisonRefus | null = null;
  let sortie = "";
  if (reponse.fin === "termine") {
    sortie = nettoyerSortie(reponse.texte);
    const controle = controlerSortie(texte, sortie);
    if (!controle.ok) raison = controle.raison;
  }
  const erreur = reponse.fin !== "termine" ? reponse.fin : raison ? `controle:${raison}` : null;

  await journaliser({ ...base, ...conso, succes: erreur === null, erreur });
  tracer("ia", erreur ? "reformulation écartée" : "reformulation appliquée", {
    gestionnaire: qui.id,
    modele: conso.modele,
    duree: String(dureeMs),
    tokens: `${conso.tokensEntree}/${conso.tokensSortie}`,
    ...(erreur ? { raison: erreur } : {}),
  });

  if (raison) return { ok: false, message: messageRefus(raison) };
  if (erreur) return { ok: false, message: MESSAGE_ECHEC };

  const final = restaurerBalises(sortie);
  return { ok: true, texte: final, inchange: final === texte };
}
