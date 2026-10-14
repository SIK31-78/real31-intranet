"use client";

// Les choix du contrat de l'offre (AG, debut, duree), recalcules A LA SAISIE. Avant : un
// bouton « Recalculer » et des champs non controles ; une date changee sans cliquer etait
// ignoree en silence par le PDF, l'apercu et l'envoi (remontee du 14/10/2026). Ici chaque
// changement valide repart dans l'URL (court delai anti-rebond), et la page serveur
// recalcule tout : contrat, mail, liens du PDF.
//
// Un champ PAS TOUCHE affiche ce que le serveur a calcule (le debut suit l'AG) et reste
// hors de l'URL ; un champ touche y va tel quel, VIDE compris : vide = date en blanc sur
// le contrat (cf. lireOptionsOffre).

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { DUREE_MAX_CONTRAT_MOIS, DUREES_CONTRAT_MOIS } from "@/lib/domain/contrat/cycle-contrat";
import { Field, Input } from "@/components/ui/field";
import type { ParamsOffre } from "./options";

const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const DELAI_MS = 400;

type Cle = "ag" | "debut" | "duree";

export function ChoixCycle({
  base,
  saisis,
  calcules,
}: {
  /** L'adresse de la page, sans query. */
  base: string;
  /** Les choix tels qu'ils sont dans l'URL (absents = laisses au calcul). */
  saisis: ParamsOffre;
  /** Ce que le serveur a retenu pour chaque champ, a afficher tant qu'il n'est pas touche. */
  calcules: { ag: string; debut: string; duree: string };
}) {
  const router = useRouter();
  const [recalcul, demarrer] = useTransition();
  // Ce que la personne a saisi ; un champ deja dans l'URL compte comme saisi.
  const [touches, setTouches] = useState<Partial<Record<Cle, string>>>(() =>
    Object.fromEntries((["ag", "debut", "duree"] as const).filter((k) => saisis[k] !== undefined).map((k) => [k, saisis[k]!])),
  );
  const valeur = (k: Cle) => touches[k] ?? calcules[k];
  const changer = (k: Cle, v: string) => setTouches((t) => ({ ...t, [k]: v }));

  const duree = valeur("duree");
  const dureeValide = duree === "" || (/^\d+$/.test(duree) && Number(duree) >= 1 && Number(duree) <= DUREE_MAX_CONTRAT_MOIS);
  const valide = dureeValide && (["ag", "debut"] as const).every((k) => valeur(k) === "" || JOUR.test(valeur(k)));
  const query = new URLSearchParams(Object.entries(touches) as [string, string][]).toString();
  const cible = query ? `${base}?${query}` : base;

  useEffect(() => {
    if (!valide) return;
    const actuelle = new URLSearchParams(window.location.search).toString();
    if (actuelle === query) return;
    const t = setTimeout(() => demarrer(() => router.replace(cible, { scroll: false })), DELAI_MS);
    return () => clearTimeout(t);
  }, [cible, query, valide, router]);

  return (
    <>
      <Field label="AG qui votera le contrat" htmlFor="o-ag" hint="vide : en blanc sur le contrat, à compléter">
        <Input id="o-ag" type="date" value={valeur("ag")} onChange={(e) => changer("ag", e.target.value)} />
      </Field>
      <Field label="Début du mandat" htmlFor="o-debut" hint="lendemain de la fin du mandat en place, sinon le jour de l'AG ; vide : en blanc">
        <Input id="o-debut" type="date" value={valeur("debut")} onChange={(e) => changer("debut", e.target.value)} />
      </Field>
      {/* Duree libre en mois, 3 ans au plus (art. 28 du decret de 1967), comme sur
          /contrat ; les trois durees courantes en suggestions. */}
      <Field
        label="Durée (mois)"
        htmlFor="o-duree"
        hint={`1 an = 12, 2 ans = 24, 15 mois pour une reprise ; ${DUREE_MAX_CONTRAT_MOIS} au plus`}
        erreur={dureeValide ? undefined : `Entre 1 et ${DUREE_MAX_CONTRAT_MOIS} mois.`}
      >
        <Input id="o-duree" type="number" min={1} max={DUREE_MAX_CONTRAT_MOIS} step={1} value={duree} onChange={(e) => changer("duree", e.target.value)} list="o-durees" className="tabular-nums" />
        <datalist id="o-durees">
          {DUREES_CONTRAT_MOIS.map((d) => <option key={d.mois} value={d.mois}>{d.libelle}</option>)}
        </datalist>
      </Field>
      {recalcul && (
        <p className="text-meta text-ink-3 flex items-center gap-1.5" aria-live="polite">
          <Loader2 strokeWidth={1.5} className="h-3.5 w-3.5 animate-spin" /> Recalcul du contrat…
        </p>
      )}
    </>
  );
}
