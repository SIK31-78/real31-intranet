// Le contrat de syndic, rendu pour l'ecran ET pour l'impression A4.
//
// Remplace le classeur Excel que l'Office Script `ContratReplace` remplissait cote MYTHEC.
// Composant SERVEUR, aucun JS : le contenu vient du gabarit genere
// (domain/contrat/gabarit-contrat.ts) et les placeholders sont resolus a la volee.
//
// MISE EN PAGE : deux colonnes cote a cote, comme le contrat imprime aujourd'hui
// (reference : data/5 Contrat de Syndic-S234-*.pdf). Chaque colonne est un flux
// independant, c'est ainsi que le classeur est construit.
//
// LE NUMERO DE MANDAT EST VOLONTAIREMENT VIDE (Sekou, 11/09/2026). Le titre porte
// « CONTRAT DE SYNDIC "TOUT SAUF" N° » sans valeur : a ce stade le document part dans la
// CONVOCATION, le mandat n'est pas encore vote donc pas encore numerote. Le numero est
// appose a l'AG, a l'impression du mandat signe, et vient du registre des mandats (App A,
// module a fusionner). Ne pas « completer » ce trou : ce n'est pas un oubli.

import type React from "react";
import type { ChampsContrat } from "@/lib/domain/contrat/champs-contrat";
import {
  GABARIT_DROITE,
  GABARIT_GAUCHE,
  GABARIT_PLEINE_LARGEUR,
  type BlocGabarit,
} from "@/lib/domain/contrat/gabarit-contrat";
import { remplirTexte, tableRemplacement } from "@/lib/domain/contrat/remplir-gabarit";

/** Un titre de section : ligne courte, en capitales ou numerotee (« 2. DUREE DU CONTRAT »).
 *  Le classeur ne porte aucun style exploitable, on deduit de la forme du texte. */
function estTitre(texte: string): boolean {
  if (texte.includes("\n") || texte.length > 90) return false;
  if (/^\d+(\.\d+)*\.?\s/.test(texte)) return true;
  const lettres = texte.replace(/[^A-Za-zÀ-ÿ]/g, "");
  return lettres.length > 3 && lettres === lettres.toUpperCase();
}

/** Une cellule de montant : « 163.65 », « 163,65 € », « 1 234.00 ». */
function estMontant(texte: string): boolean {
  return /^[\d\s .,]+(€|EUR)?$/.test(texte.trim()) && /\d/.test(texte);
}

type OptionsRendu = { fraisPostauxReels?: boolean };

/** Une cellule d'en-tete de tableau : tout en capitales (« DETAIL DE LA PRESTATION »). */
function estEnTete(texte: string): boolean {
  const lettres = texte.replace(/[^A-Za-zÀ-ÿ]/g, "");
  return lettres.length > 3 && lettres === lettres.toUpperCase();
}

/**
 * Les lignes de grille consecutives du gabarit forment UN tableau (retour du test du 17/09 :
 * en lignes flex, les colonnes ne s'alignaient pas d'une ligne a l'autre et le PDF etait
 * illisible). Un tableau par serie de lignes au meme nombre de cellules ; les lignes tout en
 * capitales sont des en-tetes ; un montant s'aligne a droite ; une ligne ne se coupe pas
 * entre deux pages.
 */
