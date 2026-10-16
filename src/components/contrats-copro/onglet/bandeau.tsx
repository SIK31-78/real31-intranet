"use client";

// Le bandeau de l'onglet « Contrats » : quatre chiffres-clés, un par sujet. La valeur est
// l'échéance la plus proche, la note dit le niveau (figé / en cours / chez le courtier).

import { Card, CardBody } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { LIBELLE_SUJET, pireNiveau, SUJETS, type SujetSuivi } from "@/lib/domain/contrats-copro";
import type { CycleVue, SuiviCopro } from "@/lib/services/contrats-copro/types";
import { cyclesEnCours, echeanceLaPlusProche, jour, texteNiveau, tonStat } from "./commun";

export function vuesDuSujet(suivi: SuiviCopro, sujet: SujetSuivi): CycleVue[] {
  switch (sujet) {
    case "assurance":
      return suivi.assurance.cycles;
    case "gaz":
      return suivi.gaz.cycles;
    case "ctq_ascenseur":
      return suivi.ctqAscenseur.appareils.flatMap((a) => a.cycles);
    case "ctq_vmc":
      return suivi.ctqVmc.cycles;
  }
}

export function sujetConcerne(suivi: SuiviCopro, sujet: SujetSuivi): boolean {
  switch (sujet) {
    case "assurance":
      return suivi.assurance.concerne;
    case "gaz":
      return suivi.gaz.concerne;
    case "ctq_ascenseur":
      return suivi.ctqAscenseur.concerne;
    case "ctq_vmc":
      return suivi.ctqVmc.concerne;
  }
}

function StatSujet({ suivi, sujet }: { suivi: SuiviCopro; sujet: SujetSuivi }) {
  const label = LIBELLE_SUJET[sujet];
  if (!sujetConcerne(suivi, sujet)) {
    if (sujet === "assurance" && suivi.assurance.courtierPartenaire) {
      return <Stat label={label} valeur={jour(suivi.contrat.assurance.echeanceISO, "suivi archivé")} note={`chez le courtier ${suivi.contrat.assurance.courtier ?? ""}`.trim()} />;
    }
    return <Stat label={label} valeur={<span className="text-ink-3">non concerné</span>} />;
  }
  const enCours = cyclesEnCours(vuesDuSujet(suivi, sujet));
  if (enCours.length === 0) {
    const echeance = sujet === "assurance" ? suivi.contrat.assurance.echeanceISO : sujet === "gaz" ? suivi.contrat.gaz.echeanceISO : null;
    return <Stat label={label} valeur={jour(echeance, "à compléter")} note="suivi à démarrer" />;
  }
  const pire = pireNiveau(enCours.map((v) => v.niveau));
  const temoin = enCours.find((v) => v.niveau === pire) ?? enCours[0];
  return <Stat label={label} valeur={jour(echeanceLaPlusProche(enCours), "à compléter")} note={texteNiveau(temoin)} ton={tonStat(temoin.niveau)} />;
}

export function BandeauContrats({ suivi }: { suivi: SuiviCopro }) {
  return (
    <Card>
      <CardBody className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
        {SUJETS.map((sujet) => (
          <StatSujet key={sujet} suivi={suivi} sujet={sujet} />
        ))}
      </CardBody>
    </Card>
  );
}
