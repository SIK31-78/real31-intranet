"use client";

// Saisie d'un recap AG. Regroupe en un seul ecran ce que le legacy PowerApps
// etalait sur deux : deroule de l'AG, decisions votees, travaux, nouveau contrat.
// Le depassement horaire n'est pas saisi : il est calcule serveur a partir du
// creneau et de la plage contractuelle de la copropriete.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, ClipboardCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import type { ApercuFacturation } from "@/lib/services/facturation/apercu";
import { ConfirmationFacturation } from "@/components/facturation/confirmation-facturation";
import { apercuRecapAgAction, creerRecapAgAction } from "@/app/recap-ag/actions";
import { POURCENTAGE_FONDS_TRAVAUX_MINIMUM } from "@/lib/domain/recap-ag/fonds-travaux";

interface TravauxSaisis {
  numeroResolution: string;
  libelle: string;
  budget: string;
  cleRepartition: string;
  modalitesAppelFonds: string;
}

const champ =
  "w-full rounded border border-line px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-green-700";
const label = "block text-[12px] font-medium text-ink-2 mb-1";
const section = "text-[13px] font-semibold text-ink border-b border-line pb-1.5 mb-3";

function OuiNon({
  valeur,
  onChange,
  id,
}: {
  valeur: boolean | null;
  onChange: (v: boolean) => void;
  id: string;
}) {
  return (
    <div className="flex gap-4 text-[13px]">
      {[true, false].map((v) => (
        <label key={String(v)} className="flex cursor-pointer items-center gap-1.5">
          <input
            type="radio"
            name={id}
            checked={valeur === v}
            onChange={() => onChange(v)}
          />
          {v ? "Oui" : "Non"}
        </label>
      ))}
    </div>
  );
}

