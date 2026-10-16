"use client";

// Une section de suivi pour un sujet porté par la copro (assurance, gaz, VMC gaz) : le cycle
// en cours et ses étapes, les offres ou devis, les documents, l'historique replié ; à droite,
// le contrat courant. Un sujet non concerné se replie en une ligne, avec de quoi corriger.

import type { ReactNode } from "react";
import { ClipboardList } from "lucide-react";
import { Callout } from "@/components/ui/callout";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Section } from "@/components/ui/section";
import { SectionRepliable } from "@/components/ui/section-repliable";
import { DUREE_CTQ_ANNEES, LIBELLE_SUJET, plusAnnees, type DonneesOffresMailCs, type OffreAssurance, type OffreGaz } from "@/lib/domain/contrats-copro";
import type { EntrepriseMetier } from "@/lib/services/contrats-copro/prestataires";
import type { SuiviCopro } from "@/lib/services/contrats-copro/types";
import { cyclesEnCours, cyclesPasses, pluriel } from "./commun";
import { BoutonCompteurs, ContratCourantCarte } from "./contrat-courant";
import { CycleBloc } from "./cycle-bloc";
import { BoutonDemarrerSuivi } from "./demarrer-suivi";
import { DevisSujet } from "./devis";
import { DocumentsSujet, type CibleDepot } from "./documents";
import { BoutonMailCs } from "./mail-cs";
import { OffresCycle } from "./offres";

type SujetSimple = "assurance" | "gaz" | "ctq_vmc";

function nomOffreAssurance(offres: OffreAssurance[], id: string | null | undefined): string | null {
  return id ? (offres.find((o) => o.id === id)?.assureur ?? null) : null;
}
function nomOffreGaz(offres: OffreGaz[], id: string | null | undefined): string | null {
  return id ? (offres.find((o) => o.id === id)?.fournisseur ?? null) : null;
}

