// Formats d'affichage partages par les services de facturation : ils servent
// aussi bien au recapitulatif de confirmation (UI) qu'au detail de ligne envoye
// a Pennylane, qui doit rester lisible sur le PDF remis a la copropriete.

/** "2026-05-12" (ou un ISO complet) -> "12/05/2026". */
export function formatJour(jourISO: string): string {
  const [a, m, j] = jourISO.slice(0, 10).split("-");
  if (!a || !m || !j) return jourISO;
  return `${j}/${m}/${a}`;
}

/** (18, 5) -> "18:05". */
export function formatHeure(heure: number, minute: number): string {
  return `${String(heure).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** 2.5 -> "2 h 30", 3 -> "3 h". */
export function formatHeures(heures: number): string {
  const h = Math.floor(heures);
  const min = Math.round((heures - h) * 60);
  return min === 0 ? `${h} h` : `${h} h ${String(min).padStart(2, "0")}`;
}

// Le formateur d'euros est unique (domaine) : meme rendu partout, PDF Pennylane compris.
export { formatEuros } from "@/lib/domain/format-montant";
