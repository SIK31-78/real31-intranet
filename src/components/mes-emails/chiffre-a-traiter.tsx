"use client";

// Le chiffre unique « À traiter » (décision de Sekou n° 1, 29/10/2026), le MÊME partout : titre
// de l'écran E-mails, pastille de la barre latérale, titre de l'onglet du navigateur. L'écran
// le calcule sur sa liste (chiffreATraiter) et le publie ici à chaque geste : la pastille et le
// titre baissent tout de suite, sans recharger. Hors de l'écran, la pastille garde le chiffre
// du serveur (compteur-emails).
//
// Couleur neutre ; rouge seulement quand des mails attendent depuis plus de 2 jours ouvrés.
// Le chiffre = les mails à traiter du binôme, attribués ou non (hors en attente / de côté).

import { useSyncExternalStore } from "react";
import type { ChiffreATraiter } from "@/lib/domain/mes-emails-liste";

let courant: ChiffreATraiter | null = null;
const abonnes = new Set<() => void>();

function abonner(f: () => void) {
  abonnes.add(f);
  return () => {
    abonnes.delete(f);
  };
}

/** L'écran publie son chiffre (null en le quittant : la pastille reprend celui du serveur). */
export function publierChiffre(c: ChiffreATraiter | null): void {
  if (c && courant && c.principal === courant.principal && c.enRetard === courant.enRetard && c.aMoi === courant.aMoi) return;
  courant = c;
  for (const f of abonnes) f();
}

function useChiffreEcran(): ChiffreATraiter | null {
  return useSyncExternalStore(
    abonner,
    () => courant,
    () => null,
  );
}

/** La pastille de l'entrée « E-mails » : rien à 0. */
export function PastilleEmails({ initial }: { initial: ChiffreATraiter | null }) {
  const c = useChiffreEcran() ?? initial;
  if (!c || c.principal <= 0) return null;
  const retard = c.enRetard > 0;
  return (
    <span
      className={
        "ml-auto min-w-[18px] h-[18px] px-1 rounded-full text-meta font-semibold tabular-nums leading-[18px] text-center " +
        (retard ? "bg-err-500 text-white" : "border border-rail-line text-rail-ink")
      }
      aria-label={`${c.principal} à traiter${retard ? `, dont ${c.enRetard} depuis plus de 2 jours ouvrés` : ""}`}
      title={retard ? `Dont ${c.enRetard} en attente depuis plus de 2 jours ouvrés` : undefined}
    >
      {c.principal > 99 ? "99+" : c.principal}
    </span>
  );
}

/**
 * À côté du titre « E-mails » : « 22 à traiter » (le chiffre de la vue affichée) et la part en
 * retard ; « Tout est traité » à 0. Un seul chiffre (Sekou, 29/10/2026) : plus de « Rien à
 * traiter pour vous » ni de « à répartir ».
 */
export function ChiffreTitre() {
  const c = useChiffreEcran();
  if (!c) return null;
  return (
    <span className="text-body text-ink-2 tabular-nums" aria-live="polite">
      {c.principal > 0 ? (
        <>
          <span className="text-title font-semibold text-ink">{c.principal}</span> à traiter
        </>
      ) : (
        "Tout est traité"
      )}
      {c.enRetard > 0 ? (
        <span className="text-err-700">
          {" "}
          · dont {c.enRetard} depuis plus de 2 jours
        </span>
      ) : null}
    </span>
  );
}
