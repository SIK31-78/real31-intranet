// Service : les BROUILLONS de la boîte perso dans E-mails (vue « Brouillons », 02/11/2026).
// Lister, lire, envoyer tel quel, mettre à la corbeille. Un brouillon sur lequel on agit est
// toujours un brouillon que la liste montre : un id Graph pris ailleurs (un mail reçu, un
// envoyé, un brouillon d'une autre boîte) est refusé sans rien lire ni écrire. La garde de la
// boîte (la mienne, pas une boîte partagée ni celle d'un titulaire) est faite dans l'action.
// Boîte partagée : pas de vue, faute de savoir qui a créé un brouillon (Graph ne le dit pas,
// et le journal de l'intranet ne le note pas encore).

import { getMailboxProvider, getMailOutboundProvider, getRechercheMail } from "@/lib/adapters/router";
import type { EchangeTrouve } from "@/lib/domain/echanges";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { nettoyerHtmlMail } from "@/lib/domain/mes-emails-html";
import { brouillonModifiable, decouperCorpsBrouillon, recomposerCorpsBrouillon, type BrouillonEdition } from "@/lib/domain/brouillon-edition";
import { getSignatureGestionnaire } from "./get-signature";
import { brouillonPossible, envoiDirectComposition } from "./composer-mail";
import { DUREE_JETON_MS, scellerJeton } from "./jeton-envoi";

export type { BrouillonEdition };

/** Combien de brouillons l'écran montre : les plus récemment modifiés. */
export const BROUILLONS_AFFICHES = 30;

export function listerBrouillons(boite: string): Promise<EchangeTrouve[]> {
  return getRechercheMail().brouillons({ boite, max: BROUILLONS_AFFICHES });
}

/** Un brouillon que la liste montre, par son id Graph, ou null. */
export async function brouillonVisible(boite: string, id: string): Promise<EchangeTrouve | null> {
  return (await listerBrouillons(boite)).find((b) => b.id === id) ?? null;
}

/** Le texte d'un brouillon de la liste ; null s'il n'y est pas. */
export async function lireBrouillon(boite: string, id: string): Promise<string | null> {
  if (!(await brouillonVisible(boite, id))) return null;
  return getRechercheMail().lireCorps({ boite, id });
}

/** Envoie un brouillon de la liste tel qu'il est (destinataires, pièces jointes, signature). */
export async function envoyerBrouillonDeLaListe(boite: string, id: string): Promise<EchangeTrouve | null> {
  const b = await brouillonVisible(boite, id);
  if (!b) return null;
  await getMailOutboundProvider().envoyerBrouillon({ boite, id: b.id });
  return b;
}

// --- Rouvrir un brouillon dans l'éditeur riche (02/11/2026, décision Sekou, option a) -------
// Lecture : destinataires (Cci compris), objet, la partie écrite du corps (nettoyée), les pièces
// jointes. Enregistrement : le brouillon est RELU ici (jamais le corps d'origine venu du
// navigateur), seule la partie écrite est remplacée ; signature et historique restent tels
// quels, la signature n'est ajoutée que si le brouillon n'en a pas (domain/brouillon-edition).
// Puis le même chemin qu'un mail neuf : jeton « neuf » (marqué existant), dépôt des fichiers
// par tranches, finaliserComposition qui envoie ou laisse le brouillon.
// 02/11/2026 (décision Sekou) : un brouillon dont la signature a été posée dans Outlook
// (retrouvée seulement par son texte) n'est ni rouvert ni réécrit : SIGNATURE_OUTLOOK, il se
// finit dans Outlook pour ne pas perdre sa mise en page.

/** Le brouillon a une signature posée dans Outlook : il ne passe pas par l'éditeur. */
export const SIGNATURE_OUTLOOK = "signature-outlook" as const;

/** « Modifier » est-il possible ? null si le brouillon n'est pas dans la liste (ou plus un brouillon). */
export async function brouillonEstModifiable(g: Gestionnaire, boite: string, id: string): Promise<boolean | null> {
  if (!(await brouillonVisible(boite, id))) return null;
  const lu = await getRechercheMail().lireBrouillonComplet({ boite, id });
  if (!lu) return null;
  return brouillonModifiable(decouperCorpsBrouillon(lu.html, await getSignatureGestionnaire(g)));
}

