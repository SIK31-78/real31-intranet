// Les boites de « Mes e-mails », SOURCE UNIQUE pour l'affichage, les actions (autorisation du
// « De : », PJ, classement) et la generation IA.
//
// - Boite perso : sa reception.
// - Boite PARTAGEE = la boite triee de MON agence (config MAIL_TRI_BOITES : syndic4 pour HLS,
//   syndic2 pour LGC et ASN ; V2 du 27/10/2026) ; un super-admin voit toutes les boites
//   triees. On n'y lit QUE les mails que le tri a ranges vers MES dossiers de binome
//   (gestionnaire ou assistant·e), d'apres son journal (decision Sekou du 13/10 : « que le
//   sous-dossier du binome, pas tous les mails »). Le journal marche en simulation (mail reste
//   en reception) comme en reel (mail deplace dans le dossier du binome) : on relit les mails
//   par leur internetMessageId, ou qu'ils soient. Jamais toute la boite commune.
// - Isolation (27/10/2026) : une action sur un mail d'une boite partagee exige que ce mail
//   soit distribue a l'un de MES binomes (mailDistribue) ; les actions de l'ecran combinent
//   ce controle avec estSuperAdmin (auth), qui en est exempte.

import { cache } from "react";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { construireBoites, type BoiteMail } from "@/lib/domain/boites-mail";
import { boitesTri } from "@/lib/domain/mail-gate";
import { clesDossiersDe, type EntreeJournalTri } from "@/lib/domain/tri-emails";
import { getTriRepository } from "@/lib/adapters/router";
import { boiteDe } from "@/lib/services/tri-emails/acces";

/** Fenetre du journal relue : les rangements des 45 derniers jours. */
const FENETRE_JOURS = 45;

/**
 * Ma boite perso, puis la boite triee de mon agence (aucune si mon agence n'a pas de boite).
 * `superAdmin` (calcule par l'appelant, auth) : toutes les boites triees. La boite fictive
 * « echantillon » n'est jamais une boite a lire (construireBoites l'ecarte).
 */
export async function boitesVisibles(
  g: Pick<Gestionnaire, "email" | "agencyId">,
  opts: { superAdmin?: boolean; sansBoitePerso?: boolean } = {},
): Promise<BoiteMail[]> {
  const partagees = opts.superAdmin ? boitesTri() : [await boiteDe(g)].filter((b) => b !== null);
  // Incarnation (« Changer de gestionnaire ») : jamais la boite perso de la personne incarnee
  // (decision du 27/10/2026), seulement les boites partagees.
  return construireBoites(g.email, partagees.map((b) => b.boite).join(",")).filter((b) => !(opts.sansBoitePerso && b.personnelle)).map((b) =>
    b.personnelle ? b : { ...b, libelle: `${b.libelle} · mes mails` },
  );
}

/**
 * Les mails que le tri a distribues a mes binomes dans cette boite : internetMessageId ->
 * reference de la copro choisie au tri (null = rangé sans copro). Le plus recent rangement
 * l'emporte. Corbeille, Comptabilite, Divers et dossiers des autres binomes sont exclus.
 */
export async function distributionDe(g: Pick<Gestionnaire, "email">, boite: string): Promise<Map<string, string | null>> {
  return distributionEnCache(g.email?.trim().toLowerCase() ?? "", boite.trim().toLowerCase());
}

/**
 * Lu UNE fois par requete serveur (React `cache`, cles primitives) : l'ecran et ses actions
 * demandent la distribution plusieurs fois (garde de chaque action, lecture de la boite), le
 * journal n'est relu qu'une fois.
 */
const distributionEnCache = cache(async (email: string, boite: string): Promise<Map<string, string | null>> => {
  const out = new Map<string, string | null>();
  for (const e of await rangementsDeMesBinomes({ email }, boite)) {
    if (!out.has(e.internetMessageId)) out.set(e.internetMessageId, e.coproReference);
  }
  return out;
});

/**
 * Ce mail de la boite partagee est-il distribue a l'un de mes binomes ? Le controle d'acces
 * des actions de « E-mails » (isolation par binome, 27/10/2026) : un identifiant de mail d'un
 * autre binome, meme dans la boite de mon agence, est refuse.
 */
export async function mailDistribue(g: Pick<Gestionnaire, "email">, boite: string, internetMessageId: string): Promise<boolean> {
  if (!g.email || !internetMessageId) return false;
  return (await distributionDe(g, boite)).has(internetMessageId);
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
