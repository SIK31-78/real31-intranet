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
//
// « Modifier » (02/11/2026, décision Sekou, option a) : le brouillon se rouvre dans l'éditeur
// riche, mêmes gardes ; l'enregistrement relit le brouillon côté serveur et ne remplace que la
// partie écrite (signature et historique gardés, jamais de signature en double).

import { z } from "zod";
import { echec, echecDepuis, type Res } from "@/lib/actions/resultat";
import { getGestionnaireCourant, mailModuleActifPour } from "@/lib/auth/session";
import type { EchangeTrouve } from "@/lib/domain/echanges";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { ADRESSE_MAIL } from "@/lib/domain/mes-emails-composition";
import { NB_MAX_FICHIERS, TAILLE_MAX_FICHIER, TAILLE_MAX_TOTALE } from "@/lib/domain/piece-jointe-flux";
import { corpsMisEnForme } from "@/lib/services/mes-emails/corps-mis-en-forme";
import {
  brouillonALaCorbeille,
  envoyerBrouillonDeLaListe,
  lireBrouillon,
  listerBrouillons,
  ouvrirBrouillonPourEdition,
  preparerEditionBrouillon,
  type BrouillonEdition,
  type PreparationEdition,
} from "@/lib/services/mes-emails/brouillons";
import { boiteCible, natureBoite } from "./gardes-boites";

const zBoite = z.string().trim().min(1).max(320);
const zId = z.string().trim().min(1).max(600);

const INDISPONIBLE = "Le module e-mails n'est pas disponible.";
const REFUS_BOITE_BROUILLONS = "Les brouillons ne s'affichent que pour votre boîte personnelle.";
const BROUILLON_ABSENT = "Ce brouillon n'est plus dans vos brouillons.";

/** Ma boîte perso, si c'est bien elle qui est demandée ; sinon le refus à rendre. */
async function maBoitePerso(boite: string): Promise<{ boite: string; g: Gestionnaire } | { ok: false; erreur: string }> {
  const g = await getGestionnaireCourant();
  if (!g?.email || !mailModuleActifPour(g.email)) return echec(INDISPONIBLE);
  const cible = await boiteCible(g, boite);
  if (!cible || (await natureBoite(g, cible)) !== "mienne") return echec(REFUS_BOITE_BROUILLONS);
  return { boite: cible, g };
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

/** « Modifier » : le brouillon rouvert pour l'éditeur riche (destinataires, objet, texte, pièces). */
export async function ouvrirBrouillonEditionAction(input: unknown): Promise<Res<BrouillonEdition>> {
  const v = z.object({ boite: zBoite, id: zId }).safeParse(input);
  if (!v.success) return echec("Brouillon invalide.");
  const b = await maBoitePerso(v.data.boite);
  if ("ok" in b) return b;
  try {
    const e = await ouvrirBrouillonPourEdition(b.g, b.boite, v.data.id);
    return e ? { ok: true, donnees: e } : echec(BROUILLON_ABSENT);
  } catch (e) {
    return echecDepuis(e, "mes-emails");
  }
}

const zAdresses = z.array(z.string().trim().max(320).regex(ADRESSE_MAIL)).max(200);

/**
 * « Enregistrer » ou « Envoyer » un brouillon rouvert, premier temps : le brouillon est mis à
 * jour dans Outlook (objet, destinataires, texte, pièces retirées) et un jeton rendu ; les
 * fichiers ajoutés se déposent ensuite par la route de dépôt, puis finaliserCompositionAction
 * envoie (ou laisse le brouillon). Le texte mis en forme est renettoyé ici.
 */
export async function preparerEditionBrouillonAction(input: unknown): Promise<Res<PreparationEdition>> {
  const v = z
    .object({
      boite: zBoite,
      id: zId,
      objet: z.string().trim().max(500),
      a: zAdresses,
      cc: zAdresses,
      cci: zAdresses,
      corpsHtml: z.string(),
      retirer: z.array(zId).max(50).default([]),
      fichiers: z
        .array(z.object({ nom: z.string().trim().min(1).max(255), taille: z.number().int().min(1).max(TAILLE_MAX_FICHIER) }))
        .max(NB_MAX_FICHIERS)
        .default([]),
      brouillon: z.boolean().default(false),
    })
    .safeParse(input);
  if (!v.success) return echec("Une adresse est invalide, ou le brouillon est illisible.");
  const d = v.data;
  if (!d.brouillon && !d.a.length && !d.cc.length && !d.cci.length) return echec("Il manque un destinataire.");
  if (!d.brouillon && !d.objet) return echec("Il manque l'objet du mail.");
  if (d.fichiers.reduce((t, f) => t + f.taille, 0) > TAILLE_MAX_TOTALE) {
    return echec("Pièces jointes trop lourdes : 25 Mo au total. Dépose les plus grosses sur SharePoint et envoie le lien.");
  }
  const b = await maBoitePerso(d.boite);
  if ("ok" in b) return b;
  // L'éditeur riche est celui des pilotes (ouvert à tous depuis le 21/10/2026, cf. page.tsx).
  const riche = corpsMisEnForme(true, d.corpsHtml || "<br>");
  if (riche === "refuse" || riche === null) return echec("Le message est trop long.");
  try {
    const p = await preparerEditionBrouillon(b.g, b.boite, {
      id: d.id,
      objet: d.objet,
      a: d.a,
      cc: d.cc,
      cci: d.cci,
      corpsHtml: riche.corpsHtml,
      retirer: d.retirer,
      brouillonSeul: d.brouillon,
    });
    return p ? { ok: true, donnees: p } : echec(BROUILLON_ABSENT);
  } catch (e) {
    return echecDepuis(e, "mes-emails");
  }
}
