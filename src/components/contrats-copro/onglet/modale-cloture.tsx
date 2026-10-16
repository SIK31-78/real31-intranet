"use client";

// Clôturer un cycle (UN composant pour les quatre sujets) : la date de la terminale, puis ce
// que le sujet exige pour calculer l'échéance suivante (gaz : l'offre retenue et sa durée ;
// assurance : l'échéance saisie, l'offre facultative, le numéro de contrat ; CTQ : la date du
// contrôle, échéance à cinq ans). Re-clôture : seule l'échéance du cycle suivant bouge.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input, Select } from "@/components/ui/field";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import {
  DUREE_CTQ_ANNEES,
  etapeTerminale,
  LIBELLE_SUJET,
  LIBELLE_TYPE_PRIX_GAZ,
  plusAnnees,
  plusJours,
  plusMois,
  type Cycle,
  type OffreAssurance,
  type OffreGaz,
  type SujetSuivi,
} from "@/lib/domain/contrats-copro";
import { cloturerCycleAction } from "@/app/contrats-copro/actions";
import { euros, jour, ouNull } from "./commun";

export function ModaleCloture({
  coproCode,
  sujet,
  cycle,
  offresAssurance = [],
  offresGaz = [],
  compagnieActuelle,
  aujourdhuiISO,
  onFermer,
}: {
  coproCode: string;
  sujet: SujetSuivi;
  cycle: Cycle;
  /** Assurance : les offres du cycle (l'offre retenue est facultative). */
  offresAssurance?: OffreAssurance[];
  /** Gaz : les offres du cycle (l'offre retenue est obligatoire : sa durée fait l'échéance). */
  offresGaz?: OffreGaz[];
  compagnieActuelle?: string | null;
  aujourdhuiISO: string;
  onFermer: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirmer = useConfirm();
  const [pending, demarrer] = useTransition();
  const terminale = etapeTerminale(sujet);
  const dejaClos = cycle.statut === "clos";
  const [dateTerminale, setDateTerminale] = useState(cycle.etapes[terminale.cle] ?? aujourdhuiISO);
  const offresGazVivantes = offresGaz.filter((o) => !o.supprimeeLeISO);
  const offresAssVivantes = offresAssurance.filter((o) => !o.supprimeeLeISO);
  const [offreId, setOffreId] = useState<string>(cycle.offreRetenueId ?? (sujet === "gaz" && offresGazVivantes.length === 1 ? offresGazVivantes[0].id : ""));
  const [echeance, setEcheance] = useState("");
  const [numero, setNumero] = useState("");

  const estCtq = sujet === "ctq_ascenseur" || sujet === "ctq_vmc";
  const offreGaz = sujet === "gaz" ? offresGazVivantes.find((o) => o.id === offreId) : undefined;
  const demain = plusJours(aujourdhuiISO, 1);
  const dateOk = Boolean(dateTerminale) && dateTerminale <= aujourdhuiISO;

  let echeanceSuivante: string | null = null;
  if (estCtq && dateOk) echeanceSuivante = plusAnnees(dateTerminale, DUREE_CTQ_ANNEES);
  if (sujet === "gaz" && offreGaz && dateOk) echeanceSuivante = plusMois(dateTerminale, offreGaz.dureeMois);
  if (sujet === "assurance" && echeance && echeance >= demain) echeanceSuivante = echeance;

  const pret = dateOk && (sujet === "gaz" ? Boolean(offreGaz) : true) && (sujet === "assurance" ? Boolean(echeanceSuivante) : true);

  async function valider() {
    if (!pret) return;
    if (sujet === "assurance" && !dejaClos && !numero.trim()) {
      const ok = await confirmer({
        titre: "Clôturer sans numéro de contrat ?",
        message: "Le numéro du nouveau contrat pourra être saisi plus tard, par « Corriger » sur le contrat en cours.",
        confirmer: "Clôturer quand même",
      });
      if (!ok) return;
    }
    demarrer(async () => {
      const res = await cloturerCycleAction({
        coproCode,
        sujet,
        cycleId: cycle.id,
        dateTerminaleISO: dateTerminale,
        ...(sujet === "gaz" || sujet === "assurance" ? { offreRetenueId: offreId || null } : {}),
        ...(sujet === "assurance" ? { echeanceSaisieISO: echeance, numeroContrat: ouNull(numero) } : {}),
      });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(dejaClos ? `Clôture corrigée : échéance suivante le ${jour(echeanceSuivante)}.` : `Cycle clôturé, prochaine échéance le ${jour(echeanceSuivante)}.`);
      onFermer();
      router.refresh();
    });
  }

  const titre = `${dejaClos ? "Re-clôturer" : "Clôturer"} : ${LIBELLE_SUJET[sujet]}${cycle.ascenseurIdentifiant ? ` (${cycle.ascenseurIdentifiant})` : ""}`;

  return (
    <Modal titre={titre} onFermer={onFermer} size="sm">
      <ModalBody>
        <div className="flex flex-col gap-3">
          {dejaClos && <Callout ton="info">Seule l&rsquo;échéance du cycle suivant sera ajustée.</Callout>}

          <Field label={`${terminale.libelle} le`} htmlFor="clot-date" requis erreur={dateTerminale && !dateOk ? "Une étape ne se date pas dans le futur." : undefined}>
            <Input id="clot-date" type="date" max={aujourdhuiISO} value={dateTerminale} onChange={(e) => setDateTerminale(e.target.value)} autoFocus />
          </Field>

          {sujet === "gaz" && (
            <Field label="Offre retenue" htmlFor="clot-offre" requis hint={offreGaz ? `Durée ${offreGaz.dureeMois} mois, ${LIBELLE_TYPE_PRIX_GAZ[offreGaz.typePrix].toLowerCase()}, ${euros(offreGaz.montant)} par an.` : "L'échéance du contrat dépend de la durée de l'offre."}>
              <Select id="clot-offre" value={offreId} onChange={(e) => setOffreId(e.target.value)}>
                <option value="">Choisir…</option>
                {offresGazVivantes.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.fournisseur} : {euros(o.montant)}, {o.dureeMois} mois
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {sujet === "assurance" && (
            <>
              <Field label="Offre retenue" htmlFor="clot-offre">
                <Select id="clot-offre" value={offreId} onChange={(e) => setOffreId(e.target.value)}>
                  <option value="">Reconduction chez l&rsquo;assureur actuel{compagnieActuelle ? ` (${compagnieActuelle})` : ""}</option>
                  {offresAssVivantes.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.assureur} : prime {euros(o.prime)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Échéance du nouveau contrat" htmlFor="clot-echeance" requis erreur={echeance && echeance < demain ? "L'échéance doit être dans le futur." : undefined}>
                <Input id="clot-echeance" type="date" min={demain} value={echeance} onChange={(e) => setEcheance(e.target.value)} />
              </Field>
              <Field label="Numéro du nouveau contrat" htmlFor="clot-numero" hint="Facultatif, à saisir dès qu'il est connu.">
                <Input id="clot-numero" value={numero} onChange={(e) => setNumero(e.target.value)} autoComplete="off" />
              </Field>
            </>
          )}

          {estCtq && dateOk && echeanceSuivante && (
            <p className="text-body text-ink-2">
              L&rsquo;échéance suivante sera le <strong className="font-medium text-ink">{jour(echeanceSuivante)}</strong> (dans {DUREE_CTQ_ANNEES} ans).
            </p>
          )}
          {!estCtq && !dejaClos && echeanceSuivante && (
            <p className="text-body text-ink-2">
              Le cycle est clos et un nouveau cycle s&rsquo;ouvre avec l&rsquo;échéance du <strong className="font-medium text-ink">{jour(echeanceSuivante)}</strong>.
            </p>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onFermer}>
          Annuler
        </Button>
        <Button variant="primary" loading={pending} disabled={!pret} onClick={valider}>
          <CheckCircle2 strokeWidth={1.5} /> {dejaClos ? "Re-clôturer" : "Clôturer"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
