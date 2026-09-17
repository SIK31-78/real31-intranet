"use client";

// Moteur d'auto-save de l'ODJ editable : brouillons (domaine odj-brouillon), historique
// Ctrl+Z / Ctrl+Y (domaine odj-historique), debounce 900 ms + envoi immediat pour les
// gestes binaires, garde-fou de fermeture d'onglet.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BROUILLONS_VIDES,
  aDesModifsNonSauvees,
  atterrir,
  partirEnVol,
  poserBrouillon,
  type Brouillons,
} from "@/lib/domain/odj-brouillon";
import {
  HISTORIQUE_VIDE,
  annuler,
  pousserGeste,
  refaire,
  type HistoriqueOdj,
} from "@/lib/domain/odj-historique";
import { estAjoutLibre } from "@/lib/domain/odj-libre";

export const DELAI_AUTOSAVE_MS = 900;

export interface MoteurAutosave {
  brouillons: Brouillons;
  historique: HistoriqueOdj;
  /** Ids d'ajouts libres supprimes LOCALEMENT. Le brouillon "" est consomme des que le
   *  serveur repond, mais le HTML revalide arrive APRES : sans ce registre, le champ
   *  supprime se reaffiche entre les deux (doublon fantome mesure le 2026-08-31).
   *  Purge par une nouvelle valeur non vide sur le meme id (Ctrl+Y). */
  supprimes: ReadonlySet<string>;
  /** Commit d'un geste d'edition : entre dans l'HISTORIQUE puis part a l'auto-save
   *  (debounce, ou immediat pour les bascules/ajouts/suppressions). */
  commettre: (champId: string, avant: string, apres: string, immediat?: boolean) => void;
  /** Envoie tout ce qui est en attente (bouton Enregistrer, re-essai apres echec). */
  envoyer: () => void;
  annulerGeste: () => void;
  refaireGeste: () => void;
}

export function useAutosaveOdj(onSaisir: (champId: string, valeur: string) => Promise<void>): MoteurAutosave {
  const [brouillons, setBrouillons] = useState<Brouillons>(BROUILLONS_VIDES);
  const [historique, setHistorique] = useState<HistoriqueOdj>(HISTORIQUE_VIDE);
  const [supprimes, setSupprimes] = useState<ReadonlySet<string>>(new Set());
  // La verite vit dans la ref (mise a jour SYNCHRONE) ; le state ne sert qu'au rendu.
  // Evite les lectures perimees quand blur + clic Enregistrer tombent dans la meme frame.
  const etatRef = useRef<Brouillons>(BROUILLONS_VIDES);
  const histRef = useRef<HistoriqueOdj>(HISTORIQUE_VIDE);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const maj = useCallback((fn: (b: Brouillons) => Brouillons) => {
    etatRef.current = fn(etatRef.current);
    setBrouillons(etatRef.current);
  }, []);

  const envoyer = useCallback(() => {
    clearTimeout(timerRef.current);
    const { etat, cargaison } = partirEnVol(etatRef.current);
    const entrees = Object.entries(cargaison);
    if (entrees.length === 0) return;
    etatRef.current = etat;
    setBrouillons(etat);
    for (const [champId, valeur] of entrees) {
      void onSaisir(champId, valeur)
        .then(() => maj((b) => atterrir(b, champId, true)))
        .catch(() => maj((b) => atterrir(b, champId, false)));
    }
  }, [onSaisir, maj]);

  const saisir = useCallback(
    (champId: string, valeur: string, immediat?: boolean) => {
      // Registre des suppressions d'ajouts libres (cf. `supprimes`).
      if (estAjoutLibre(champId)) {
        setSupprimes((s) => {
          const vide = valeur.trim() === "";
          if (vide === s.has(champId)) return s;
          const n = new Set(s);
          if (vide) n.add(champId);
          else n.delete(champId);
          return n;
        });
      }
      maj((b) => poserBrouillon(b, champId, valeur));
      if (immediat) {
        envoyer();
        return;
      }
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(envoyer, DELAI_AUTOSAVE_MS);
    },
    [maj, envoyer],
  );

  const commettre = useCallback(
    (champId: string, avant: string, apres: string, immediat?: boolean) => {
      histRef.current = pousserGeste(histRef.current, { champId, avant, apres });
      setHistorique(histRef.current);
      saisir(champId, apres, immediat);
    },
    [saisir],
  );

  const annulerGeste = useCallback(() => {
    const { historique: h, geste } = annuler(histRef.current);
    histRef.current = h;
    setHistorique(h);
    if (geste) saisir(geste.champId, geste.avant, true);
  }, [saisir]);

  const refaireGeste = useCallback(() => {
    const { historique: h, geste } = refaire(histRef.current);
    histRef.current = h;
    setHistorique(h);
    if (geste) saisir(geste.champId, geste.apres, true);
  }, [saisir]);

  // Ctrl+Z / Ctrl+Y (et Ctrl+Shift+Z) au niveau du document - mais JAMAIS quand un
  // input est actif : la, c'est l'annulation native du champ en cours qui doit jouer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const cible = e.target as HTMLElement | null;
      if (cible && (cible.tagName === "INPUT" || cible.tagName === "TEXTAREA" || cible.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        annulerGeste();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        refaireGeste();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [annulerGeste, refaireGeste]);

  // Garde-fou fermeture d'onglet : des brouillons non confirmes = avertir.
  useEffect(() => {
    const garde = (e: BeforeUnloadEvent) => {
      if (aDesModifsNonSauvees(etatRef.current)) e.preventDefault();
    };
    window.addEventListener("beforeunload", garde);
    return () => window.removeEventListener("beforeunload", garde);
  }, []);

  return { brouillons, historique, supprimes, commettre, envoyer, annulerGeste, refaireGeste };
}
