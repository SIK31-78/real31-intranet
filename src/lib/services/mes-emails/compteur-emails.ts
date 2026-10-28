// Pastille rouge de l'entrée « E-mails » de la barre latérale (demande de Sekou du 27/10/2026) :
// le total des mails à traiter non lus de mes boîtes. Même contrainte que la pastille du tri
// (services/tri-emails/compteur) : la barre latérale s'affiche sur TOUTES les pages et ne doit
// jamais les ralentir. Gardé une minute par personne, abandonné au-delà de 1,5 s (pas de
// pastille plutôt qu'une page lente). Règle de calcul pure : `pastilleEmails` (domaine).
//
// Ce que ça coûte, et pourquoi :
// - Boîte perso : UN appel Graph léger (`lireEtatsLu`, id + isRead des 40 plus récents de la
//   réception, sans corps). Choisi plutôt que `mailFolders/inbox?$select=unreadItemCount`
//   (un appel aussi) pour coller à l'écran : l'onglet « Ma boîte » compte les non lus des 40
//   mails qu'il affiche ; le total d'Outlook compterait aussi des non lus très anciens que
//   l'écran ne montre pas, et la pastille dirait 57 quand l'onglet dit 18.
// - Boîtes partagées : Supabase seulement (journal du tri, statut commun, lu de l'intranet),
//   aucune relecture des boîtes. Le lu d'Outlook n'y est pas : un mail lu seulement dans
//   Outlook compte encore dans la pastille (dit dans `pastilleEmails`).
// - En incarnation : aucune boîte perso, comme l'écran (`sansBoitePerso`).

import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { pastilleEmails, type ComptePartagee } from "@/lib/domain/mes-emails-liste";
import { getMailboxProvider, getMesEmailsEtatRepository } from "@/lib/adapters/router";
import { boitesVisibles, distributionDe } from "./boites-visibles";
import { MAX_PARTAGEE, MAX_PERSO } from "./lire-boites";
import { statutPartage, type StatutEcrit } from "./statut-partage";

const TTL_MS = 60_000;
const DELAI_MAX_MS = 1_500;

const cache = new Map<string, { valeur: number; expire: number }>();

/** `role` : la pastille d'un comptable compte le dossier « Comptabilité » des boîtes triées (28/10/2026). */
type Personne = Pick<Gestionnaire, "id" | "email" | "agencyId" | "role">;

/** Le compte, sans cache ni délai : toutes les boîtes en parallèle. */
async function compter(g: Personne, opts: { superAdmin: boolean; incarnation: boolean }): Promise<number> {
  const boites = await boitesVisibles(g, { superAdmin: opts.superAdmin, sansBoitePerso: opts.incarnation });
  const etats = getMesEmailsEtatRepository();
  const [persos, partagees] = await Promise.all([
    Promise.all(boites.filter((b) => b.personnelle).map((b) => getMailboxProvider().lireEtatsLu({ boite: b.adresse, recents: MAX_PERSO }))),
    Promise.all(
      boites
        .filter((b) => !b.personnelle)
        .map(async (b): Promise<ComptePartagee> => {
          const distribues = [...(await distributionDe(g, b.adresse)).keys()].slice(0, MAX_PARTAGEE);
          if (distribues.length === 0) return { distribues, traites: new Set(), lusIntranet: new Set() };
          const [statuts, miens] = await Promise.all([etats.getStatutsDesMails(distribues), etats.getEtats(g.id, distribues)]);
          const parMail = new Map<string, StatutEcrit[]>();
          for (const l of statuts) parMail.set(l.emailId, [...(parMail.get(l.emailId) ?? []), l]);
          const traites = new Set(distribues.filter((id) => statutPartage(b.adresse, parMail.get(id) ?? [])?.statut === "classe"));
          return { distribues, traites, lusIntranet: new Set(miens.filter((e) => e.lu).map((e) => e.emailId)) };
        }),
    ),
  ]);
  return pastilleEmails(persos, partagees, MAX_PARTAGEE);
}

const cle = (g: Personne, incarnation: boolean) => `${g.id}|${incarnation ? "incarne" : "moi"}`;

/**
 * Le nombre de la pastille, ou null (rien à afficher : délai dépassé, panne). `superAdmin` et
 * `incarnation` viennent de l'appelant (auth), que les services n'importent pas.
 */
export async function compterMailsATraiter(g: Personne, opts: { superAdmin: boolean; incarnation: boolean }): Promise<number | null> {
  const k = cle(g, opts.incarnation);
  const deja = cache.get(k);
  if (deja && Date.now() < deja.expire) return deja.valeur;
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  try {
    const valeur = await Promise.race([
      compter(g, opts),
      new Promise<never>((_, rejeter) => {
        minuterie = setTimeout(() => rejeter(new Error("delai depasse")), DELAI_MAX_MS);
      }),
    ]);
    cache.set(k, { valeur, expire: Date.now() + TTL_MS });
    return valeur;
  } catch {
    return null;
  } finally {
    clearTimeout(minuterie);
  }
}

/**
 * Après « Marquer traité », un archivage ou une lecture : la pastille de cette personne suit
 * tout de suite. Celle des collègues de la boîte partagée suit à l'expiration (une minute).
 */
export function oublierCompteurEmails(gid: string): void {
  for (const k of [...cache.keys()]) if (k.startsWith(`${gid}|`)) cache.delete(k);
}
