"use server";

// Vue « Brouillons » de l'écran E-mails (02/11/2026) : les brouillons de MA boîte perso, à
// relire, envoyer tels quels ou mettre à la corbeille (réversible). Fichier à part de
// actions.ts, comme la boîte d'équipe.
//
// Gardes : module mail ouvert à la personne ; la boîte demandée est l'une des siennes ET sa
// boîte perso (natureBoite « mienne ») : ni une boîte partagée (on ne sait pas qui y a créé un
// brouillon), ni la boîte d'un titulaire ouverte par délégation (on y traite, on ne vide pas
// ses brouillons), comme la corbeille. Un brouillon visé doit être dans la liste relue côté
// serveur (services/mes-emails/brouillons).

import { z } from "zod";
import { echec, echecDepuis, type Res } from "@/lib/actions/resultat";
import { getGestionnaireCourant, mailModuleActifPour } from "@/lib/auth/session";
import type { EchangeTrouve } from "@/lib/domain/echanges";
import { brouillonALaCorbeille, envoyerBrouillonDeLaListe, lireBrouillon, listerBrouillons } from "@/lib/services/mes-emails/brouillons";
import { boiteCible, natureBoite } from "./gardes-boites";

const zBoite = z.string().trim().min(1).max(320);
const zId = z.string().trim().min(1).max(600);

const INDISPONIBLE = "Le module e-mails n'est pas disponible.";
const REFUS_BOITE_BROUILLONS = "Les brouillons ne s'affichent que pour votre boîte personnelle.";
const BROUILLON_ABSENT = "Ce brouillon n'est plus dans vos brouillons.";

/** Ma boîte perso, si c'est bien elle qui est demandée ; sinon le refus à rendre. */
async function maBoitePerso(boite: string): Promise<{ boite: string } | { ok: false; erreur: string }> {
  const g = await getGestionnaireCourant();
  if (!g?.email || !mailModuleActifPour(g.email)) return echec(INDISPONIBLE);
  const cible = await boiteCible(g, boite);
  if (!cible || (await natureBoite(g, cible)) !== "mienne") return echec(REFUS_BOITE_BROUILLONS);
  return { boite: cible };
}

export async function chargerBrouillonsAction(input: unknown): Promise<Res<EchangeTrouve[]>> {
  const v = z.object({ boite: zBoite }).safeParse(input);
  if (!v.success) return echec("Boîte invalide.");
  const b = await maBoitePerso(v.data.boite);
  if ("ok" in b) return b;
  try {
    return { ok: true, donnees: await listerBrouillons(b.boite) };
  } catch (e) {
    return echecDepuis(e, "mes-emails");
  }
}

export async function lireBrouillonAction(input: unknown): Promise<Res<string>> {
  const v = z.object({ boite: zBoite, id: zId }).safeParse(input);
  if (!v.success) return echec("Brouillon invalide.");
  const b = await maBoitePerso(v.data.boite);
  if ("ok" in b) return b;
  try {
    const texte = await lireBrouillon(b.boite, v.data.id);
    return texte === null ? echec(BROUILLON_ABSENT) : { ok: true, donnees: texte };
  } catch (e) {
    return echecDepuis(e, "mes-emails");
  }
}

/** Envoie le brouillon tel qu'il est dans Outlook (la boîte perso envoie, comme une réponse). */
export async function envoyerBrouillonAction(input: unknown): Promise<Res<{ objet: string }>> {
  const v = z.object({ boite: zBoite, id: zId }).safeParse(input);
  if (!v.success) return echec("Brouillon invalide.");
  const b = await maBoitePerso(v.data.boite);
  if ("ok" in b) return b;
  try {
    const parti = await envoyerBrouillonDeLaListe(b.boite, v.data.id);
    return parti ? { ok: true, donnees: { objet: parti.objet } } : echec(BROUILLON_ABSENT);
  } catch (e) {
    return echecDepuis(e, "mes-emails");
  }
}

/** Met le brouillon dans « Éléments supprimés » (réversible dans Outlook), jamais plus loin. */
export async function supprimerBrouillonAction(input: unknown): Promise<Res> {
  const v = z.object({ boite: zBoite, id: zId }).safeParse(input);
  if (!v.success) return echec("Brouillon invalide.");
  const b = await maBoitePerso(v.data.boite);
  if ("ok" in b) return b;
  try {
    const r = await brouillonALaCorbeille(b.boite, v.data.id);
    if (r === null) return echec(BROUILLON_ABSENT);
    return r ? { ok: true } : echec("Le brouillon n'a pas pu être déplacé dans les éléments supprimés.");
  } catch (e) {
    return echecDepuis(e, "mes-emails");
  }
}
