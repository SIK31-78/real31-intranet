"use client";

// Les 16 autres prestations du contrat, en UN formulaire (Sekou, 15/09/2026 : « visible
// dans facturation mais pas noyé, bien rangé, ce n'est pas des facturations qu'on fait
// tous les jours »). Replié sous les cinq onglets du quotidien ; la prestation choisie
// dicte ce qu'on saisit : rien (fixe), des lots (pré-remplis depuis la fiche), des
// copropriétaires, ou des heures avec l'urgence.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Choix } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { ApercuFacturation } from "@/lib/services/facturation/apercu";
import type { ModeEmissionFacture } from "@/lib/domain/facturation/mode-emission";
import {
  GROUPES_PRESTATION,
  LIBELLE_GROUPE,
  PRESTATIONS_CONTRAT,
  prestationContrat,
} from "@/lib/domain/facturation/prestations-contrat";
import { ConfirmationFacturation } from "./confirmation-facturation";
import {
  apercuPrestationContratAction,
  contextePrestationContratAction,
  creerFacturePrestationContratAction,
} from "@/app/facturation/actions";


import { formatEuros } from "@/lib/domain/format-montant";
export function FormulairePrestationContrat({
  copros,
  pennylaneMode,
}: {
  copros: { code: string; nom: string }[];
  pennylaneMode: ModeEmissionFacture;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [coproCode, setCoproCode] = useState("");
  const [code, setCode] = useState("");
  const [quantite, setQuantite] = useState("");
  const [urgence, setUrgence] = useState(false);
  const [nomClient, setNomClient] = useState("");
  const [objet, setObjet] = useState("");
  const [date, setDate] = useState("");
  const [contexte, setContexte] = useState<{ tarifTtc: number; anneeBareme: number; tarifFige: boolean } | null>(null);
  const [erreurTarif, setErreurTarif] = useState<string | null>(null);
  const [apercu, setApercu] = useState<ApercuFacturation | null>(null);

  const prestation = code ? prestationContrat(code) : undefined;

  // Le tarif (et les lots pour le pre-remplissage) arrivent des que copro + prestation
  // sont choisies. Lecture seule.
  useEffect(() => {
    if (!coproCode || !code) return;
    let actif = true;
    contextePrestationContratAction(coproCode, code).then((res) => {
      if (!actif) return;
      if (!res.ok || !res.donnees) {
        setContexte(null);
        setErreurTarif(res.ok ? "Tarif introuvable." : res.erreur);
        return;
      }
      // Les lots d'abord, quoi qu'il arrive au tarif : la fiche les connait toujours.
      const p = prestationContrat(code);
      if (p?.mode === "par_lot" && res.donnees.lotsPrincipaux) setQuantite(String(res.donnees.lotsPrincipaux));
      setContexte(res.donnees.tarif);
      setErreurTarif(res.donnees.erreurTarif);
    });
    return () => {
      actif = false;
    };
  }, [coproCode, code]);

  const q = Number(quantite.replace(",", "."));
  const quantiteOk = !prestation || prestation.mode === "fixe" || (Number.isFinite(q) && q > 0);
  const pret = Boolean(coproCode && prestation && quantiteOk && contexte);

  function demande() {
    return {
      coproCode,
      prestation: code,
      ...(prestation && prestation.mode !== "fixe" ? { quantite: q } : {}),
      ...(urgence ? { urgence: true } : {}),
      ...(nomClient.trim() ? { nomClient: nomClient.trim() } : {}),
      ...(objet.trim() ? { objet: objet.trim() } : {}),
      ...(date ? { datePrestation: date } : {}),
    };
  }

  function verifier() {
    demarrer(async () => {
      const res = await apercuPrestationContratAction(demande());
      if (!res.ok) return toast.err(res.erreur);
      if (res.donnees) setApercu(res.donnees);
    });
  }

  function confirmer() {
    demarrer(async () => {
      const res = await creerFacturePrestationContratAction(demande());
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(res.donnees?.factureId ? `Facture créée : ${formatEuros(res.donnees.montantHt)} HT.` : "Rien à facturer.");
      setApercu(null);
      setCode("");
      setQuantite("");
      setUrgence(false);
      setNomClient("");
      setObjet("");
      setDate("");
      router.refresh();
    });
  }

  const unite = prestation?.mode === "par_lot" ? "Lots principaux" : prestation?.mode === "par_coproprietaire" ? "Copropriétaires concernés" : prestation?.mode === "horaire" ? "Heures (à la demi-heure)" : null;

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Copropriété" htmlFor="pc-copro">
            <Select id="pc-copro" value={coproCode} onChange={(e) => setCoproCode(e.target.value)}>
              <option value="">Choisir…</option>
              {copros.map((c) => (
                <option key={c.code} value={c.code}>{c.code} · {c.nom}</option>
              ))}
            </Select>
          </Field>
          <Field label="Prestation" htmlFor="pc-prestation">
            <Select id="pc-prestation" value={code} onChange={(e) => { setCode(e.target.value); setQuantite(""); setUrgence(false); }}>
              <option value="">Choisir…</option>
              {GROUPES_PRESTATION.map((g) => (
                <optgroup key={g} label={LIBELLE_GROUPE[g]}>
                  {PRESTATIONS_CONTRAT.filter((p) => p.groupe === g).map((p) => (
                    <option key={p.code} value={p.code}>{p.libelle}</option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
        </div>

        {prestation && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {unite && (
              <Field label={unite} htmlFor="pc-quantite">
                <Input id="pc-quantite" type="text" inputMode="decimal" value={quantite} onChange={(e) => setQuantite(e.target.value)} className="tabular-nums" />
              </Field>
            )}
            {prestation.mode === "horaire" && (
              <div className="flex items-end pb-2">
                <Choix type="checkbox" label="Urgence hors heures ouvrables (+40 %)" checked={urgence} onChange={(e) => setUrgence(e.target.checked)} />
              </div>
            )}
            <Field label={prestation.imputation === "coproprietaire" ? "Copropriétaire concerné" : "Client (facultatif)"} htmlFor="pc-client">
              <Input id="pc-client" value={nomClient} onChange={(e) => setNomClient(e.target.value)} placeholder={prestation.imputation === "coproprietaire" ? "Nom, lot" : ""} />
            </Field>
            <Field label="Précision (facultatif)" htmlFor="pc-objet">
              <Input id="pc-objet" value={objet} onChange={(e) => setObjet(e.target.value)} placeholder="AG du 03/09, dossier X…" />
            </Field>
            <Field label="Date de la prestation" htmlFor="pc-date">
              <Input id="pc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-body text-ink-2">
            {prestation && contexte ? (
              <>
                {contexte.tarifFige ? "Tarif figé au contrat" : `Barème ${contexte.anneeBareme}`} :{" "}
                <span className="font-medium tabular-nums">{formatEuros(contexte.tarifTtc)} TTC</span>
                {prestation.mode !== "fixe" && ` par ${prestation.mode === "horaire" ? "heure" : prestation.mode === "par_lot" ? "lot principal" : "copropriétaire"}`}
                {" "}· article {prestation.article}
                {prestation.imputation === "coproprietaire" && " · imputable au copropriétaire, facturé au syndicat"}
              </>
            ) : erreurTarif ? (
              <span className="text-err-700">{erreurTarif}</span>
            ) : (
              "Choisir la copropriété et la prestation : le tarif vient du contrat."
            )}
          </p>
          <Button type="button" variant="primary" disabled={!pret || pending} onClick={verifier}>
            <Search strokeWidth={1.5} /> Vérifier
          </Button>
        </div>
      </CardBody>

      {apercu && (
        <ConfirmationFacturation
          apercu={apercu}
          pennylaneMode={pennylaneMode}
          pending={pending}
          onConfirmer={confirmer}
          onAnnuler={() => setApercu(null)}
        />
      )}
    </Card>
  );
}
