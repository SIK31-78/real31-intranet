// Les boites de « Mes e-mails », SOURCE UNIQUE pour l'affichage, les actions (autorisation du
// « De : », PJ, classement) et la generation IA.
//
// - Boite perso : sa reception.
// - Boite PARTAGEE = la boite que le tri distribue (MAIL_BOITE_TRI, ex. syndic4 pour Houilles),
//   et on n'y lit QUE les mails que le tri a ranges vers MES dossiers de binome (gestionnaire
//   ou assistant·e), d'apres son journal (decision Sekou du 13/10 : « que le sous-dossier du
//   binome, pas tous les mails »). Le journal marche en simulation (mail reste en reception)
//   comme en reel (mail deplace dans le dossier du binome) : on relit les mails par leur
//   internetMessageId, ou qu'ils soient. Jamais toute la boite commune.

import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { construireBoites, type BoiteMail } from "@/lib/domain/boites-mail";
import { boiteTriConfiguree } from "@/lib/domain/mail-gate";
import { clesDossiersDe, type EntreeJournalTri } from "@/lib/domain/tri-emails";
import { getTriRepository } from "@/lib/adapters/router";

/** Fenetre du journal relue : les rangements des 45 derniers jours. */
const FENETRE_JOURS = 45;

export async function boitesVisibles(g: Pick<Gestionnaire, "email">): Promise<BoiteMail[]> {
  const tri = boiteTriConfiguree();
  return construireBoites(g.email, tri ?? undefined).map((b) => (b.personnelle ? b : { ...b, libelle: `${b.libelle} · mes mails` }));
}

/**
 * Les mails que le tri a distribues a mes binomes dans cette boite : internetMessageId ->
 * reference de la copro choisie au tri (null = rangé sans copro). Le plus recent rangement
 * l'emporte. Corbeille, Comptabilite, Divers et dossiers des autres binomes sont exclus.
 */
export async function distributionDe(g: Pick<Gestionnaire, "email">, boite: string): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (const e of await rangementsDeMesBinomes(g, boite)) {
    if (!out.has(e.internetMessageId)) out.set(e.internetMessageId, e.coproReference);
  }
  return out;
}

/**
 * Les conversations Graph des mails distribues a mes binomes (REA-408) : les « Envoyés »
 * d'une boite partagee ne montrent que les reponses faites dans ces conversations. Un
 * rangement sans conversation_id (anterieur a la colonne) n'en donne pas.
 */
export async function conversationsDistribuees(g: Pick<Gestionnaire, "email">, boite: string): Promise<Set<string>> {
  const out = new Set<string>();
  for (const e of await rangementsDeMesBinomes(g, boite)) if (e.conversationId) out.add(e.conversationId);
  return out;
}

/**
 * Les rangements recents de cette boite vers les dossiers de mes binomes, les plus recents
 * d'abord. Filtres en base par cle de dossier (27/10/2026) : relire tout le journal puis
 * filtrer ici dependait de son plafond de lignes, et les mails les plus anciens d'un binome
 * disparaissaient de « Mes e-mails » des que la boite etait active.
 */
async function rangementsDeMesBinomes(g: Pick<Gestionnaire, "email">, boite: string): Promise<EntreeJournalTri[]> {
  if (!g.email) return [];
  const repo = getTriRepository();
  const cles = clesDossiersDe(g.email, await repo.binomes());
  const depuis = new Date(Date.now() - FENETRE_JOURS * 86_400_000).toISOString();
  return repo.journalPourCles(boite, depuis, [...cles]);
}
