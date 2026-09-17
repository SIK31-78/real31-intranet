"use client";

import { useState } from "react";
import { AlertTriangle, Pencil } from "lucide-react";
import type { ChampOdj, ProvenanceChamp } from "@/lib/domain/odj";
import { formatChampValeur, provenanceChamp } from "@/lib/domain/odj";
import { valeurLocale, type Brouillons } from "@/lib/domain/odj-brouillon";
import { ValeurStatique } from "@/components/odj/document-odj";
import { InputInline, TextareaInline } from "./saisie-inline";
import type { MoteurAutosave } from "./use-autosave-odj";

// Meme vocabulaire que l'ancien formulaire : la provenance REELLE du champ.
export const PROVENANCE_TITRE: Record<ProvenanceChamp, string> = {
  auto: "Rempli automatiquement",
  "auto-jalon": "Calculé depuis la date d'AG (jalon)",
  calcul: "Calculé depuis d'autres champs",
  saisi: "Saisi par le gestionnaire",
  "a-venir": "Sera rempli par ESTALE (à venir)",
  "a-saisir": "À saisir",
};

/** Champ du document avec le brouillon local superpose (l'affichage suit la frappe
 *  sans attendre le retour serveur). */
export function champAvecBrouillon(champ: ChampOdj, brouillons: Brouillons): ChampOdj {
  const local = valeurLocale(brouillons, champ.id);
  if (local === undefined) return champ;
  const { valeur: _ancienne, ...reste } = champ;
  void _ancienne;
  // Brouillon vide = retour a la valeur AUTO cote serveur ; en attendant, trait vide.
  return local.trim() === "" ? { ...reste, saisi: false } : { ...reste, valeur: local, saisi: true };
}

export function ValeurEditable({
  champ,
  moteur,
  sobre = false,
}: {
  champ: ChampOdj;
  moteur: MoteurAutosave;
  /** Lignes de SECTION : le gras est au libelle, la valeur reste sobre (mise en page Word). */
  sobre?: boolean;
}) {
  const [edition, setEdition] = useState(false);
  const affiche = champAvecBrouillon(champ, moteur.brouillons);
  const titreProvenance = PROVENANCE_TITRE[provenanceChamp(affiche)];
  const actuel = valeurLocale(moteur.brouillons, champ.id) ?? champ.valeur ?? "";
  // Montants / pourcentages : une ligne. Tout le reste : PARAGRAPHE possible.
  const multiligne = !champ.type || champ.type === "texte";

  if (!champ.editable) {
    return (
      <span title={titreProvenance}>
        <ValeurStatique v={formatChampValeur(affiche)} gras={!sobre} />
      </span>
    );
  }

  // Booleen : jamais un champ de saisie (on ne tape pas "oui"), une BASCULE d'un clic --
  // meme geste que la modalite visio, avec les libelles generiques Oui / Non.
  if (champ.type === "booleen") {
    return (
      <BasculeBooleen
        champ={champ}
        moteur={moteur}
        oui="Oui"
        non="Non"
        titre="Cliquer pour basculer Oui / Non"
        sobre={sobre}
      />
    );
  }

  if (edition) {
    const commit = (v: string) => {
      setEdition(false);
      const brut = v.trim();
      if (brut !== actuel.trim()) moteur.commettre(champ.id, actuel, brut);
    };
    if (multiligne) return <TextareaInline initial={actuel} onAbandon={() => setEdition(false)} onCommit={commit} />;
    return (
      <InputInline
        initial={actuel}
        placeholder={champ.type === "montant" ? "Montant en €" : undefined}
        onAbandon={() => setEdition(false)}
        onCommit={commit}
      />
    );
  }

  const v = formatChampValeur(affiche);
  return (
    <button
      type="button"
      title={`${titreProvenance} - cliquer pour modifier${champ.alerte ? ` (${champ.alerte})` : ""}`}
      onClick={() => setEdition(true)}
      className="group inline-flex items-baseline gap-1 max-w-full text-left align-baseline rounded-sm -mx-0.5 px-0.5 hover:bg-green-700/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-700/50"
    >
      {v ? (
        <span
          className={`whitespace-pre-wrap border-b border-dotted border-green-700/40 ${sobre ? "text-ink" : "font-medium text-ink"}`}
        >
          {v}
        </span>
      ) : (
        <span className="inline-block align-baseline min-w-[140px] border-b border-dotted border-line-2 group-hover:border-green-700/60" />
      )}
      {champ.alerte && !v ? (
        <AlertTriangle strokeWidth={1.5} className="w-3 h-3 self-center text-warn-700" />
      ) : (
        <Pencil
          strokeWidth={1.5}
          className="w-3 h-3 self-center text-ink-3 opacity-0 group-hover:opacity-100 group-hover:text-green-700 transition-opacity"
        />
      )}
    </button>
  );
}

/** Bascule d'un champ BOOLEEN : un clic fait oui <-> non, envoi immediat (pas d'attente
 *  de debounce sur un geste binaire). Les libelles sont fournis par l'appelant : la
 *  modalite dit "Présentiel / hybride", les autres booleens disent "Oui / Non". */
export function BasculeBooleen({
  champ,
  moteur,
  oui,
  non,
  titre,
  sobre = false,
}: {
  champ: ChampOdj;
  moteur: MoteurAutosave;
  oui: string;
  non: string;
  titre: string;
  /** Ligne de SECTION : le gras est au libelle, la valeur reste sobre. */
  sobre?: boolean;
}) {
  const actuel = valeurLocale(moteur.brouillons, champ.id) ?? champ.valeur ?? "non";
  const actif = actuel === "oui";
  const style = sobre ? "text-ink" : "font-medium text-ink";
  if (!champ.editable) return <span className={style}>{actif ? oui : non}</span>;
  return (
    <button
      type="button"
      title={titre}
      onClick={() => moteur.commettre(champ.id, actuel, actif ? "non" : "oui", true)}
      className={`${style} border-b border-dotted border-green-700/40 rounded-sm -mx-0.5 px-0.5 hover:bg-green-700/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-700/50`}
    >
      {actif ? oui : non}
    </button>
  );
}

/** Modalite (visio) : bascule directe Presentiel <-> hybride, envoi immediat. */
export function ModaliteEditable({ champ, moteur }: { champ: ChampOdj | undefined; moteur: MoteurAutosave }) {
  if (!champ) return <span className="font-medium text-ink">Présentiel</span>;
  return (
    <BasculeBooleen
      champ={champ}
      moteur={moteur}
      oui="Présentiel et visio (hybride)"
      non="Présentiel"
      titre="Cliquer pour basculer présentiel / hybride"
    />
  );
}

