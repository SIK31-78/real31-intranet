"use client";

// Saisie d'un recap AG. Regroupe en un seul ecran ce que le legacy PowerApps
// etalait sur deux : deroule de l'AG, decisions votees, travaux, nouveau contrat.
// Le depassement horaire n'est pas saisi : il est calcule serveur a partir du
// creneau et de la plage contractuelle de la copropriete.
//
// Refonte 2026-09 : cinq sections a la hairline, champs sur les primitives Field /
// Input / Select / Choix, une aide d'UNE ligne par section, et UN primaire :
// "Calculer et verifier". Le tout dans une CARTE blanche, comme le formulaire de
// facturation : depuis que le fond de page est du papier chaud, un formulaire pose a
// meme le papier detonne (retour Sekou 2026-09-10, "herite du fond ocre").

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Select, Choix, GroupeChoix } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { ApercuFacturation } from "@/lib/services/facturation/apercu";
import { ConfirmationFacturation } from "@/components/facturation/confirmation-facturation";
import { apercuRecapAgAction, creerRecapAgAction } from "@/app/recap-ag/actions";
import { POURCENTAGE_FONDS_TRAVAUX_MINIMUM } from "@/lib/domain/recap-ag/fonds-travaux";
import type { ModeEmissionFacture } from "@/lib/domain/facturation/mode-emission";
import type { ContratGenere } from "@/lib/services/contrat/contrats-generes";
import { formatJour } from "@/lib/services/facturation/format";

