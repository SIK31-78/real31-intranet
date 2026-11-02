"use client";

// « Archiver dans… » de la boîte perso, avec recherche (02/11/2026) : Julie range dans des
// sous-dossiers copro, le menu ne proposait que le premier niveau. Toute l'arborescence est
// proposée sous son chemin « Parent / Enfant » ; un champ filtre la liste (chaque mot tapé doit
// se trouver dans le chemin). Clavier : flèches, Entrée, Échap (useCombobox).

import { useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/field";
import { useCombobox } from "@/components/ui/combobox";
import { filtrerDossiers, grouperDossiersBoite, libelleDossier, type DossierBoite } from "@/lib/domain/mes-emails";
import { Deroulant } from "./equipe-mail";

type Option = DossierBoite & { groupe: "reception" | "autres" };

export function ChoixDossierOutlook({
  dossiers,
  valeur,
  onChoisir,
}: {
  /** null = en cours de chargement. */
  dossiers: DossierBoite[] | null;
  valeur: string;
  onChoisir: (id: string) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [recherche, setRecherche] = useState("");
  const bouton = useRef<HTMLButtonElement>(null);

  const toutes = useMemo<Option[]>(() => {
    if (!dossiers) return [];
    const { reception, autres } = grouperDossiersBoite(dossiers);
    return [...reception.map((d) => ({ ...d, groupe: "reception" as const })), ...autres.map((d) => ({ ...d, groupe: "autres" as const }))];
  }, [dossiers]);
  const options = useMemo(() => filtrerDossiers(toutes, recherche), [toutes, recherche]);
  const choisi = dossiers?.find((d) => d.id === valeur);

  const fermer = () => {
    setOuvert(false);
    setRecherche("");
  };
  const choisir = (d: Option) => {
    onChoisir(d.id);
    fermer();
    bouton.current?.focus();
  };
  const cb = useCombobox(ouvert ? options : [], choisir, fermer);

  return (
    <span className="relative inline-flex">
      <button
        ref={bouton}
        type="button"
        onClick={() => (ouvert ? fermer() : setOuvert(true))}
        aria-expanded={ouvert}
        aria-label="Dossier Outlook où archiver le mail traité"
        title={choisi ? libelleDossier(choisi) : undefined}
        disabled={dossiers === null}
        className="h-7 max-w-[200px] inline-flex items-center gap-1 rounded-md border border-line bg-surface pl-2 pr-1.5 text-meta text-ink hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 disabled:opacity-60"
      >
        <span className="truncate">{dossiers === null ? "Chargement des dossiers…" : choisi ? choisi.nom : "Archiver dans…"}</span>
        <ChevronDown strokeWidth={1.75} className="w-3 h-3 shrink-0 text-ink-3" />
      </button>
      <Deroulant ouvert={ouvert} onFermer={fermer} largeur="w-80" barre>
        <div className="px-2 pb-1">
          <Input
            autoFocus
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            onKeyDown={cb.onKeyDown}
            placeholder="Chercher un dossier…"
            aria-label="Chercher un dossier"
            autoComplete="off"
            {...cb.input}
          />
        </div>
        <ul {...cb.liste} className="max-h-72 overflow-y-auto">
          {valeur ? (
            <li>
              <button
                type="button"
                onClick={() => {
                  onChoisir("");
                  fermer();
                }}
                className="w-full px-3 py-1.5 text-left text-meta text-ink-3 hover:bg-surface-2"
              >
                Aucun dossier
              </button>
            </li>
          ) : null}
          {options.length === 0 ? <li className="px-3 py-2 text-meta text-ink-3">Aucun dossier ne correspond.</li> : null}
          {options.map((d, i) => (
            <li key={d.id} {...cb.option(i)}>
              {i === 0 || options[i - 1]!.groupe !== d.groupe ? (
                <span className="block px-3 pt-2 pb-0.5 text-meta uppercase tracking-wider text-ink-3">
                  {d.groupe === "reception" ? "Sous-dossiers de la réception" : "Autres dossiers"}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => choisir(d)}
                title={libelleDossier(d)}
                className={
                  "w-full px-3 py-1.5 text-left text-body truncate " +
                  (i === cb.actif ? "bg-surface-2 " : "hover:bg-surface-2 ") +
                  (d.id === valeur ? "font-medium text-green-700" : "text-ink")
                }
              >
                {libelleDossier(d)}
              </button>
            </li>
          ))}
        </ul>
      </Deroulant>
    </span>
  );
}
