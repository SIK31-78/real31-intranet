// Le texte d'un mouvement, pour le journal d'un trousseau ou d'une entreprise. Pur.

import type { ConformiteRetour, Mouvement } from "./types";
import { LIBELLE_CONFORMITE } from "./types";

function jjmm(iso: unknown): string {
  if (typeof iso !== "string" || iso.length < 10) return "?";
  const [a, m, j] = iso.slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
}

function texte(v: unknown): string {
  return typeof v === "string" && v.trim() ? v.trim() : "";
}

export function texteMouvement(m: Mouvement): string {
  const d = m.details ?? {};
  const qui = m.entrepriseNom ?? texte(d.entrepriseNom);
  const motif = texte(d.motif);
  switch (m.type) {
    case "creation":
      return "Trousseau créé";
    case "modification":
      return `Fiche modifiée${motif ? ` — ${motif}` : ""}`;
    case "composition_modifiee":
      return "Composition modifiée";
    case "reservation":
      return `Réservé${qui ? ` pour ${qui}` : ""} du ${jjmm(d.debutISO)} au ${jjmm(d.finPrevueISO)}${motif ? ` — ${motif}` : ""}`;
    case "annulation_reservation":
      return `Réservation annulée${qui ? ` (${qui})` : ""}${motif ? ` — ${motif}` : ""}`;
    case "sortie":
      return d.type === "interne"
        ? `Sorti en interne${texte(d.contactNom) ? ` par ${texte(d.contactNom)}` : ""}, retour prévu le ${jjmm(d.retourPrevuLeISO)}${motif ? ` — ${motif}` : ""}`
        : `Remis à ${qui || "?"}${texte(d.contactNom) ? ` (${texte(d.contactNom)})` : ""}, retour prévu le ${jjmm(d.retourPrevuLeISO)}${motif ? ` — ${motif}` : ""}`;
    case "prolongation":
      return `Retour reporté au ${jjmm(d.retourPrevuLeISO)}${motif ? ` — ${motif}` : ""}`;
    case "retour": {
      const conf = d.conformite as ConformiteRetour | undefined;
      const jours = typeof d.joursDehors === "number" ? d.joursDehors : undefined;
      return `Rendu${qui ? ` par ${qui}` : ""}${conf ? ` — ${LIBELLE_CONFORMITE[conf].toLowerCase()}` : ""}${jours !== undefined ? ` (${jours <= 0 ? "le jour même" : `${jours} j dehors`})` : ""}${texte(d.commentaire) ? ` — ${texte(d.commentaire)}` : ""}`;
    }
    case "introuvable":
      return `Déclaré introuvable${motif ? ` — ${motif}` : ""}`;
    case "retrouve":
      return `Retrouvé${motif ? ` — ${motif}` : ""}`;
    case "retrait":
      return `Retiré${motif ? ` — ${motif}` : ""}`;
    case "correction":
      return `Correction${texte(d.champ) ? ` de ${texte(d.champ)}` : ""}${motif ? ` — ${motif}` : ""}`;
    case "relance":
      return `Relance${typeof d.niveau === "number" ? ` n°${d.niveau}` : ""}${qui ? ` à ${qui}` : ""}`;
    case "import":
      return `Repris de PowerApps : ${texte(d.libelle) || "mouvement"}${texte(d.incoherence) ? ` (incohérence : ${texte(d.incoherence)})` : ""}`;
  }
}
