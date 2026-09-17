"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { ChampOdj } from "@/lib/domain/odj";
import { valeurLocale } from "@/lib/domain/odj-brouillon";
import { idNote, parseChampLibre, serialiserChampLibre } from "@/lib/domain/odj-libre";
import { CorpsLigneSection, estParagraphe } from "@/components/odj/document-odj";
import { InputInline, TextareaInline } from "./saisie-inline";
import type { MoteurAutosave } from "./use-autosave-odj";

/** Ligne d'un champ LIBRE : libelle ET valeur editables, croix de suppression.
 *  Tout commit reecrit la valeur ENCODEE complete (libelle|texte) sur le meme id. */
export function ChampLibreEditable({ champ, moteur }: { champ: ChampOdj; moteur: MoteurAutosave }) {
  const [editionLibelle, setEditionLibelle] = useState(false);
  // La verite locale prime : un brouillon en vol porte deja "libelle|texte".
  const local = valeurLocale(moteur.brouillons, champ.id);
  const encodeActuel = local ?? serialiserChampLibre(champ.libelle, champ.valeur ?? "");
  const { libelle, texte } = parseChampLibre(encodeActuel);
  // Supprime : masque jusqu'a ce que le serveur cesse de le rendre (cf. `supprimes`).
  if (moteur.supprimes.has(champ.id)) return null;

  const champTexte: ChampOdj = {
    id: champ.id,
    libelle,
    source: "manuel",
    editable: true,
    saisi: Boolean(texte),
    ...(texte ? { valeur: texte } : {}),
  };

  const renduLibelle = editionLibelle ? (
    <InputInline
      initial={libelle}
      placeholder="Libellé"
      onAbandon={() => setEditionLibelle(false)}
      onCommit={(v) => {
        setEditionLibelle(false);
        const nouveau = serialiserChampLibre(v.trim() || "Nouveau champ", texte);
        if (nouveau !== encodeActuel) moteur.commettre(champ.id, encodeActuel, nouveau);
      }}
      classe="inline-block align-baseline min-w-[120px] px-1 -mx-1 rounded-sm bg-green-700/5 font-semibold text-ink text-[12px] leading-[1.55] outline-none ring-1 ring-green-700/40 focus:ring-green-700"
    />
  ) : (
    <button
      type="button"
      title="Champ ajouté - cliquer pour renommer"
      onClick={() => setEditionLibelle(true)}
      className="font-semibold text-ink text-left border-b border-dotted border-transparent hover:border-green-700/40 rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-700/50"
    >
      {libelle}
    </button>
  );

  return (
    <div className="group/libre">
      <CorpsLigneSection
        libelle={renduLibelle}
        paragraphe={estParagraphe(champTexte, texte)}
        valeur={<ValeurLibre champ={champTexte} libelle={libelle} encodeActuel={encodeActuel} moteur={moteur} />}
        apres={
          <>
            <button
              type="button"
              title="Ajouter un paragraphe SOUS cette ligne"
              onClick={() =>
                moteur.commettre(idNote(champ.id, Date.now()), "", "Nouveau paragraphe - cliquer pour rédiger.", true)
              }
              className="self-center p-0.5 rounded text-ink-3 opacity-0 group-hover/libre:opacity-100 hover:text-green-700 hover:bg-green-700/5 transition-opacity"
            >
              <Plus strokeWidth={1.5} className="w-3 h-3" />
            </button>
            <button
              type="button"
              title="Supprimer ce champ"
              onClick={() => moteur.commettre(champ.id, encodeActuel, "", true)}
              className="self-center p-0.5 rounded text-ink-3 opacity-0 group-hover/libre:opacity-100 hover:text-err-700 hover:bg-err-50 transition-opacity"
            >
              <X strokeWidth={1.5} className="w-3 h-3" />
            </button>
          </>
        }
      />
    </div>
  );
}

/** Valeur d'un champ libre : meme UX que ValeurEditable, mais le commit encode
 *  libelle|texte (la valeur seule n'existe pas en persistance). */
