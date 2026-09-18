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
import { arbreContrat, type NoeudContrat } from "@/lib/domain/contrat/rendu-contrat";

function Noeud({ n }: { n: NoeudContrat }) {
  if (n.type === "titre") {
    return <h2 className="mt-3 mb-1 px-1.5 py-1 bg-green-50 text-green-800 font-semibold whitespace-pre-line break-inside-avoid">{n.texte}</h2>;
  }
  // `whitespace-pre-line` : le gabarit porte ses propres sauts de ligne, ils font partie
  // de la mise en page du contrat (adresses, listes d'horaires).
  if (n.type === "paragraphe") return <p className="whitespace-pre-line mb-1.5 text-justify">{n.texte}</p>;
  if (n.type === "signatures") {
    return (
      <div className="flex gap-6 my-3 break-inside-avoid">
        {n.parties.map((p) => (
          <div key={p} className="flex-1 min-h-[70px] pt-1 font-semibold">{p}</div>
        ))}
      </div>
    );
  }
  // Un vrai tableau : colonnes alignees, en-tetes en capitales, montants a droite, une
  // ligne ne se coupe pas entre deux pages (retour du test du 17/09/2026).
  return (
    <table className="w-full table-fixed border-separate border-spacing-0 border-l border-t border-ink my-1.5 text-[0.95em]">
      <colgroup>
        {Array.from({ length: n.colonnes }, (_, i) => (
          <col key={i} style={i < n.colonnes - 1 ? { width: `${100 / n.colonnes}%` } : undefined} />
        ))}
      </colgroup>
      <tbody>
        {n.lignes.map((l, r) => (
          <tr key={r} className="break-inside-avoid align-top">
            {l.cellules.map((c, i) =>
              l.enTete ? (
                <th key={i} colSpan={c.etendue} rowSpan={c.portee} className="border-r border-b border-ink px-1.5 py-1 text-center font-bold whitespace-pre-line">{c.texte}</th>
              ) : (
                <td key={i} colSpan={c.etendue} rowSpan={c.portee} className={`border-r border-b border-ink px-1.5 py-1 whitespace-pre-line ${c.portee ? "font-semibold" : c.montant ? "text-right tabular-nums whitespace-nowrap" : ""}`}>{c.texte}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DocumentContrat({ champs }: { champs: ChampsContrat }) {
  const a = arbreContrat(champs);
  return (
    <article className="text-body leading-snug text-ink">
      {/* En-tete : le logo du cabinet, puis le titre et la mention des decrets, qui viennent
          du classeur : quand un decret change, le texte suit tout seul. */}
      <header className="mb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/contrat-bandeau.png" alt="REAL 31 Immobilier, FNAIM, 20 ans d'expertise immobilière" className="w-full h-auto mb-4" />
        <h1 className="text-center text-page font-bold tracking-tight mb-2">{a.titre}</h1>
        {a.enTete.map((t, i) => (
          <p key={i} className="text-meta text-ink-2 text-justify whitespace-pre-line">{t}</p>
        ))}
      </header>

      {/* Le corps, sur deux colonnes. `items-start` : les deux flux commencent en haut,
          ils n'ont aucune raison d'etre alignes l'un sur l'autre. */}
      <div className="grid grid-cols-2 gap-6 items-start">
        <div>{a.gauche.map((n, i) => <Noeud key={i} n={n} />)}</div>
        <div>{a.droite.map((n, i) => <Noeud key={i} n={n} />)}</div>
      </div>
    </article>
  );
}