export function SectionSujet({ suivi, sujet, courtiers, aujourdhuiISO }: { suivi: SuiviCopro; sujet: SujetSimple; courtiers: EntrepriseMetier[]; aujourdhuiISO: string }) {
  const { coproCode, peutEcrire, contrat } = suivi;
  const id = `contrats-${sujet}`;
  const titre = LIBELLE_SUJET[sujet];
  const data = sujet === "assurance" ? suivi.assurance : sujet === "gaz" ? suivi.gaz : suivi.ctqVmc;
  const enCours = cyclesEnCours(data.cycles);
  const passes = cyclesPasses(data.cycles);
  const courant = enCours[0];

  const compteursLigne: ReactNode =
    sujet === "gaz" ? (
      <LigneCompteur libelle={contrat.compteurs.chaudieres === null ? "Chaudières : jamais renseigné" : pluriel(contrat.compteurs.chaudieres, "chaudière") + (contrat.energieChauffage ? `, chauffage ${contrat.energieChauffage.toLowerCase()}` : "")} action={<BoutonCompteurs coproCode={coproCode} contrat={contrat} peutEcrire={peutEcrire} />} />
    ) : sujet === "ctq_vmc" ? (
      <LigneCompteur libelle={contrat.compteurs.vmcGaz === null ? "VMC gaz : jamais renseigné" : `${pluriel(contrat.compteurs.vmcGaz, "VMC gaz", "VMC gaz")} déclarée${contrat.compteurs.vmcGaz > 1 ? "s" : ""}`} action={<BoutonCompteurs coproCode={coproCode} contrat={contrat} peutEcrire={peutEcrire} />} />
    ) : undefined;

  const carteContrat = <ContratCourantCarte coproCode={coproCode} sujet={sujet} contrat={contrat} peutEcrire={peutEcrire} courtiers={courtiers} compteurs={compteursLigne} />;

  const historique = passes.length > 0 && (
    <SectionRepliable id={`${id}-historique`} titre="Historique" compte={passes.length}>
      <div className="flex flex-col gap-3">
        {passes.map((v) => (
          <CycleBloc
            key={v.cycle.id}
            coproCode={coproCode}
            sujet={sujet}
            vue={v}
            peutEcrire={peutEcrire}
            aujourdhuiISO={aujourdhuiISO}
            offresAssurance={sujet === "assurance" ? suivi.assurance.offres.filter((o) => o.cycleId === v.cycle.id) : undefined}
            offresGaz={sujet === "gaz" ? suivi.gaz.offres.filter((o) => o.cycleId === v.cycle.id) : undefined}
            compagnieActuelle={contrat.assurance.compagnie}
            offreRetenueNom={sujet === "assurance" ? nomOffreAssurance(suivi.assurance.offres, v.cycle.offreRetenueId) : sujet === "gaz" ? nomOffreGaz(suivi.gaz.offres, v.cycle.offreRetenueId) : null}
          />
        ))}
      </div>
    </SectionRepliable>
  );

  // --- Non concerné : une ligne repliée, de quoi corriger ----------------------------------
  if (!data.concerne) {
    let raison: string;
    if (sujet === "assurance") {
      raison = `Suivi archivé : le courtier ${contrat.assurance.courtier ?? "partenaire"} s'en charge.`;
    } else if (sujet === "gaz") {
      const n = contrat.compteurs.chaudieres;
      const energie = contrat.energieChauffage;
      raison = n === null ? "Nombre de chaudières jamais renseigné" : `${pluriel(n, "chaudière")} déclarée${n > 1 ? "s" : ""}`;
      if (n && energie !== "GAZ") raison += energie ? `, chauffage ${energie.toLowerCase()}` : ", énergie de chauffage inconnue";
    } else {
      const n = contrat.compteurs.vmcGaz;
      raison = n === null ? "Nombre de VMC gaz jamais renseigné" : `${n} VMC gaz déclarée${n > 1 ? "s" : ""}`;
    }
    return (
      <SectionRepliable id={id} titre={titre} resume="Non concerné">
        <div className="flex flex-col gap-3">
          <Callout ton="neutral" titre="Non concerné" actions={sujet !== "assurance" ? <BoutonCompteurs coproCode={coproCode} contrat={contrat} peutEcrire={peutEcrire} /> : undefined}>
            {raison}
          </Callout>
          {sujet === "assurance" && <div className="max-w-md">{carteContrat}</div>}
          {historique}
        </div>
      </SectionRepliable>
    );
  }

  // --- Concerné -------------------------------------------------------------------------------
  const donneesMail: DonneesOffresMailCs =
    sujet === "assurance"
      ? { offresAssurance: suivi.assurance.offres.filter((o) => !courant || o.cycleId === courant.cycle.id), offreRetenueId: courant?.cycle.offreRetenueId ?? null }
      : sujet === "gaz"
        ? { offresGaz: suivi.gaz.offres.filter((o) => !courant || o.cycleId === courant.cycle.id), offreRetenueId: courant?.cycle.offreRetenueId ?? null }
        : { devis: suivi.ctqVmc.devis, devisRetenuId: suivi.ctqVmc.devisRetenuId };
  const nbPropositions = [...(donneesMail.offresAssurance ?? []), ...(donneesMail.offresGaz ?? []), ...(donneesMail.devis ?? [])].filter((x) => !x.supprimeeLeISO).length;

  const cibles: CibleDepot[] = [{ type: "copro", id: coproCode, libelle: "La copropriété" }];
  if (sujet === "assurance" && courant) cibles.push({ type: "cycle_assurance", id: courant.cycle.id, libelle: "Le cycle en cours" });
  for (const o of donneesMail.offresAssurance ?? []) if (!o.supprimeeLeISO) cibles.push({ type: "offre_assurance", id: o.id, libelle: `Offre ${o.assureur}` });
  for (const o of donneesMail.offresGaz ?? []) if (!o.supprimeeLeISO) cibles.push({ type: "offre_gaz", id: o.id, libelle: `Offre ${o.fournisseur}` });
  for (const d of donneesMail.devis ?? []) if (!d.supprimeeLeISO) cibles.push({ type: "devis_ctq", id: d.id, libelle: `Devis ${d.prestataire}` });

  const echeanceDemarrage = sujet === "assurance" ? contrat.assurance.echeanceISO : sujet === "gaz" ? contrat.gaz.echeanceISO : contrat.vmc.dernierCtqISO ? plusAnnees(contrat.vmc.dernierCtqISO, DUREE_CTQ_ANNEES) : null;

  return (
    <Section id={id} titre={titre} actions={peutEcrire && suivi.mailActif && nbPropositions > 0 ? <BoutonMailCs coproCode={coproCode} sujet={sujet} donnees={donneesMail} /> : undefined}>
      <div className="grid grid-cols-1 gap-4 items-start lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-4 min-w-0">
          {enCours.length === 0 ? (
            <Card>
              <CardBody>
                <EmptyState icone={ClipboardList} action={peutEcrire ? <BoutonDemarrerSuivi coproCode={coproCode} sujet={sujet} echeanceISO={echeanceDemarrage} size="md" /> : undefined}>
                  Aucun suivi en cours
                </EmptyState>
              </CardBody>
            </Card>
          ) : (
            enCours.map((v) => (
              <CycleBloc
                key={v.cycle.id}
                coproCode={coproCode}
                sujet={sujet}
                vue={v}
                peutEcrire={peutEcrire}
                aujourdhuiISO={aujourdhuiISO}
                offresAssurance={sujet === "assurance" ? suivi.assurance.offres.filter((o) => o.cycleId === v.cycle.id) : undefined}
                offresGaz={sujet === "gaz" ? suivi.gaz.offres.filter((o) => o.cycleId === v.cycle.id) : undefined}
                compagnieActuelle={contrat.assurance.compagnie}
              />
            ))
          )}

          {sujet === "assurance" && courant && !courant.aDemarrer && (
            <OffresCycle sujet="assurance" coproCode={coproCode} cycle={courant.cycle} offres={suivi.assurance.offres.filter((o) => o.cycleId === courant.cycle.id)} peutEcrire={peutEcrire} aujourdhuiISO={aujourdhuiISO} />
          )}
          {sujet === "gaz" && courant && !courant.aDemarrer && (
            <OffresCycle sujet="gaz" coproCode={coproCode} cycle={courant.cycle} offres={suivi.gaz.offres.filter((o) => o.cycleId === courant.cycle.id)} peutEcrire={peutEcrire} aujourdhuiISO={aujourdhuiISO} />
          )}
          {sujet === "ctq_vmc" && <DevisSujet coproCode={coproCode} sujet="ctq_vmc" devis={suivi.ctqVmc.devis} devisRetenuId={suivi.ctqVmc.devisRetenuId} peutEcrire={peutEcrire} aujourdhuiISO={aujourdhuiISO} />}

          <DocumentsSujet coproCode={coproCode} sujet={sujet} documents={data.documents} peutEcrire={peutEcrire} depotActif={suivi.depotActif} cibles={cibles} />

          {historique}
        </div>
        {carteContrat}
      </div>
    </Section>
  );
}

function LigneCompteur({ libelle, action }: { libelle: string; action: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-line pt-2 text-meta text-ink-2">
      <span>{libelle}</span>
      {action}
    </div>
  );
}
