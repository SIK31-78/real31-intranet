"use client";

// Résultats de la barre unique de « E-mails » quand on cherche dans TOUS les échanges (reçus
// et envoyés, toutes les boîtes qu'on a le droit de lire) : l'ancien écran « Échanges »,
// intégré (décision Sekou du 13/10/2026). Réutilise sa liste et sa lecture (pièces jointes,
// Outlook, rattachement à un dossier).

import Link from "next/link";
import { Search, X } from "lucide-react";
import { EchangesVue } from "@/components/echanges/echanges-vue";
import { critereDepuisRecherche, type EchangeTrouve } from "@/lib/domain/echanges";

export type Fouille = {
  saisie: string;
  enCours: boolean;
  erreur?: string;
  resultat?: {
    echanges: EchangeTrouve[];
    erreurs: string[];
    tronque: boolean;
    plusieursBoites: boolean;
    copro: string | null;
    adressesCopro: number | null;
  };
};

/** Lien vers la recherche avancée (dates, boîtes), pré-remplie avec la saisie. */
function lienAvance(saisie: string): string {
  const c = critereDepuisRecherche(saisie);
  const q = new URLSearchParams();
  if (c.copro) q.set("copro", c.copro);
  if (c.correspondant) q.set("qui", c.correspondant);
  if (c.mots) q.set("mots", c.mots);
  return `/echanges?${q.toString()}`;
}

export function ResultatsFouille({ fouille, onFermer }: { fouille: Fouille; onFermer: () => void }) {
  const r = fouille.resultat;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <Search strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-3" />
        <span className="text-ink">
          « {fouille.saisie} » dans tous les échanges, reçus et envoyés
          {r ? <span className="text-ink-3"> · {r.echanges.length} résultat{r.echanges.length > 1 ? "s" : ""}</span> : null}
          {r?.copro && r.adressesCopro !== null ? (
            <span className="text-ink-3"> · {r.adressesCopro} adresse{r.adressesCopro > 1 ? "s" : ""} connue{r.adressesCopro > 1 ? "s" : ""} pour {r.copro}</span>
          ) : null}
        </span>
        <Link href={lienAvance(fouille.saisie)} className="text-ink-3 underline hover:text-ink">
          recherche avancée
        </Link>
        <button
          type="button"
          onClick={onFermer}
          className="ml-auto inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-line bg-surface text-[12px] text-ink-2 hover:bg-surface-2"
        >
          <X strokeWidth={1.5} className="w-3.5 h-3.5" />
          Retour à la boîte
        </button>
      </div>

      {fouille.enCours && <p className="text-[12.5px] text-ink-3">Recherche en cours…</p>}
      {fouille.erreur && <p className="text-[12.5px] text-err-700">{fouille.erreur}</p>}
      {r?.erreurs.map((e) => (
        <p key={e} className="text-[12px] text-warn-700">
          {e}
        </p>
      ))}
      {r?.tronque && <p className="text-[12px] text-ink-3">Affichage limité aux plus récents : précisez (copro, personne, mot).</p>}
      {r && <EchangesVue key={fouille.saisie} echanges={r.echanges} plusieursBoites={r.plusieursBoites} {...(r.copro ? { coproParDefaut: r.copro } : {})} />}
    </div>
  );
}
