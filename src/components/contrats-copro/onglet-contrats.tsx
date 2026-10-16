"use client";

// L'onglet « Contrats » de la fiche copropriété (module « Contrats & contrôles », REA-333) :
// le bandeau des quatre sujets, une section par sujet concerné (cycle en cours, étapes,
// offres ou devis, documents, contrat courant, historique), les prestataires, la fiche
// immeuble et le journal. Les données arrivent lues par la page (suiviDeCopro) ; chaque geste
// passe par une Server Action puis rafraîchit la page.

import { Journal } from "@/components/ui/journal";
import { Section } from "@/components/ui/section";
import { texteJournal, type FicheImmeuble, type MetierPrestataire } from "@/lib/domain/contrats-copro";
import type { EntrepriseMetier } from "@/lib/services/contrats-copro/prestataires";
import type { SuiviCopro } from "@/lib/services/contrats-copro/types";
import { SectionImmeuble } from "./section-immeuble";
import { BandeauContrats } from "./onglet/bandeau";
import { SectionAscenseurs } from "./onglet/section-ascenseurs";
import { SectionPrestataires } from "./onglet/section-prestataires";
import { SectionSujet } from "./onglet/section-sujet";

export function OngletContrats({
  suivi,
  immeuble,
  entreprisesParMetier,
  aujourdhuiISO,
}: {
  suivi: SuiviCopro;
  immeuble: FicheImmeuble;
  entreprisesParMetier: Record<MetierPrestataire, EntrepriseMetier[]>;
  aujourdhuiISO: string;
}) {
  const courtiers = entreprisesParMetier.courtier ?? [];
  // Le journal arrive du plus récent au plus ancien ; <Journal> inverse lui-même sa liste.
  const entrees = [...suivi.journal].reverse().map((e) => ({ quandISO: e.horodatageISO, par: e.parNom, texte: texteJournal(e) }));

  return (
    <div className="flex flex-col gap-6">
      <BandeauContrats suivi={suivi} />
      <SectionSujet suivi={suivi} sujet="assurance" courtiers={courtiers} aujourdhuiISO={aujourdhuiISO} />
      <SectionSujet suivi={suivi} sujet="gaz" courtiers={courtiers} aujourdhuiISO={aujourdhuiISO} />
      <SectionAscenseurs suivi={suivi} aujourdhuiISO={aujourdhuiISO} />
      <SectionSujet suivi={suivi} sujet="ctq_vmc" courtiers={courtiers} aujourdhuiISO={aujourdhuiISO} />
      <SectionPrestataires coproCode={suivi.coproCode} prestataires={suivi.prestataires} entreprisesParMetier={entreprisesParMetier} peutEcrire={suivi.peutEcrire} />
      <SectionImmeuble coproCode={suivi.coproCode} fiche={immeuble} peutEcrire={suivi.peutEcrire} />
      <Section id="contrats-historique" titre="Historique" compte={entrees.length || undefined}>
        <Journal entrees={entrees} />
      </Section>
    </div>
  );
}
