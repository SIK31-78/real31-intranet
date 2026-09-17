"use client";

// Le STATUT d'une étape de suivi, rendu une seule fois pour la perte et la reprise
// (audit du 16/09/2026, lot R) : la pastille, le ton du libellé, le menu de changement de
// statut. Les mots restent ceux de chaque module : la reprise dit « Ignoré », la perte
// « Sans objet » — le libellé se passe en prop, le composant ne tranche pas.

import { useState } from "react";
import { Check, Circle, Minus, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { STATUTS_ETAPE, type StatutEtape } from "@/lib/domain/suivi/etape";

export type LibellesStatut = Record<StatutEtape, string>;

/** Les mots du tableau de suivi de la reprise. */
export const LIBELLE_STATUT_ETAPE: LibellesStatut = {
  a_faire: "À faire",
  en_cours: "En cours",
  bloque: "Bloqué",
  fait: "Fait",
  ignore: "Ignoré",
};

/** Ton du libellé d'une étape selon son statut (même table pour la perte et la reprise). */
export function classesLibelleStatut(statut: StatutEtape): string {
  switch (statut) {
    case "fait":
      return "text-ink-2";
    case "en_cours":
      return "text-info-700 font-medium";
    case "bloque":
      return "text-err-700 font-medium";
    case "ignore":
      return "text-ink-3 line-through";
    default:
      return "text-ink";
  }
}

/** La pastille : un rendu par statut. `petite` = dans un menu. */
export function PastilleEtape({ statut, petite, className }: { statut: StatutEtape; petite?: boolean; className?: string }) {
  const base = cn("rounded-full flex items-center justify-center shrink-0 transition-colors", petite ? "w-4 h-4" : "w-5 h-5", className);
  const ico = petite ? "w-2.5 h-2.5" : "w-3 h-3";
  if (statut === "fait") {
    return (
      <span className={cn(base, "bg-ok-500 text-white")} aria-hidden>
        <Check strokeWidth={3} className={ico} />
      </span>
    );
  }
  if (statut === "en_cours") {
    return (
      <span className={cn(base, "bg-surface border-2 border-info-500 text-info-700")} aria-hidden>
        <Circle strokeWidth={0} className={cn(petite ? "w-1.5 h-1.5" : "w-2 h-2", "fill-info-500")} />
      </span>
    );
  }
  if (statut === "bloque") {
    return (
      <span className={cn(base, "bg-err-500 text-white")} aria-hidden>
        <OctagonAlert strokeWidth={2.5} className={ico} />
      </span>
    );
  }
  if (statut === "ignore") {
    return (
      <span className={cn(base, "bg-surface-2 border border-line text-ink-3")} aria-hidden>
        <Minus strokeWidth={2} className={ico} />
      </span>
    );
  }
  return <span className={cn(base, "bg-surface border border-line-2")} aria-hidden />;
}

/**
 * Pastille cliquable qui ouvre le menu des statuts. « Bloqué » ne se valide qu'avec un motif :
 * le champ apparaît dans le menu avant validation.
 */
export function MenuStatut({
  statut,
  disabled,
  onChoisir,
  libelles = LIBELLE_STATUT_ETAPE,
}: {
  statut: StatutEtape;
  disabled: boolean;
  onChoisir: (statut: StatutEtape, motif?: string) => void;
  libelles?: LibellesStatut;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [saisieMotif, setSaisieMotif] = useState(false);
  const [motif, setMotif] = useState("");

  const fermer = () => {
    setOuvert(false);
    setSaisieMotif(false);
    setMotif("");
  };

  const choisir = (s: StatutEtape) => {
    if (s === "bloque") {
      setSaisieMotif(true);
      return;
    }
    onChoisir(s);
    fermer();
  };

  const bloquer = () => {
    const m = motif.trim();
    if (!m) return;
    onChoisir("bloque", m);
    fermer();
  };

  return (
    <div className="relative shrink-0 mt-0.5">
      <Button
        onClick={() => (ouvert ? fermer() : setOuvert(true))}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-label={`Statut : ${libelles[statut]} (cliquer pour changer)`}
        title={`${libelles[statut]} (cliquer pour changer)`}
        variant="ghost"
      >
        <PastilleEtape statut={statut} />
      </Button>
      {ouvert && (
        <>
          {/* Voile transparent : un clic hors du menu le ferme. */}
          <div className="fixed inset-0 z-30" onClick={fermer} aria-hidden />
          <div
            role="menu"
            className="absolute z-40 left-0 top-7 w-[240px] rounded-lg border border-line bg-surface shadow-1 shadow-2 p-1"
            onKeyDown={(e) => e.key === "Escape" && fermer()}
          >
            {!saisieMotif ? (
              STATUTS_ETAPE.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="menuitemradio"
                  aria-checked={s === statut}
                  onClick={() => choisir(s)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-left text-body hover:bg-surface-2",
                    s === statut ? "text-ink font-medium" : "text-ink-2",
                  )}
                >
                  <PastilleEtape statut={s} petite />
                  {libelles[s]}
                  {s === statut && <Check strokeWidth={2} className="w-3.5 h-3.5 ml-auto text-green-700" />}
                </button>
              ))
            ) : (
              <div className="p-1.5 flex flex-col gap-1.5">
                <label className="text-meta font-medium text-err-700">Motif du blocage</label>
                <Textarea
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      bloquer();
                    }
                  }}
                  autoFocus
                  rows={3}
                  maxLength={500}
                  placeholder="ex. RIB du sortant non reçu, relancé le 3/9"
                />
                <div className="flex items-center gap-1.5">
                  <Button type="button" variant="danger" size="sm" onClick={bloquer} disabled={!motif.trim()}>
                    Bloquer
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={fermer}>
                    Annuler
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