export function ValeurLibre({
  champ,
  libelle,
  encodeActuel,
  moteur,
}: {
  champ: ChampOdj;
  libelle: string;
  encodeActuel: string;
  moteur: MoteurAutosave;
}) {
  const [edition, setEdition] = useState(false);
  if (edition) {
    // TEXTAREA : Entree = saut de ligne, comme dans leur Word ("l'enter ne
    // fonctionne pas" - retour du 2026-09-01 : la valeur libre passait par l'input).
    return (
      <TextareaInline
        initial={champ.valeur ?? ""}
        onAbandon={() => setEdition(false)}
        onCommit={(v) => {
          setEdition(false);
          const nouveau = serialiserChampLibre(libelle, v.trim());
          if (nouveau !== encodeActuel) moteur.commettre(champ.id, encodeActuel, nouveau);
        }}
      />
    );
  }
  return (
    <button
      type="button"
      title="Saisi par le gestionnaire - cliquer pour modifier"
      onClick={() => setEdition(true)}
      className="group inline-flex items-baseline gap-1 max-w-full text-left align-baseline rounded-sm -mx-0.5 px-0.5 hover:bg-green-700/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-700/50"
    >
      {champ.valeur ? (
        <span className="text-ink whitespace-pre-wrap border-b border-dotted border-green-700/40">{champ.valeur}</span>
      ) : (
        <span className="inline-block align-baseline min-w-[140px] border-b border-dotted border-line-2 group-hover:border-green-700/60" />
      )}
    </button>
  );
}

/** Paragraphe libre : texte multiligne editable au clic, croix de suppression. */
export function BlocLibreEditable({
  id,
  texteServeur,
  moteur,
}: {
  id: string;
  texteServeur: string;
  moteur: MoteurAutosave;
}) {
  const [edition, setEdition] = useState(false);
  const local = valeurLocale(moteur.brouillons, id);
  const texte = local ?? texteServeur;
  const [brouillon, setBrouillon] = useState("");
  if (moteur.supprimes.has(id)) return null; // cf. `supprimes`

  if (edition) {
    const commettre = () => {
      setEdition(false);
      const v = brouillon.trim();
      if (v !== texte.trim()) moteur.commettre(id, texte, v || texte, false);
    };
    return (
      <textarea
         
        autoFocus
        value={brouillon}
        onChange={(e) => setBrouillon(e.target.value)}
        onBlur={commettre}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEdition(false);
        }}
        rows={Math.max(2, brouillon.split("\n").length)}
        className="w-full px-2 py-1 rounded-sm bg-green-700/5 text-[11.5px] leading-[1.55] text-ink outline-none ring-1 ring-green-700/40 focus:ring-green-700 resize-y"
      />
    );
  }

  return (
    <div className="group/bloc relative pr-7">
      <button
        type="button"
        title="Paragraphe ajouté - cliquer pour modifier"
        onClick={() => {
          setBrouillon(texte);
          setEdition(true);
        }}
        className="block w-full text-left text-[11.5px] text-ink leading-[1.55] whitespace-pre-wrap rounded-sm px-1 -mx-1 hover:bg-green-700/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-700/50"
      >
        {texte}
      </button>
      <button
        type="button"
        title="Supprimer ce paragraphe"
        onClick={() => moteur.commettre(id, texte, "", true)}
        className="absolute right-0 top-0.5 p-1 rounded text-ink-3 opacity-0 group-hover/bloc:opacity-100 hover:text-err-700 hover:bg-err-50 transition-opacity"
      >
        <X strokeWidth={1.5} className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/** Bouton d'ajout discret ("+ Ajouter un champ" / "+ Ajouter un paragraphe"). */
export function BoutonAjout({ libelle, onClick }: { libelle: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1 inline-flex items-center gap-1 text-[11px] text-ink-3 hover:text-green-700 transition-colors"
    >
      <Plus strokeWidth={1.5} className="w-3 h-3" />
      {libelle}
    </button>
  );
}

/** Champ construit depuis un brouillon local "libre.*" pas encore revenu du serveur
 *  (creation optimiste : le champ apparait des le clic, sans attendre le refresh). */
export function champDepuisBrouillon(champId: string, encode: string): ChampOdj {
  const { libelle, texte } = parseChampLibre(encode);
  return {
    id: champId,
    libelle: libelle || "Nouveau champ",
    source: "manuel",
    editable: true,
    saisi: true,
    libre: true,
    ...(texte ? { valeur: texte } : {}),
  };
}