/** Le brouillon rouvert pour l'éditeur ; null s'il n'est pas dans la liste (ou plus un brouillon). */
export async function ouvrirBrouillonPourEdition(g: Gestionnaire, boite: string, id: string): Promise<BrouillonEdition | typeof SIGNATURE_OUTLOOK | null> {
  if (!(await brouillonVisible(boite, id))) return null;
  const lu = await getRechercheMail().lireBrouillonComplet({ boite, id });
  if (!lu) return null;
  const signatureHtml = await getSignatureGestionnaire(g);
  const d = decouperCorpsBrouillon(lu.html, signatureHtml);
  if (!brouillonModifiable(d)) return SIGNATURE_OUTLOOK;
  return {
    boite,
    id,
    objet: lu.objet,
    a: lu.a,
    cc: lu.cc,
    cci: lu.cci,
    corpsHtml: nettoyerHtmlMail(d.editable),
    signature: d.signature,
    signatureAjoutee: d.signature === "absente" && Boolean(signatureHtml),
    citation: d.citation,
    pieces: lu.pieces,
  };
}

export interface DemandeEditionBrouillon {
  id: string;
  objet: string;
  a: string[];
  cc: string[];
  cci: string[];
  /** La partie écrite, déjà nettoyée et habillée (corpsMisEnForme). */
  corpsHtml: string;
  /** Pièces d'origine à retirer : seulement des pièces du brouillon relu, les autres sont ignorées. */
  retirer: string[];
  /** « Enregistrer » : le brouillon est mis à jour sans partir. */
  brouillonSeul: boolean;
}

export interface PreparationEdition {
  /** Aucune boîte branchée : rien n'est écrit. */
  simulation: boolean;
  /** Le jeton du brouillon pour déposer les fichiers ajoutés puis finaliser. */
  jeton?: string;
  /** Il partira à la finalisation. */
  envoi?: boolean;
}

/**
 * Met à jour le brouillon (objet, destinataires, corps recomposé, pièces retirées) et rend le
 * jeton de la suite ; null s'il n'est plus dans la liste, SIGNATURE_OUTLOOK (rien n'est écrit) si
 * sa signature a été posée dans Outlook. Boîte perso : le mode « envoyer » suit
 * la même règle que le nouveau mail depuis la boîte perso (envoiDirectComposition).
 */
export async function preparerEditionBrouillon(
  g: Gestionnaire,
  boite: string,
  d: DemandeEditionBrouillon,
): Promise<PreparationEdition | typeof SIGNATURE_OUTLOOK | null> {
  if (!(await brouillonVisible(boite, d.id))) return null;
  const expediteur = { boite, personnelle: true };
  if (!brouillonPossible(expediteur)) return { simulation: true };
  const lu = await getRechercheMail().lireBrouillonComplet({ boite, id: d.id });
  if (!lu) return null;
  const signatureHtml = await getSignatureGestionnaire(g);
  const decoupe = decouperCorpsBrouillon(lu.html, signatureHtml);
  if (!brouillonModifiable(decoupe)) return SIGNATURE_OUTLOOK;
  const corps = recomposerCorpsBrouillon(decoupe, d.corpsHtml, signatureHtml);
  const outbound = getMailOutboundProvider();
  await outbound.majBrouillon({ boite, id: d.id, sujet: d.objet, a: d.a, cc: d.cc, cci: d.cci, corpsHtml: corps });
  const pieces = new Set(lu.pieces.map((p) => p.id));
  for (const pieceId of new Set(d.retirer)) {
    if (pieces.has(pieceId)) await outbound.retirerPieceJointe({ boite, draftId: d.id, pieceId });
  }
  const mode = !d.brouillonSeul && envoiDirectComposition(expediteur) ? "envoyer" : "brouillon";
  const jeton = scellerJeton({ nature: "neuf", boite, draftId: d.id, gid: g.id, mode, lot: 0, lots: 1, existant: true, exp: Date.now() + DUREE_JETON_MS });
  return { simulation: false, jeton, envoi: mode === "envoyer" };
}

/**
 * Met un brouillon de la liste à la corbeille : « Éléments supprimés » d'Outlook, réversible,
 * jamais une suppression définitive (même chemin que la corbeille de la liste, REA-340).
 */
export async function brouillonALaCorbeille(boite: string, id: string): Promise<boolean | null> {
  const b = await brouillonVisible(boite, id);
  if (!b) return null;
  const r = await getMailboxProvider().mettreALaCorbeille({ boite, internetMessageIds: [b.internetMessageId] });
  return r.deplaces.length > 0;
}