export function FormulaireRecapAg({
  copros,
  pennylaneActif,
  onSucces,
}: {
  copros: { code: string; nom: string; agDateSuggeree?: string }[];
  pennylaneActif: boolean;
  /** Appele apres un enregistrement reussi (ferme la modale quand le form est monte dedans). */
  onSucces?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [apercu, setApercu] = useState<ApercuFacturation | null>(null);

  const [coproCode, setCoproCode] = useState(copros[0]?.code ?? "");
  // Un recap est le compte-rendu de l'AG qui vient d'avoir lieu : la page suggere sa date
  // (la prochaine AG si elle est deja passee, sinon la derniere tenue). Modifiable au besoin,
  // aucune ecriture - simple defaut.
  const [jour, setJour] = useState(copros[0]?.agDateSuggeree ?? "");
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

  const [debutContrat, setDebutContrat] = useState("");
  const [honoraires, setHonoraires] = useState("");
  const [forfaitPostaux, setForfaitPostaux] = useState("");
  // Nature des frais postaux prevue au contrat : reels refactures, ou forfait.
  // Le montant n'a de sens que dans le second cas.
  const [fraisPostauxReels, setFraisPostauxReels] = useState<boolean | null>(false);

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

  function confirmer() {
    demarrer(async () => {
      const res = await creerRecapAgAction(construireDemande());
      setApercu(null);
      if (!res.ok) return toast.err(res.erreur);
      const d = res.donnees;
      toast.ok(
        d?.factureId
          ? `Récap enregistré, dépassement de ${d.depassementHeures} h facturé.`
          : "Récap enregistré (aucun dépassement à facturer).",
      );
      router.refresh();
      onSucces?.();
    });
  }

  return (
    <Card>
      <div className="flex flex-col gap-6 px-4 py-4">
        <div>
          <h2 className={section}>Assemblée</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={label} htmlFor="copro">Copropriété</label>
              <select id="copro" className={champ} value={coproCode} onChange={(e) => { const v = e.target.value; setCoproCode(v); setJour(copros.find((c) => c.code === v)?.agDateSuggeree ?? ""); }}>
                {copros.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} - {c.nom}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="jour">Date de l&apos;AG</label>
              <input id="jour" type="date" className={champ} value={jour} onChange={(e) => setJour(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={label} htmlFor="debut">Début</label>
                <input id="debut" type="time" className={champ} value={debut} onChange={(e) => setDebut(e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="fin">Fin</label>
                <input id="fin" type="time" className={champ} value={fin} onChange={(e) => setFin(e.target.value)} />
              </div>
            </div>
            <p className="sm:col-span-2 text-[12px] text-ink-3">
              La durée incluse au contrat et la plage horaire sont lues sur la fiche de la
              copropriété. Le dépassement est calculé automatiquement, il n&apos;est pas saisi.
            </p>
          </div>
        </div>

        <div>
          <h2 className={section}>Décisions votées</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <span className={label}>Comptes approuvés</span>
              <OuiNon id="comptes" valeur={comptesApprouves} onChange={setComptesApprouves} />
            </div>
            <div>
              <label className={label} htmlFor="reserves">Réserves</label>
              <input id="reserves" className={champ} value={reserves} onChange={(e) => setReserves(e.target.value)} placeholder="Observations éventuelles" />
            </div>
            <div>
              <span className={label}>Le budget présenté a-t-il été modifié en AG ?</span>
              <OuiNon id="budget" valeur={budgetModifie} onChange={setBudgetModifie} />
            </div>
            {/* Le nouveau montant n'a de sens que si le budget a ete modifie
                (le legacy ne l'exigeait aussi que dans ce cas). */}
            {budgetModifie === true ? (
              <div>
                <label className={label} htmlFor="mbudget">Nouveau montant du budget (€)</label>
                <input id="mbudget" type="number" step="0.01" min="0" className={champ} value={montantBudget} onChange={(e) => setMontantBudget(e.target.value)} />
              </div>
            ) : (
              <div />
            )}
            <div className="sm:col-span-2">
              <label className={label} htmlFor="info">Info comptable</label>
              <input id="info" className={champ} value={infoComptable} onChange={(e) => setInfoComptable(e.target.value)} />
            </div>
          </div>
        </div>

        <div>
          <h2 className={section}>Fonds travaux</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <span className={label}>Un PPT a-t-il été voté à cette AG ?</span>
              <OuiNon id="ppt" valeur={pptVote} onChange={setPptVote} />
            </div>
            <div>
              <span className={label}>Fonds travaux</span>
              <OuiNon id="fonds" valeur={fondsTravaux} onChange={setFondsTravaux} />
            </div>
            {/* PPT voté : le fonds travaux suit le plan. Sinon, il est un
                pourcentage du budget, plancher au minimum légal. */}
            {pptVote === true && (
              <>
                <div>
                  <label className={label} htmlFor="pppt">Pourcentage PPT (%)</label>
                  <input id="pppt" type="number" step="0.1" min="0" className={champ} value={pourcentagePpt} onChange={(e) => setPourcentagePpt(e.target.value)} />
                </div>
                <div>
                  <label className={label} htmlFor="mppt">Montant PPT voté sur 10 ans (€)</label>
                  <input id="mppt" type="number" step="0.01" min="0" className={champ} value={montantPpt} onChange={(e) => setMontantPpt(e.target.value)} />
                </div>
              </>
            )}
            <div>
              <label className={label} htmlFor="pbudget">Pourcentage budget (%)</label>
              <input
                id="pbudget"
                type="number"
                step="0.1"
                min={0}
                className={champ}
                value={pourcentageBudget}
                onChange={(e) => setPourcentageBudget(e.target.value)}
              />
            </div>
            {pptVote !== true && (
              <p className="sm:col-span-2 text-[12px] text-ink-3">
                Sans PPT voté, le fonds travaux est un pourcentage du budget prévisionnel. Le
                minimum légal est de {POURCENTAGE_FONDS_TRAVAUX_MINIMUM} % : en dessous, un
                avertissement s&apos;affichera à la validation, sans empêcher d&apos;enregistrer.
              </p>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between border-b border-line pb-1.5 mb-3">
            <h2 className="text-[13px] font-semibold text-ink">Travaux votés</h2>
            <button
              type="button"
              onClick={() => setTravaux([...travaux, { numeroResolution: "", libelle: "", budget: "", cleRepartition: "", modalitesAppelFonds: "" }])}
              className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[12px] text-ink hover:bg-black/[0.03]"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> Ajouter
            </button>
          </div>
          {travaux.length === 0 ? (
            <p className="text-[12px] text-ink-3">Aucun travaux voté.</p>
          ) : (
            <ul className="flex flex-col gap-2 overflow-x-auto">
              {travaux.map((t, i) => (
                <li key={i} className="grid min-w-[640px] grid-cols-[auto_2fr_1fr_1fr_1fr_auto] items-end gap-2">
                  <div className="w-[80px]">
                    {i === 0 && <label className={label}>Résolution</label>}
                    <input className={champ} value={t.numeroResolution} placeholder="n°" onChange={(e) => setTravaux(travaux.map((x, j) => (j === i ? { ...x, numeroResolution: e.target.value } : x)))} />
                  </div>
                  <div>
                    {i === 0 && <label className={label}>Libellé</label>}
                    <input className={champ} value={t.libelle} onChange={(e) => setTravaux(travaux.map((x, j) => (j === i ? { ...x, libelle: e.target.value } : x)))} />
                  </div>
                  <div>
                    {i === 0 && <label className={label}>Budget</label>}
                    <input type="number" step="0.01" min="0" className={champ} value={t.budget} onChange={(e) => setTravaux(travaux.map((x, j) => (j === i ? { ...x, budget: e.target.value } : x)))} />
                  </div>
                  <div>
                    {i === 0 && <label className={label}>Clé de répartition</label>}
                    <input className={champ} value={t.cleRepartition} onChange={(e) => setTravaux(travaux.map((x, j) => (j === i ? { ...x, cleRepartition: e.target.value } : x)))} />
                  </div>
                  <div>
                    {i === 0 && <label className={label}>Appel de fonds</label>}
                    <input className={champ} value={t.modalitesAppelFonds} onChange={(e) => setTravaux(travaux.map((x, j) => (j === i ? { ...x, modalitesAppelFonds: e.target.value } : x)))} />
                  </div>
                  <button type="button" onClick={() => setTravaux(travaux.filter((_, j) => j !== i))} aria-label="Retirer" className="mb-1.5 text-ink-3 hover:text-red-700">
                    <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className={section}>Nouveau contrat de gestion</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={label} htmlFor="dcontrat">Début du contrat</label>
              <input id="dcontrat" type="date" className={champ} value={debutContrat} onChange={(e) => setDebutContrat(e.target.value)} />
            </div>
            <div>
              <label className={label} htmlFor="hono">Honoraires annuels TTC</label>
              <input id="hono" type="number" step="0.01" min="0" className={champ} value={honoraires} onChange={(e) => setHonoraires(e.target.value)} />
            </div>
            <div>
              <span className={label}>Frais postaux</span>
              <div className="flex gap-4 text-[13px]">
                {[
                  { v: true, l: "Frais réels" },
                  { v: false, l: "Forfait" },
                ].map((o) => (
                  <label key={String(o.v)} className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="radio"
                      name="frais-postaux"
                      checked={fraisPostauxReels === o.v}
                      onChange={() => setFraisPostauxReels(o.v)}
                    />
                    {o.l}
                  </label>
                ))}
              </div>
            </div>
            {/* Le montant n'est demande que si le contrat prevoit un forfait. */}
            {fraisPostauxReels === false && (
              <div>
                <label className={label} htmlFor="postaux">Forfait frais postaux TTC (€)</label>
                <input id="postaux" type="number" step="0.01" min="0" className={champ} value={forfaitPostaux} onChange={(e) => setForfaitPostaux(e.target.value)} />
              </div>
            )}
            <p className="col-span-3 text-[12px] text-ink-3">
              Renseigner ces champs ouvre un nouveau cycle de contrat pour la copropriété. Ces
              montants alimenteront la facturation de gestion courante.
            </p>
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={verifier}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded bg-green-700 px-3 py-2 text-[13px] font-medium text-white hover:bg-green-800 disabled:opacity-60"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" strokeWidth={1.5} />}
            Calculer et vérifier
          </button>
        </div>
      </div>

      {apercu && (
        <ConfirmationFacturation
          apercu={apercu}
          pennylaneActif={pennylaneActif}
          pending={pending}
          onConfirmer={confirmer}
          onAnnuler={() => setApercu(null)}
        />
      )}
    </Card>
  );
}
