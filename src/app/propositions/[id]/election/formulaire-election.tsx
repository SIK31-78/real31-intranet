"use client";

// Le formulaire d'election : ce qu'on relit avant de creer (code, nom court, agence,
// gestionnaire, contrat) et ce qu'on declenche (client Pennylane, dossier de reprise).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2 } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input, Select, Choix } from "@/components/ui/field";
import { DataList, DataRow } from "@/components/ui/data-list";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { DUREES_CONTRAT_MOIS, finDeCycle } from "@/lib/domain/contrat/cycle-contrat";
import { formatJour } from "@/lib/services/facturation/format";
import { elirePropositionAction } from "@/app/propositions/actions";

export function FormulaireElection({
  propositionId,
  codePropose,
  nomPropose,
  debutProposeISO,
  agences,
  gestionnaires,
  agenceParDefaut,
  gestionnaireParDefaut,
  immeuble,
  prix,
  pennylaneDisponible,
}: {
  propositionId: string;
  codePropose: string;
  nomPropose: string;
  debutProposeISO: string;
  agences: { id: string; code: string }[];
  gestionnaires: { id: string; nomComplet: string }[];
  agenceParDefaut?: string;
  gestionnaireParDefaut?: string;
  immeuble: { adresse: string; codePostal?: string; commune?: string; immatriculation?: string; lots?: number; stationnements?: number; syndicActuel?: string };
  prix: { honorairesTtc?: number; fraisPostauxReels: boolean; timbresTtc?: number };
  pennylaneDisponible: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirmer = useConfirm();
  const [pending, demarrer] = useTransition();
  const [code, setCode] = useState(codePropose);
  const [nom, setNom] = useState(nomPropose);
  const [debut, setDebut] = useState(debutProposeISO);
  const [duree, setDuree] = useState(12);
  const [agenceId, setAgenceId] = useState(agenceParDefaut ?? "");
  const [managerId, setManagerId] = useState(gestionnaireParDefaut ?? "");
  const [pennylane, setPennylane] = useState(pennylaneDisponible);
  const [reprise, setReprise] = useState(true);
  const [etapes, setEtapes] = useState<string[] | null>(null);
  const fin = /^\d{4}-\d{2}-\d{2}$/.test(debut) ? finDeCycle(debut, duree) : "";

  async function creer() {
    const ok = await confirmer({
      titre: `Créer la copropriété ${code.toUpperCase()} ?`,
      message: `${nom} — ${immeuble.adresse}. Fiche dans le référentiel, contrat du ${formatJour(debut)} au ${fin ? formatJour(fin) : "?"}${pennylane ? ", client Pennylane" : ""}${reprise ? ", dossier de reprise" : ""}. Une fiche créée ne se supprime pas d'ici.`,
      confirmer: "Créer",
    });
    if (!ok) return;
    demarrer(async () => {
      const res = await elirePropositionAction({ id: propositionId, code: code.trim().toUpperCase(), nomUsuel: nom, debutISO: debut, dureeMois: duree, agenceId: agenceId || undefined, managerId: managerId || undefined, creerClientPennylane: pennylane, ouvrirDossierReprise: reprise });
      if (!res.ok) return toast.err(res.erreur);
      setEtapes(res.donnees?.etapes ?? []);
      toast.ok(`Copropriété ${res.donnees?.coproCode} créée.`);
      router.refresh();
    });
  }

  if (etapes) {
    return (
      <Callout ton="ok" titre="C'est fait">
        <ul className="list-disc pl-5">{etapes.map((e, i) => <li key={i}>{e}</li>)}</ul>
      </Callout>
    );
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-5">
        <DataList align="left">
          <DataRow label="Immeuble">{immeuble.adresse}{immeuble.codePostal || immeuble.commune ? `, ${immeuble.codePostal ?? ""} ${immeuble.commune ?? ""}` : ""}</DataRow>
          <DataRow label="Registre">{immeuble.immatriculation ?? "non rattaché"}</DataRow>
          <DataRow label="Lots">{immeuble.lots ?? "?"} principaux{immeuble.stationnements ? ` · ${immeuble.stationnements} stationnements` : ""}</DataRow>
          <DataRow label="Honoraires">{prix.honorairesTtc !== undefined ? `${prix.honorairesTtc.toLocaleString("fr-FR")} € TTC par an` : "—"} · frais postaux {prix.fraisPostauxReels ? "au réel" : `forfait ${prix.timbresTtc?.toLocaleString("fr-FR") ?? "?"} €`}</DataRow>
          {immeuble.syndicActuel && <DataRow label="Syndic sortant">{immeuble.syndicActuel}</DataRow>}
        </DataList>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Code" htmlFor="el-code" hint="prochain libre proposé"><Input id="el-code" value={code} onChange={(e) => setCode(e.target.value)} className="font-mono uppercase" /></Field>
          <Field label="Nom court" htmlFor="el-nom" className="col-span-2 sm:col-span-1"><Input id="el-nom" value={nom} onChange={(e) => setNom(e.target.value)} className="uppercase" /></Field>
          <Field label="Agence" htmlFor="el-agence">
            <Select id="el-agence" value={agenceId} onChange={(e) => setAgenceId(e.target.value)}>
              <option value="">—</option>
              {agences.map((a) => <option key={a.id} value={a.id}>{a.code}</option>)}
            </Select>
          </Field>
          <Field label="Gestionnaire" htmlFor="el-gest">
            <Select id="el-gest" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
              <option value="">—</option>
              {gestionnaires.map((x) => <option key={x.id} value={x.id}>{x.nomComplet}</option>)}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Prise en gestion" htmlFor="el-debut" hint="= début du contrat"><Input id="el-debut" type="date" value={debut} onChange={(e) => setDebut(e.target.value)} /></Field>
          <Field label="Durée" htmlFor="el-duree">
            <Select id="el-duree" value={String(duree)} onChange={(e) => setDuree(Number(e.target.value))}>
              {DUREES_CONTRAT_MOIS.map((d) => <option key={d.mois} value={d.mois}>{d.libelle}</option>)}
            </Select>
          </Field>
          <Field label="Fin du mandat" htmlFor="el-fin"><Input id="el-fin" value={fin ? formatJour(fin) : ""} readOnly className="tabular-nums" /></Field>
        </div>

        <div className="flex flex-col gap-2">
          <Choix type="checkbox" label={pennylaneDisponible ? "Créer le client Pennylane (SDC … - code), factures adressées au gestionnaire" : "Créer le client Pennylane — clé API absente ici, rien ne partira"} checked={pennylane} onChange={(e) => setPennylane(e.target.checked)} disabled={!pennylaneDisponible} />
          <Choix type="checkbox" label="Ouvrir le dossier de reprise (checklist d'équipe, datée de la prise en gestion)" checked={reprise} onChange={(e) => setReprise(e.target.checked)} />
        </div>

        <div className="flex justify-end">
          <Button type="button" variant="primary" disabled={pending || !code.trim() || !nom.trim() || !fin} onClick={creer}>
            {pending ? <Loader2 strokeWidth={1.5} className="animate-spin" /> : <Building2 strokeWidth={1.5} />} Créer la copropriété
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
