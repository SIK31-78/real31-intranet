"use client";

// Bandeau « nouvelle version » (REA-312). Un onglet resté ouvert pendant une mise en ligne
// garde l'ancien code : au-delà de la Skew Protection de Vercel, ses enregistrements
// échouent. On compare la version de l'onglet à celle en ligne quand on revient sur
// l'onglet et toutes les 5 minutes, et on prévient.
// Rechargement automatique (19/10/2026) : seulement quand on REVIENT sur un onglet resté
// caché au moins une minute, sans saisie en cours ni fenêtre ouverte (cf. rechargerTout).
// Sous les yeux de quelqu'un, ou avec un texte commencé, on prévient seulement.

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { estErreurVersionPerimee, rechargerTout, versionChangee, VERSION_INCONNUE } from "@/lib/domain/version-app";

const VERSION_ONGLET = process.env.NEXT_PUBLIC_VERSION_APP ?? VERSION_INCONNUE;
const INTERVALLE_MS = 5 * 60 * 1000;
const EVENEMENT = "real31:version-perimee";

/** À appeler quand un enregistrement a échoué parce que l'onglet est périmé. */
export function signalerVersionPerimee(): void {
  window.dispatchEvent(new Event(EVENEMENT));
}

type Etat = "a-jour" | "nouvelle" | "perimee";

/** Un texte commencé quelque part dans la page (champ, zone de texte, éditeur). */
function saisieEnCours(): boolean {
  for (const el of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("textarea, input:not([type]), input[type=text], input[type=email], input[type=search]")) {
    if (el.value !== el.defaultValue) return true;
  }
  for (const el of document.querySelectorAll<HTMLElement>("[contenteditable=true], [contenteditable='']")) {
    if ((el.textContent ?? "").trim()) return true;
  }
  return false;
}

/** Une fenêtre (modale) ouverte : on ne la ferme pas d'autorité. */
function fenetreOuverte(): boolean {
  return document.querySelector("dialog[open], [role=dialog], [aria-modal=true]") !== null;
}

export function BandeauNouvelleVersion() {
  const [etat, setEtat] = useState<Etat>("a-jour");

  useEffect(() => {
    let arrete = false;
    // Depuis quand l'onglet est caché (0 = visible).
    let cacheDepuis = document.visibilityState === "hidden" ? Date.now() : 0;
    async function verifier() {
      if (document.visibilityState !== "visible") {
        if (!cacheDepuis) cacheDepuis = Date.now();
        return;
      }
      const absence = cacheDepuis ? Date.now() - cacheDepuis : 0;
      cacheDepuis = 0;
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        if (!r.ok) return;
        const { version } = (await r.json()) as { version?: string };
        const nouvelle = versionChangee(VERSION_ONGLET, version);
        if (!arrete && rechargerTout({ nouvelleVersion: nouvelle, cacheDepuisMs: absence, saisieEnCours: saisieEnCours(), fenetreOuverte: fenetreOuverte() })) {
          window.location.reload();
          return;
        }
        if (!arrete && nouvelle) {
          setEtat((e) => (e === "perimee" ? e : "nouvelle"));
        }
      } catch {
        // Réseau coupé : on réessaiera au prochain passage.
      }
    }
    const surPerimee = () => setEtat("perimee");
    const surRejet = (ev: PromiseRejectionEvent) => {
      if (estErreurVersionPerimee(ev.reason)) setEtat("perimee");
    };
    const minuterie = setInterval(verifier, INTERVALLE_MS);
    document.addEventListener("visibilitychange", verifier);
    window.addEventListener(EVENEMENT, surPerimee);
    window.addEventListener("unhandledrejection", surRejet);
    return () => {
      arrete = true;
      clearInterval(minuterie);
      document.removeEventListener("visibilitychange", verifier);
      window.removeEventListener(EVENEMENT, surPerimee);
      window.removeEventListener("unhandledrejection", surRejet);
    };
  }, []);

  if (etat === "a-jour") return null;
  const perimee = etat === "perimee";
  return (
    <div
      role={perimee ? "alert" : "status"}
      className={
        perimee
          ? "fixed top-3 left-1/2 z-[60] -translate-x-1/2 flex items-center gap-3 rounded-lg border border-err-500/30 bg-err-50 px-4 py-2.5 text-body text-err-700 shadow-2 max-w-[calc(100vw-2rem)]"
          : "fixed top-3 left-1/2 z-[60] -translate-x-1/2 flex items-center gap-3 rounded-lg border border-info-500/30 bg-info-50 px-4 py-2.5 text-body text-info-700 shadow-2 max-w-[calc(100vw-2rem)]"
      }
    >
      <RefreshCw strokeWidth={1.5} className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>
        {perimee ? (
          <>
            <strong className="font-medium">La page a été mise à jour</strong> : votre dernière modification n&apos;a pas
            été enregistrée. Copiez-la si besoin, puis actualisez.
          </>
        ) : (
          <>
            <strong className="font-medium">Une nouvelle version de real31.app est en ligne</strong>. Enregistrez votre
            travail, puis actualisez.
          </>
        )}
      </span>
      <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
        Actualiser
      </Button>
    </div>
  );
}
