"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  saisirChampOdj,
  retirerPointOdj,
} from "@/lib/services/odj/saisir-champ-odj";
import { cloturerOdj } from "@/lib/services/odj/cloturer-odj";
import { peutEcrireSurCopro } from "@/lib/services/coproprietes/copro-appartient";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { getOdjRepository } from "@/lib/adapters/router";
import { parseCloture } from "@/lib/domain/odj";
import { CLE_CLOTURE_ODJ } from "@/lib/ports/odj-repository";
import { decouperIdOdj, resoudreCleOdj } from "@/lib/services/odj/resoudre-cle-odj";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";

const zId = z.string().trim().min(1).max(160);
const zChampId = z.string().trim().min(1).max(120);
const zValeur = z.string().max(20_000);

// La date d'AG n'est PLUS deduite de l'id seul : un id sans "__" repliait ici sur la
// sentinelle 0001-01-01 alors que la lecture repliait sur la prochaine AG de la copro
// -> tout ce qui etait saisi depuis /odj/S273 partait sur une ligne jamais relue.
// Une seule resolution pour les deux cotes : resoudre-cle-odj.

/**
 * Gestionnaire courant s'il est autorise a ECRIRE sur cette copro, sinon null.
 *
 * CE VERROU NE BOUGE PAS. Depuis 2026-09-04 la LECTURE de l'ODJ est ouverte a l'equipe
 * (un collegue consulte le CR de CS prepare par le gestionnaire, cf. page.tsx) : l'ecran
 * s'affiche donc pour des gens qui n'ont pas le droit d'y toucher, et c'est ici - cote
 * serveur - que ca se refuse. Retirer les champs editables a l'affichage ne protege de
 * rien : un client peut rejouer l'action. La regle est partagee avec l'affichage
 * (peutEcrireSurCopro) pour que les deux ne puissent pas diverger.
 */
async function autorise(code: string): Promise<Gestionnaire | null> {
  const g = await getGestionnaireCourant();
  if (!g) return null;
  return (await peutEcrireSurCopro(code, g.id)) ? g : null;
}

/** L'ODJ est-il cloture ? Verrou SERVEUR : retirer `editable` a l'affichage ne protege
 *  de rien (un client peut rejouer l'action). Un ODJ clos n'accepte plus aucune ecriture,
 *  hormis sa propre reouverture.
 *  `agDate` DOIT venir de resoudreCleOdj : lu sur la mauvaise ligne, le verrou regarderait
 *  un etat vide et laisserait modifier un ODJ pourtant clos. */
async function estCloture(code: string, agDate: string): Promise<boolean> {
  const etat = await getOdjRepository().getEtat(code, agDate);
  return Boolean(parseCloture(etat.find((e) => e.champId === CLE_CLOTURE_ODJ)?.valeur));
}

export async function saisirChampAction(id: string, champId: string, valeur: string): Promise<void> {
  if (!z.object({ id: zId, champId: zChampId, valeur: zValeur }).safeParse({ id, champId, valeur }).success) return;
  // La cle de cloture n'est PAS un champ : elle ne passe que par cloturerOdjAction.
  if (champId === CLE_CLOTURE_ODJ) return;
  const { code } = decouperIdOdj(id);
  const g = await autorise(code);
  if (!g) return;
  const { agDate } = await resoudreCleOdj(id, g.id);
  if (await estCloture(code, agDate)) return;
  await saisirChampOdj(code, agDate, champId, valeur, g.initiales, g.id);
  revalidatePath(`/odj/${id}`);
}

export async function togglePointAction(id: string, pointId: string, retire: boolean): Promise<void> {
  if (!z.object({ id: zId, pointId: zChampId, retire: z.boolean() }).safeParse({ id, pointId, retire }).success) return;
  const { code } = decouperIdOdj(id);
  const g = await autorise(code);
  if (!g) return;
  const { agDate } = await resoudreCleOdj(id, g.id);
  if (await estCloture(code, agDate)) return;
  await retirerPointOdj(code, agDate, pointId, retire, g.initiales, g.id);
  revalidatePath(`/odj/${id}`);
}

/** Clot ("reunion terminee") ou rouvre l'ODJ. Reversible : aucune ecriture externe n'est
 *  engagee par la cloture (ni PDF, ni depot eStale) - cf. cloturer-odj.ts. */
export async function cloturerOdjAction(id: string, clore: boolean): Promise<void> {
  if (!z.object({ id: zId, clore: z.boolean() }).safeParse({ id, clore }).success) return;
  const { code } = decouperIdOdj(id);
  const g = await autorise(code);
  if (!g) return;
  const { agDate } = await resoudreCleOdj(id, g.id);
  await cloturerOdj({
    coproCode: code,
    agDateISO: agDate,
    clore,
    initiales: g.initiales,
    managerId: g.id,
    maintenantISO: new Date().toISOString(),
  });
  revalidatePath(`/odj/${id}`);
}