/** Montant -> texte de champ ("" si inconnu). */
function texteMontant(v: number | null | undefined): string {
  return v === null || v === undefined ? "" : String(v);
}
const formatJourCourt = formatJour;
function formatEurosCourt(v: number): string {
  return `${v.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
}
/** Les honoraires saisis different-ils de ceux du contrat genere ? */
function ecartContrat(saisi: string, genere: number | null): boolean {
  if (genere === null || saisi.trim() === "") return false;
  const n = Number(saisi);
  return Number.isFinite(n) && Math.abs(n - genere) >= 0.005;
}

interface TravauxSaisis {
  numeroResolution: string;
  libelle: string;
  budget: string;
  cleRepartition: string;
  modalitesAppelFonds: string;
}

/** Une section du formulaire : titre a la hairline, aide d'une ligne, grille de champs. */
function SectionForm({
  titre,
  hint,
  actions,
  children,
}: {
  titre: string;
  hint?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 border-b border-line pb-1.5">
        <h2 className="text-title font-semibold tracking-tight text-ink">{titre}</h2>
        {actions}
      </div>
      {children}
      {hint && <p className="text-meta text-ink-2">{hint}</p>}
    </section>
  );
}

function OuiNon({
  label,
  valeur,
  onChange,
  id,
}: {
  label: string;
  valeur: boolean | null;
  onChange: (v: boolean) => void;
  id: string;
}) {
  return (
    <GroupeChoix label={label}>
      {[true, false].map((v) => (
        <Choix key={String(v)} type="radio" name={id} label={v ? "Oui" : "Non"} checked={valeur === v} onChange={() => onChange(v)} />
      ))}
    </GroupeChoix>
  );
}

export function FormulaireRecapAg({
  copros,
  pennylaneMode,
  coproInitial,
  onSucces,
}: {
  copros: { code: string; nom: string; agDateSuggeree?: string; contratGenere?: ContratGenere }[];
  pennylaneMode: ModeEmissionFacture;
  /** Copro pre-selectionnee a l'ouverture (alerte des recaps en retard). Ignoree si elle
   *  n'est pas dans la liste : la selection ne sort jamais du portefeuille. */
  coproInitial?: string;
  /** Appele apres un enregistrement reussi (ferme la modale quand le form est monte dedans). */
  onSucces?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [apercu, setApercu] = useState<ApercuFacturation | null>(null);

  const depart = copros.find((c) => c.code === coproInitial) ?? copros[0];
  const [coproCode, setCoproCode] = useState(depart?.code ?? "");
  // Un recap est le compte-rendu de l'AG qui vient d'avoir lieu : la page suggere sa date
  // (la prochaine AG si elle est deja passee, sinon la derniere tenue). Modifiable au besoin,
  // aucune ecriture - simple defaut.
  const [jour, setJour] = useState(depart?.agDateSuggeree ?? "");
  // Creneau d'AG le plus frequent chez REAL31.
  const [debut, setDebut] = useState("18:00");
  const [fin, setFin] = useState("20:00");

  // Defauts poses sur les cas courants : la saisie ne corrige que l'exception.
  const [comptesApprouves, setComptesApprouves] = useState<boolean | null>(true);
  const [reserves, setReserves] = useState("");
  // Defaut sur Non : le cas courant est un budget vote tel que presente.
  const [budgetModifie, setBudgetModifie] = useState<boolean | null>(false);
  const [montantBudget, setMontantBudget] = useState("");
  const [pourcentageBudget, setPourcentageBudget] = useState(String(POURCENTAGE_FONDS_TRAVAUX_MINIMUM));
  const [pptVote, setPptVote] = useState<boolean | null>(false);
  const [pourcentagePpt, setPourcentagePpt] = useState("");
  const [montantPpt, setMontantPpt] = useState("");
  const [fondsTravaux, setFondsTravaux] = useState<boolean | null>(true);
  const [infoComptable, setInfoComptable] = useState("");

  const [travaux, setTravaux] = useState<TravauxSaisis[]>([]);

  // Le bloc « Nouveau contrat de gestion » part du CONTRAT GENERE pour cette AG quand il
  // existe (Sekou, 14/09/2026) : c'est le document qui a ete insere dans la convocation
  // et signe. Modifiable - l'AG peut voter un autre montant, c'est rare mais ca arrive -
  // et l'ecart s'affiche pour que ce soit un choix, pas une faute de frappe.
  const genereDepart = depart?.contratGenere;
  const [debutContrat, setDebutContrat] = useState(genereDepart?.debutISO ?? "");
  const [finContrat, setFinContrat] = useState(genereDepart?.finISO ?? "");
  const [honoraires, setHonoraires] = useState(texteMontant(genereDepart?.honorairesTtc));
  const [forfaitPostaux, setForfaitPostaux] = useState(texteMontant(genereDepart?.forfaitPostauxTtc));
  // Nature des frais postaux prevue au contrat : reels refactures, ou forfait.
  // Le montant n'a de sens que dans le second cas.
  const [fraisPostauxReels, setFraisPostauxReels] = useState<boolean | null>(false);
  const contratGenere = copros.find((c) => c.code === coproCode)?.contratGenere;

  function proposerContrat(code: string) {
    const g = copros.find((c) => c.code === code)?.contratGenere;
    setDebutContrat(g?.debutISO ?? "");
    setFinContrat(g?.finISO ?? "");
    setHonoraires(texteMontant(g?.honorairesTtc));
    setForfaitPostaux(texteMontant(g?.forfaitPostauxTtc));
    setFraisPostauxReels(false);
  }

  function nombreOuUndefined(v: string): number | undefined {
    const n = Number(v);
    return v.trim() === "" || Number.isNaN(n) ? undefined : n;
  }

  function construireDemande() {
    const [hd, md] = debut.split(":").map(Number);
    const [hf, mf] = fin.split(":").map(Number);
    return {
      coproCode,
      assemblee: {
        jourDebut: jour,
        heureDebut: hd ?? 0,
        minuteDebut: md ?? 0,
        jourFin: jour,
        heureFin: hf ?? 0,
        minuteFin: mf ?? 0,
      },
      ...(comptesApprouves !== null ? { comptesApprouves } : {}),
      ...(reserves.trim() ? { reserves: reserves.trim() } : {}),
      ...(budgetModifie !== null ? { budgetModifie } : {}),
      ...(budgetModifie === true && nombreOuUndefined(montantBudget) !== undefined
        ? { montantBudget: nombreOuUndefined(montantBudget) }
        : {}),
      ...(nombreOuUndefined(pourcentageBudget) !== undefined
        ? { pourcentageBudget: nombreOuUndefined(pourcentageBudget) }
        : {}),
      ...(pptVote !== null ? { pptVote } : {}),
      ...(nombreOuUndefined(pourcentagePpt) !== undefined
        ? { pourcentagePpt: nombreOuUndefined(pourcentagePpt) }
        : {}),
      ...(nombreOuUndefined(montantPpt) !== undefined
        ? { montantPpt: nombreOuUndefined(montantPpt) }
        : {}),
      ...(fondsTravaux !== null ? { fondsTravaux } : {}),
      ...(infoComptable.trim() ? { infoComptable: infoComptable.trim() } : {}),
      travaux: travaux
        .filter((t) => t.libelle.trim())
        .map((t) => ({
          ...(t.numeroResolution.trim() ? { numeroResolution: t.numeroResolution.trim() } : {}),
          libelle: t.libelle.trim(),
          ...(nombreOuUndefined(t.budget) !== undefined
            ? { budget: nombreOuUndefined(t.budget) }
            : {}),
          ...(t.cleRepartition.trim() ? { cleRepartition: t.cleRepartition.trim() } : {}),
          ...(t.modalitesAppelFonds.trim()
            ? { modalitesAppelFonds: t.modalitesAppelFonds.trim() }
            : {}),
        })),
      ...(debutContrat ? { debutContrat } : {}),
      ...(finContrat ? { finContrat } : {}),
      ...(nombreOuUndefined(honoraires) !== undefined
        ? { honorairesGestionTtc: nombreOuUndefined(honoraires) }
        : {}),
      ...(fraisPostauxReels !== null ? { fraisPostauxReels } : {}),
      ...(fraisPostauxReels === false && nombreOuUndefined(forfaitPostaux) !== undefined
        ? { forfaitPostauxTtc: nombreOuUndefined(forfaitPostaux) }
        : {}),
    };
  }

  function verifier() {
    if (!coproCode) return toast.err("Sélectionne une copropriété.");
    if (!jour) return toast.err("Renseigne la date de l'assemblée.");
    if (budgetModifie === true && nombreOuUndefined(montantBudget) === undefined)
      return toast.err("Le budget a été modifié en AG : renseigne le nouveau montant.");
    if (fraisPostauxReels === false && nombreOuUndefined(forfaitPostaux) === undefined)
      return toast.err("Frais postaux au forfait : renseigne le montant du forfait.");
    demarrer(async () => {
      const res = await apercuRecapAgAction(construireDemande());
      if (!res.ok) return toast.err(res.erreur);
      if (res.donnees) setApercu(res.donnees);
    });
  }

  function confirmer(sansFacture = false) {
    demarrer(async () => {
      const res = await creerRecapAgAction({
        ...construireDemande(),
        ...(sansFacture ? { sansFacture: true } : {}),
      });
      setApercu(null);
      if (!res.ok) return toast.err(res.erreur);
      const d = res.donnees;
      toast.ok(
        d?.factureId
          ? `Récap enregistré, dépassement de ${d.depassementHeures} h facturé.`
          : sansFacture && d && d.depassementHeures > 0
            ? `Récap enregistré, dépassement de ${d.depassementHeures} h NON facturé (choix).`
            : "Récap enregistré (aucun dépassement à facturer).",
      );
      router.refresh();
      onSucces?.();
    });
  }

  const majTravaux = (i: number, patch: Partial<TravauxSaisis>) =>
    setTravaux(travaux.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <Card>
      <CardBody className="flex flex-col gap-6">
      <SectionForm
        titre="Assemblée"
        hint="Le dépassement est calculé depuis la durée incluse au contrat, lue sur la fiche : il n'est pas saisi."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Copropriété" htmlFor="copro" className="sm:col-span-4">
            <Select
              id="copro"
              value={coproCode}
              onChange={(e) => {
                const v = e.target.value;
                setCoproCode(v);
                setJour(copros.find((c) => c.code === v)?.agDateSuggeree ?? "");
                proposerContrat(v);
              }}
            >
              {copros.map((c) => (
                <option key={c.code} value={c.code}>{c.code} - {c.nom}</option>
              ))}
            </Select>
          </Field>
          <Field label="Date de l'AG" htmlFor="jour" className="sm:col-span-2">
            <Input id="jour" type="date" value={jour} onChange={(e) => setJour(e.target.value)} />
          </Field>
          <Field label="Début" htmlFor="debut">
            <Input id="debut" type="time" value={debut} onChange={(e) => setDebut(e.target.value)} />
          </Field>
          <Field label="Fin" htmlFor="fin">
            <Input id="fin" type="time" value={fin} onChange={(e) => setFin(e.target.value)} />
          </Field>
        </div>
      </SectionForm>

      <SectionForm titre="Décisions votées">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <OuiNon id="comptes" label="Comptes approuvés" valeur={comptesApprouves} onChange={setComptesApprouves} />
          <Field label="Réserves" htmlFor="reserves">
            <Input id="reserves" value={reserves} onChange={(e) => setReserves(e.target.value)} placeholder="Observations éventuelles" />
          </Field>
          <OuiNon id="budget" label="Budget présenté modifié en AG" valeur={budgetModifie} onChange={setBudgetModifie} />
          {/* Le nouveau montant n'a de sens que si le budget a ete modifie
              (le legacy ne l'exigeait aussi que dans ce cas). */}
          {budgetModifie === true ? (
            <Field label="Nouveau montant du budget (€)" htmlFor="mbudget">
              <Input id="mbudget" type="number" step="0.01" min="0" value={montantBudget} onChange={(e) => setMontantBudget(e.target.value)} />
            </Field>
          ) : (
            <div />
          )}
          <Field label="Info comptable" htmlFor="info" className="sm:col-span-2">
            <Input id="info" value={infoComptable} onChange={(e) => setInfoComptable(e.target.value)} />
          </Field>
        </div>
      </SectionForm>

      <SectionForm
        titre="Fonds travaux"
        hint={
          pptVote !== true
            ? `Sans PPT voté, le fonds travaux est un pourcentage du budget prévisionnel ; minimum légal ${POURCENTAGE_FONDS_TRAVAUX_MINIMUM} % (en dessous : avertissement, pas de blocage).`
            : undefined
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <OuiNon id="ppt" label="PPT voté à cette AG" valeur={pptVote} onChange={setPptVote} />
          <OuiNon id="fonds" label="Fonds travaux" valeur={fondsTravaux} onChange={setFondsTravaux} />
          {/* PPT vote : le fonds travaux suit le plan. Sinon, il est un
              pourcentage du budget, plancher au minimum legal. */}
          {pptVote === true && (
            <>
              <Field label="Pourcentage PPT (%)" htmlFor="pppt">
                <Input id="pppt" type="number" step="0.1" min="0" value={pourcentagePpt} onChange={(e) => setPourcentagePpt(e.target.value)} />
              </Field>
              <Field label="Montant PPT voté sur 10 ans (€)" htmlFor="mppt">
                <Input id="mppt" type="number" step="0.01" min="0" value={montantPpt} onChange={(e) => setMontantPpt(e.target.value)} />
              </Field>
            </>
          )}
          <Field label="Pourcentage budget (%)" htmlFor="pbudget">
            <Input id="pbudget" type="number" step="0.1" min={0} value={pourcentageBudget} onChange={(e) => setPourcentageBudget(e.target.value)} />
          </Field>
        </div>
      </SectionForm>

      <SectionForm
        titre="Travaux votés"
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setTravaux([...travaux, { numeroResolution: "", libelle: "", budget: "", cleRepartition: "", modalitesAppelFonds: "" }])
            }
          >
            <Plus strokeWidth={1.5} /> Ajouter
          </Button>
        }
      >
        {travaux.length === 0 ? (
          <p className="text-body text-ink-2">Aucun travaux voté</p>
        ) : (
          <ul className="flex flex-col gap-2 overflow-x-auto">
            {travaux.map((t, i) => (
              <li key={i} className="grid min-w-160 grid-cols-[5rem_2fr_1fr_1fr_1fr_auto] items-end gap-2">
                <Field label={i === 0 ? "Résolution" : ""}>
                  <Input value={t.numeroResolution} placeholder="n°" aria-label="Numéro de résolution" onChange={(e) => majTravaux(i, { numeroResolution: e.target.value })} />
                </Field>
                <Field label={i === 0 ? "Libellé" : ""}>
                  <Input value={t.libelle} aria-label="Libellé des travaux" onChange={(e) => majTravaux(i, { libelle: e.target.value })} />
                </Field>
                <Field label={i === 0 ? "Budget" : ""}>
                  <Input type="number" step="0.01" min="0" value={t.budget} aria-label="Budget" onChange={(e) => majTravaux(i, { budget: e.target.value })} />
                </Field>
                <Field label={i === 0 ? "Clé de répartition" : ""}>
                  <Input value={t.cleRepartition} aria-label="Clé de répartition" onChange={(e) => majTravaux(i, { cleRepartition: e.target.value })} />
                </Field>
                <Field label={i === 0 ? "Appel de fonds" : ""}>
                  <Input value={t.modalitesAppelFonds} aria-label="Modalités d'appel de fonds" onChange={(e) => majTravaux(i, { modalitesAppelFonds: e.target.value })} />
                </Field>
                <Button variant="ghost" size="md" iconOnly aria-label="Retirer" onClick={() => setTravaux(travaux.filter((_, j) => j !== i))}>
                  <Trash2 strokeWidth={1.5} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionForm>

      <SectionForm
        titre="Nouveau contrat de gestion"
        hint={
          contratGenere
            ? "Pré-rempli depuis le contrat généré pour cette AG. Si l'assemblée a voté autrement, corriger : c'est le montant voté qui alimente la facturation."
            : "Renseigner ces champs ouvre un nouveau cycle de contrat : ces montants alimentent la facturation de gestion courante."
        }
      >
        {contratGenere && (
          <p className="text-body text-ink-2">
            Contrat généré le {formatJourCourt(contratGenere.editeLeISO)}
            {contratGenere.par ? ` par ${contratGenere.par}` : ""}
            {contratGenere.dateAgISO ? ` pour l'AG du ${formatJourCourt(contratGenere.dateAgISO)}` : ""} :{" "}
            <span className="tabular-nums">{formatJourCourt(contratGenere.debutISO)} → {formatJourCourt(contratGenere.finISO)}</span>
            {contratGenere.honorairesTtc !== null && (
              <> · <span className="tabular-nums">{formatEurosCourt(contratGenere.honorairesTtc)}</span> TTC</>
            )}
            {contratGenere.forfaitPostauxTtc !== null && (
              <> · timbres <span className="tabular-nums">{formatEurosCourt(contratGenere.forfaitPostauxTtc)}</span></>
            )}
            {ecartContrat(honoraires, contratGenere.honorairesTtc) && (
              <span className="text-warn-700"> — honoraires différents du contrat généré ({formatEurosCourt(contratGenere.honorairesTtc!)})</span>
            )}
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Début du contrat" htmlFor="dcontrat">
            <Input id="dcontrat" type="date" value={debutContrat} onChange={(e) => setDebutContrat(e.target.value)} />
          </Field>
          <Field label="Fin du contrat" htmlFor="fcontrat">
            <Input id="fcontrat" type="date" value={finContrat} onChange={(e) => setFinContrat(e.target.value)} />
          </Field>
          <Field label="Honoraires annuels TTC" htmlFor="hono">
            <Input id="hono" type="number" step="0.01" min="0" value={honoraires} onChange={(e) => setHonoraires(e.target.value)} />
          </Field>
          <GroupeChoix label="Frais postaux">
            <Choix type="radio" name="frais-postaux" label="Frais réels" checked={fraisPostauxReels === true} onChange={() => setFraisPostauxReels(true)} />
            <Choix type="radio" name="frais-postaux" label="Forfait" checked={fraisPostauxReels === false} onChange={() => setFraisPostauxReels(false)} />
          </GroupeChoix>
          {/* Le montant n'est demande que si le contrat prevoit un forfait. */}
          {fraisPostauxReels === false && (
            <Field label="Forfait frais postaux TTC (€)" htmlFor="postaux">
              <Input id="postaux" type="number" step="0.01" min="0" value={forfaitPostaux} onChange={(e) => setForfaitPostaux(e.target.value)} />
            </Field>
          )}
        </div>
      </SectionForm>

      <div className="flex justify-end border-t border-line pt-4">
        <Button variant="primary" size="lg" onClick={verifier} loading={pending}>
          <ClipboardCheck strokeWidth={1.5} />
          Calculer et vérifier
        </Button>
      </div>

        {apercu && (
          <ConfirmationFacturation
            apercu={apercu}
            pennylaneMode={pennylaneMode}
            pending={pending}
            onConfirmer={() => confirmer()}
            onConfirmerSansFacture={() => confirmer(true)}
            onAnnuler={() => setApercu(null)}
          />
        )}
      </CardBody>
    </Card>
  );
}
