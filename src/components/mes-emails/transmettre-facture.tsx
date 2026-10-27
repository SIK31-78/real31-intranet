"use client";

// « Transmettre à ESTALE » : sur un mail portant une facture, saisir la codification
// (compte, fournisseur, libellé) -> brouillon de transfert vers la boîte factures ESTALE de
// l'agence DE LA COPROPRIÉTÉ du mail (27/10/2026 : une boîte partagée sert parfois deux
// agences), objet « 601000 - DGP NETTOYAGE - Entretien EV », pièces jointes conservées.
// Sans copro choisie, le bouton reste fermé et le dit. Repliable : fermé par défaut.

import { useState } from "react";
import { Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { factureComplete, objetFactureEstale } from "@/lib/domain/mes-emails-composition";

export function TransmettreFacture({
  destinataire,
  coproChoisie,
  onTransmettre,
}: {
  /** Où part la facture (affiché pour que l'on sache où ça part). */
  destinataire: string;
  /** La copro du mail est choisie : c'est elle qui désigne l'agence, donc la boîte factures. */
  coproChoisie: boolean;
  onTransmettre: (f: { compte: string; fournisseur: string; libelle: string }) => Promise<void>;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [f, setF] = useState({ compte: "", fournisseur: "", libelle: "" });
  const [enCours, setEnCours] = useState(false);
  const pret = factureComplete(f) && /^\d{3,8}$/.test(f.compte.trim());

  if (!coproChoisie) {
    return (
      <span className="mt-2 inline-flex items-center gap-1 text-meta text-ink-3">
        <Receipt strokeWidth={1.5} className="w-3.5 h-3.5" />
        Transmettre la facture à ESTALE : choisis d&apos;abord la copropriété.
      </span>
    );
  }

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="mt-2 inline-flex items-center gap-1 text-meta text-ink-3 hover:text-ink underline"
      >
        <Receipt strokeWidth={1.5} className="w-3.5 h-3.5" />
        Transmettre la facture à ESTALE
      </button>
    );
  }

  const champ = "h-7 rounded border border-line bg-surface px-2 text-meta text-ink";
  return (
    <div className="mt-2 rounded-md border border-line bg-surface-2 p-2.5 flex flex-col gap-2 text-meta">
      <div className="flex flex-wrap gap-2">
        <input aria-label="Compte" placeholder="601000" value={f.compte} onChange={(e) => setF({ ...f, compte: e.target.value })} className={`${champ} w-24 font-mono`} />
        <input aria-label="Fournisseur" placeholder="DGP NETTOYAGE" value={f.fournisseur} onChange={(e) => setF({ ...f, fournisseur: e.target.value })} className={`${champ} flex-1 min-w-[140px]`} />
        <input aria-label="Libellé" placeholder="Entretien EV" value={f.libelle} onChange={(e) => setF({ ...f, libelle: e.target.value })} className={`${champ} flex-1 min-w-[140px]`} />
      </div>
      <div className="text-ink-3">
        Objet : <span className="font-mono text-ink-2">{factureComplete(f) ? objetFactureEstale(f) : "-"}</span> · vers{" "}
        <span>{destinataire}</span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={!pret}
          loading={enCours}
          onClick={async () => {
            setEnCours(true);
            await onTransmettre(f);
            setEnCours(false);
          }}
        >
          {enCours ? "Création…" : "Créer le brouillon de transfert"}
        </Button>
        <button type="button" onClick={() => setOuvert(false)} className="text-ink-3 hover:text-ink underline">
          Fermer
        </button>
      </div>
    </div>
  );
}
