// Adapter COUCHE TEXTE UNIQUEMENT du port ExtractionComptaProvider (decision Sekou :
// « enlever la partie IA sur le grand livre, garder texte, sinon trop lourd »).
//
// Le flux de reprise COMPTA lit UNIQUEMENT la couche texte des PDF NATIFS exportes par
// l'ancien syndic : pdfjs rend le texte deja positionne, parserGrandLivrePositions reconstruit
// les colonnes de facon DETERMINISTE (zero reseau, zero IA, ~2 s). C'est le cas reel (les
// syndics exportent un PDF natif). AUCUN fallback OCR/IA : si la couche texte n'est pas
// exploitable (PDF scanne, pdfjs KO, 0 ecriture), on renvoie une ERREUR EXPLICITE et actionnable
// plutot que de basculer sur un pipeline OCR/IA lourd, lent et imprevisible.
//
// Les anciens adapters IA du flux compta ont ete SUPPRIMES du repo lors de la refonte
// "entree par fichiers Excel" (git garde l'historique) : la couche texte est le seul chemin.

import type { DocumentSource } from "@/lib/reprise/ports/document-source";
import type { ExtractionComptaProvider } from "@/lib/reprise/ports/extraction-compta-provider";
import type { JeuEcritures } from "@/lib/reprise/domain/ecriture";
import type { JeuRgd } from "@/lib/reprise/domain/rgd";
import { verifierEquilibreGrandLivre } from "@/lib/reprise/domain/ecriture";
import { verifierTotauxParCompte } from "@/lib/reprise/domain/controle-comptes";
import { normaliserGrandLivre } from "@/lib/reprise/adapters/shared/normaliser-compta";
import { extraireTextePages, estPdfNatif, type PageTexte } from "@/lib/reprise/adapters/shared/pdf-texte";
import { parserGrandLivrePositions } from "@/lib/reprise/adapters/shared/parseur-grand-livre-positions";
import {
  detecterFormatColonnesDroite,
  parserGrandLivreColonnesDroite,
} from "@/lib/reprise/adapters/shared/parseur-grand-livre-colonnes-droite";
import { parserRgd } from "@/lib/reprise/adapters/shared/parseur-rgd";

/**
 * Message d'erreur unique quand la couche texte n'est pas exploitable. Actionnable : dit
 * exactement quoi redemander a l'ancien syndic (le PDF NATIF, pas un scan). Expose pour que les
 * tests et les deux flux consommateurs (mapping-compta, dossier unifie) partagent le meme libelle.
 */
export const MESSAGE_ERREUR_COUCHE_TEXTE =
  "Ce PDF ne porte pas de couche texte exploitable (scan ?). La reprise compta exige le grand livre PDF NATIF exporte par l'ancien syndic - redemande le fichier d'origine, pas un scan.";

/** Lit la couche texte de tous les documents, ou leve l'erreur actionnable commune. */
async function lireCoucheTexte(docs: DocumentSource[]): Promise<PageTexte[]> {
  const pages: PageTexte[] = [];
  for (const d of docs) {
    let p: PageTexte[];
    try {
      p = await extraireTextePages(d.contenu);
    } catch {
      // pdfjs KO (PDF corrompu / illisible) : aucun fallback, erreur explicite.
      throw new Error(MESSAGE_ERREUR_COUCHE_TEXTE);
    }
    // Un scan (page = image) n'a quasiment aucun item de texte -> couche texte inexploitable.
    if (!estPdfNatif(p)) throw new Error(MESSAGE_ERREUR_COUCHE_TEXTE);
    pages.push(...p);
  }
  if (pages.length === 0) throw new Error(MESSAGE_ERREUR_COUCHE_TEXTE);
  return pages;
}

export class CoucheTexteComptaExtractionProvider implements ExtractionComptaProvider {
  async extraireGrandLivre(docs: DocumentSource[]): Promise<JeuEcritures> {
    const pages = await lireCoucheTexte(docs);

    // Deux mises en page connues, choisies par les EN-TETES IMPRIMES du document :
    //   - "colonnes a droite" (C.J | Date de valeur | ... | Solde "AGE") : montants identifies
    //     par le x1 de leur dernier token, avec journal d'anomalies (format S0304) ;
    //   - sinon le parseur positions (centres des en-tetes Debit/Credit, format Matera).
    const parse = detecterFormatColonnesDroite(pages)
      ? parserGrandLivreColonnesDroite(pages)
      : parserGrandLivrePositions(pages);
    // 0 ecriture parsee = couche texte presente mais illisible par le parseur (mise en page
    // non reconnue) : sans fallback IA, on prefere l'erreur explicite au silence.
    if (parse.lignes.length === 0) throw new Error(MESSAGE_ERREUR_COUCHE_TEXTE);

    const jeu = normaliserGrandLivre({ lignes: parse.lignes, notes: parse.notes });
    jeu.controles = parse.controles;
    // Intitules d'en-tete de compte (noms) captures par le parseur positionne -> exposes pour
    // l'appariement par nom du mapping (reprise). PII : jamais logue, reste dans la structure.
    if (parse.intitules) jeu.intitules = parse.intitules;
    // Journal d'anomalies du parseur colonnes a droite (lignes A MONTANT non reconnues) :
    // compte pour l'auto-check n.1 ("lignes non reconnues = 0, sur chaque source").
    if ("anomalies" in parse && Array.isArray(parse.anomalies) && parse.anomalies.length > 0) {
      jeu.nonReconnues = (jeu.nonReconnues ?? 0) + parse.anomalies.length;
    }

    // Filets de verification DETERMINISTES (aucun reseau) : equilibre global + totaux par compte.
    // Un desequilibre n'est PAS une erreur bloquante ici (la comptable valide la balance par
    // compte en aval, cf. balanceParCompte) : on le remonte en note, le grand livre reste exploite.
    const equ = verifierEquilibreGrandLivre(jeu.lignes);
    const controle = verifierTotauxParCompte(jeu.lignes, parse.controles);
    jeu.notes.push(
      `Controle par compte : ${controle.nbComptesControles} controle(s), ${controle.nbEnEcart} en ecart.`,
    );
    jeu.notes.push(
      `Pipeline COUCHE TEXTE (PDF natif, positions) : ${jeu.lignes.length} ecriture(s), equilibre global ecart ${equ.ecart}.`,
    );
    return jeu;
  }

  async extraireRgd(docs: DocumentSource[]): Promise<JeuRgd> {
    const pages = await lireCoucheTexte(docs);
    // parserRgd choisit le format (Matera / Foncia) d'apres les en-tetes imprimes et leve
    // une erreur explicite si aucun n'est reconnu - jamais un jeu vide silencieux.
    const parse = parserRgd(pages);
    if (parse.lignes.length === 0) {
      throw new Error(
        "RGD reconnu mais aucune ligne de depense extraite : document vide ou mise en page inattendue - a diagnostiquer avant de continuer (jeu vide = echec, jamais succes).",
      );
    }
    const notes = [...parse.notes];
    const enEcart = parse.controles.filter((c) => Math.abs(c.ecart) >= 0.005);
    for (const c of enEcart) {
      notes.push(
        `RGD : total imprime ${c.niveau} ${c.code} en ecart de ${c.ecart.toFixed(2)} (imprime ${c.ttcImprime.toFixed(2)} / calcule ${c.ttcCalcule.toFixed(2)}).`,
      );
    }
    return { lignes: parse.lignes, notes, nonReconnues: parse.anomalies.length };
  }
}