function Tableau({ lignes, table, options }: { lignes: readonly (readonly string[])[]; table: Record<string, string>; options: OptionsRendu }) {
  const colonnes = lignes[0]!.length;
  // Deux colonnes : la prestation prend plus de place que sa tarification.
  const largeurs = colonnes === 2 ? ["58%", "42%"] : undefined;
  return (
    <table className="w-full table-fixed border-collapse my-1.5 text-[0.95em]">
      {largeurs && (
        <colgroup>
          {largeurs.map((l, i) => <col key={i} style={{ width: l }} />)}
        </colgroup>
      )}
      <tbody>
        {lignes.map((ligne, r) => {
          const cellules = ligne.map((c) => remplirTexte(c, table, options));
          const enTete = cellules.every(estEnTete);
          return (
            <tr key={r} className="break-inside-avoid align-top">
              {cellules.map((texte, i) =>
                enTete ? (
                  <th key={i} className="border border-line bg-green-50 text-green-800 px-1.5 py-1 text-left font-semibold whitespace-pre-line">
                    {texte}
                  </th>
                ) : (
                  <td key={i} className={`border border-line px-1.5 py-1 whitespace-pre-line ${estMontant(texte) ? "text-right tabular-nums whitespace-nowrap" : ""}`}>
                    {texte}
                  </td>
                ),
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Paragraphe({ texte }: { texte: string }) {
  if (estTitre(texte)) {
    return (
      <h2 className="mt-3 mb-1 px-1.5 py-1 bg-green-50 text-green-800 font-semibold break-inside-avoid">
        {texte}
      </h2>
    );
  }
  // `whitespace-pre-line` : le gabarit porte ses propres sauts de ligne, ils font partie
  // de la mise en page du contrat (adresses, listes d'horaires).
  return <p className="whitespace-pre-line mb-1.5 text-justify">{texte}</p>;
}

/** Une colonne du contrat : les paragraphes tels quels, les lignes de grille regroupees en tableaux. */
function Colonne({ blocs, table, options }: { blocs: readonly BlocGabarit[]; table: Record<string, string>; options: OptionsRendu }) {
  const rendu: React.ReactNode[] = [];
  let serie: (readonly string[])[] = [];
  const vider = (cle: string) => {
    if (serie.length > 0) rendu.push(<Tableau key={cle} lignes={serie} table={table} options={options} />);
    serie = [];
  };
  blocs.forEach((bloc, i) => {
    if (typeof bloc === "string") {
      vider(`t${i}`);
      rendu.push(<Paragraphe key={i} texte={remplirTexte(bloc, table, options)} />);
    } else {
      // Un nombre de cellules different = un autre tableau (2 colonnes puis 3).
      if (serie.length > 0 && serie[0]!.length !== bloc.length) vider(`t${i}`);
      serie.push(bloc);
    }
  });
  vider("fin");
  return <div>{rendu}</div>;
}

export function DocumentContrat({ champs }: { champs: ChampsContrat }) {
  const table = tableRemplacement(champs);
  const options: OptionsRendu = { fraisPostauxReels: champs.fraisPostauxReels };

  return (
    <article className="text-body leading-snug text-ink">
      {/* En-tete : le logo du cabinet, puis les blocs PLEINE LARGEUR du gabarit (le titre
          du contrat et la mention des decrets). Ils viennent du classeur, on ne les ecrit
          pas en dur : quand un decret change, le texte suit tout seul. */}
      <header className="mb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-real31.png" alt="REAL 31 Immobilier" className="h-14 w-auto mb-4" />
        {GABARIT_PLEINE_LARGEUR.map((bloc, i) => {
          const texte = remplirTexte(bloc, table, options);
          return i === 0 ? (
            <h1 key={i} className="text-center text-page font-bold tracking-tight mb-2">
              {texte}
            </h1>
          ) : (
            <p key={i} className="text-meta text-ink-2 text-justify whitespace-pre-line">
              {texte}
            </p>
          );
        })}
      </header>

      {/* Le corps, sur deux colonnes. `items-start` : les deux flux commencent en haut,
          ils n'ont aucune raison d'etre alignes l'un sur l'autre. */}
      <div className="grid grid-cols-2 gap-6 items-start">
        <Colonne blocs={GABARIT_GAUCHE} table={table} options={options} />
        <div>
          <Colonne blocs={GABARIT_DROITE} table={table} options={options} />
          {champs.conditionsParticulieres && (
            <>
              <h2 className="mt-3 mb-1 px-1.5 py-1 bg-green-50 text-green-800 font-semibold break-inside-avoid">CONDITIONS PARTICULIÈRES</h2>
              <p className="whitespace-pre-line mb-1.5 text-justify">{champs.conditionsParticulieres}</p>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
