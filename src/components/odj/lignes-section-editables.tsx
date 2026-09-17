"use client";

import { useState } from "react";
import { Eye, EyeOff, Plus } from "lucide-react";
import type { ChampOdj, SectionOdj } from "@/lib/domain/odj";
import { valeurLocale } from "@/lib/domain/odj-brouillon";
import { PREFIXE_LIBELLE, PREFIXE_MASQUE, PREFIXE_TITRE_SECTION, idNote } from "@/lib/domain/odj-libre";
import { CorpsLigneSection, estParagraphe } from "@/components/odj/document-odj";
import { InputInline } from "./saisie-inline";
import { ValeurEditable } from "./valeur-editable";
import type { MoteurAutosave } from "./use-autosave-odj";

/** Ligne STANDARD de section : libelle renommable ("libelle.<id>"), valeur editable,
 *  croix de masquage ("masque.<id>"). Le catalogue n'est jamais modifie - tout vit
 *  dans l'etat, donc annulable (Ctrl+Z) et effacable (retour au catalogue). */
export function LigneStandardEditable({
  champ,
  libelle,
  moteur,
}: {
  champ: ChampOdj;
  libelle: string;
  moteur: MoteurAutosave;
}) {
  const [editionLibelle, setEditionLibelle] = useState(false);
  const cleMasque = `${PREFIXE_MASQUE}${champ.id}`;
  const cleLibelle = `${PREFIXE_LIBELLE}${champ.id}`;
  // Masquage OPTIMISTE : le brouillon local prime sur l'etat serveur.
  const masqueLocal = valeurLocale(moteur.brouillons, cleMasque);
  if (masqueLocal !== undefined ? masqueLocal.trim() !== "" : Boolean(champ.masque)) return null;
  const libelleLocal = valeurLocale(moteur.brouillons, cleLibelle);
  const libelleAffiche =
    libelleLocal !== undefined ? (libelleLocal.trim() || libelle) : libelle;

  const valeurAffichee = valeurLocale(moteur.brouillons, champ.id) ?? champ.valeur;
  const renduLibelle = editionLibelle ? (
    <InputInline
      initial={libelleAffiche}
      placeholder="Libellé"
      onAbandon={() => setEditionLibelle(false)}
      onCommit={(v) => {
        setEditionLibelle(false);
        const nouveau = v.trim();
        const avant = libelleLocal ?? (champ.libelleReecrit ? libelle : "");
        // Vide = retour au libelle du catalogue (efface la reecriture).
        if (nouveau !== libelleAffiche || nouveau === "") moteur.commettre(cleLibelle, avant, nouveau);
      }}
      classe="inline-block align-baseline min-w-[120px] px-1 -mx-1 rounded-sm bg-green-700/5 font-semibold text-ink text-[12px] leading-[1.55] outline-none ring-1 ring-green-700/40 focus:ring-green-700"
    />
  ) : (
    <button
      type="button"
      title="Cliquer pour renommer ce libellé (le vider rétablit l'original)"
      onClick={() => setEditionLibelle(true)}
      className="font-semibold text-ink text-left border-b border-dotted border-transparent hover:border-green-700/40 rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-700/50"
    >
      {libelleAffiche}
    </button>
  );

  return (
    <div className="group/std">
      <CorpsLigneSection
        libelle={renduLibelle}
        paragraphe={estParagraphe(champ, valeurAffichee)}
        valeur={<ValeurEditable champ={champ} moteur={moteur} sobre />}
        apres={
          <>
            <button
              type="button"
              title="Ajouter un paragraphe SOUS cette ligne (ex. expliquer ce montant)"
              onClick={() =>
                moteur.commettre(idNote(champ.id, Date.now()), "", "Nouveau paragraphe - cliquer pour rédiger.", true)
              }
              className="self-center p-0.5 rounded text-ink-3 opacity-0 group-hover/std:opacity-100 hover:text-green-700 hover:bg-green-700/5 transition-opacity"
            >
              <Plus strokeWidth={1.5} className="w-3 h-3" />
            </button>
            <button
              type="button"
              title="Retirer cette ligne du document"
              onClick={() => moteur.commettre(cleMasque, "", "1", true)}
              className="self-center p-0.5 rounded text-ink-3 opacity-0 group-hover/std:opacity-100 hover:text-warn-700 hover:bg-warn-50 transition-opacity"
            >
              <EyeOff strokeWidth={1.5} className="w-3 h-3" />
            </button>
          </>
        }
      />
    </div>
  );
}

/** Titre de section renommable ("titre-section.<id>", vider = retour au catalogue). */
export function TitreSectionEditable({ section, n, moteur }: { section: SectionOdj; n: number; moteur: MoteurAutosave }) {
  const [edition, setEdition] = useState(false);
  const cle = `${PREFIXE_TITRE_SECTION}${section.id}`;
  const local = valeurLocale(moteur.brouillons, cle);
  const titre = local !== undefined ? (local.trim() || section.titre) : section.titre;
  return (
    <h2 className="flex items-baseline gap-2 mb-2 pb-1 border-b border-green-700/40 break-after-avoid">
      <span className="text-green-700 font-bold text-[12.5px] tabular-nums">{n}.</span>
      {edition ? (
        <InputInline
          initial={titre}
          placeholder="Titre de la section"
          onAbandon={() => setEdition(false)}
          onCommit={(v) => {
            setEdition(false);
            const nouveau = v.trim();
            const avant = local ?? (section.titreReecrit ? section.titre : "");
            if (nouveau !== titre || nouveau === "") moteur.commettre(cle, avant, nouveau);
          }}
          classe="min-w-[220px] px-1 -mx-1 rounded-sm bg-green-700/5 text-[13px] font-semibold uppercase tracking-[0.04em] text-green-700 outline-none ring-1 ring-green-700/40 focus:ring-green-700"
        />
      ) : (
        <button
          type="button"
          title="Cliquer pour renommer cette section (la vider rétablit le titre d'origine)"
          onClick={() => setEdition(true)}
          className="text-[13px] font-semibold uppercase tracking-[0.04em] text-green-700 text-left rounded-sm hover:bg-green-700/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-700/50"
        >
          {titre}
        </button>
      )}
    </h2>
  );
}

/** Lignes standard MASQUEES d'une section, reintegrables d'un clic (meme motif que
 *  les points retires). L'etat local prime pour l'affichage optimiste. */
export function ChampsMasques({ section, moteur }: { section: SectionOdj; moteur: MoteurAutosave }) {
  const masques = section.champs.filter((c) => {
    if (c.libre) return false;
    const local = valeurLocale(moteur.brouillons, `${PREFIXE_MASQUE}${c.id}`);
    return local !== undefined ? local.trim() !== "" : Boolean(c.masque);
  });
  if (masques.length === 0) return null;
  return (
    <div className="mt-2 pt-1.5 border-t border-dashed border-line">
      <p className="text-[11px] text-ink-3 mb-1">Lignes retirées de cette section ({masques.length}) :</p>
      <ul className="space-y-0.5">
        {masques.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              title="Réintégrer cette ligne"
              onClick={() => moteur.commettre(`${PREFIXE_MASQUE}${c.id}`, "1", "", true)}
              className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-2 hover:text-green-700"
            >
              <Eye strokeWidth={1.5} className="w-3 h-3 shrink-0" />
              <span className="line-through decoration-line-2">{c.libelle}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

