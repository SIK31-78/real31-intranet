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

function Bloc({ bloc, table }: { bloc: BlocGabarit; table: Record<string, string> }) {
  // Ligne de grille tarifaire : plusieurs cellules sur la meme ligne.
  if (typeof bloc !== "string") {
    return (
      <div className="flex items-baseline justify-between gap-3 py-0.5 border-b border-line/60">
        {bloc.map((cellule, i) => {
          const texte = remplirTexte(cellule, table);
          // Un MONTANT reste sur une ligne et s'aligne a droite ; une cellule de TEXTE se
          // replie. Sans cette distinction, les lignes a trois colonnes de texte (« IV. -
          // Administration et gestion… ») poussaient le document a 7 500 px de large.
          return estMontant(texte) ? (
            <span key={i} className="tabular-nums whitespace-nowrap text-right shrink-0">
              {texte}
            </span>
          ) : (
            <span key={i} className="flex-1 min-w-0 break-words">
              {texte}
            </span>
          );
        })}
      </div>
    );
  }

  const texte = remplirTexte(bloc, table);
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

export function DocumentContrat({ champs }: { champs: ChampsContrat }) {
  const table = tableRemplacement(champs);

  return (
    <article className="text-body leading-snug text-ink">
      {/* En-tete : le logo du cabinet, puis les blocs PLEINE LARGEUR du gabarit (le titre
          du contrat et la mention des decrets). Ils viennent du classeur, on ne les ecrit
          pas en dur : quand un decret change, le texte suit tout seul. */}
      <header className="mb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-real31.png" alt="REAL 31 Immobilier" className="h-14 w-auto mb-4" />
        {GABARIT_PLEINE_LARGEUR.map((bloc, i) => {
          const texte = remplirTexte(bloc, table);
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
        <div>
          {GABARIT_GAUCHE.map((bloc, i) => (
            <Bloc key={i} bloc={bloc} table={table} />
          ))}
        </div>
        <div>
          {GABARIT_DROITE.map((bloc, i) => (
            <Bloc key={i} bloc={bloc} table={table} />
          ))}
        </div>
      </div>
    </article>
  );
}
