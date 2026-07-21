"use client";

// Formulaires de facturation des honoraires syndic : un onglet par type de
// prestation (les 5 ecrans PowerApps d'origine, regroupes ici en un seul écran).
// Le montant n'est JAMAIS saisi : il est recalculé côté serveur depuis le barème.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Receipt } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import type { ApercuFacturation } from "@/lib/services/facturation/apercu";
import { ConfirmationFacturation } from "./confirmation-facturation";
import {
  apercuFactureCsAction,
  tarifForfaitaireAction,
  apercuFactureEtatDateAction,
  apercuFactureSinistreAction,
  apercuFactureTravauxAction,
  creerFactureCsAction,
  creerFactureEtatDateAction,
  creerFactureSinistreAction,
  creerFactureTravauxAction,
} from "@/app/facturation/actions";

type Onglet = "depassement_cs" | "suivi_travaux" | "suivi_sinistre" | "pre_etat_date" | "etat_date";

const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: "depassement_cs", libelle: "Dépassement CS" },
  { cle: "suivi_travaux", libelle: "Suivi de travaux" },
  { cle: "suivi_sinistre", libelle: "Suivi de sinistre" },
  { cle: "pre_etat_date", libelle: "Pré-état daté" },
  { cle: "etat_date", libelle: "État daté" },
];

const DILIGENCES: { cle: keyof Diligences; libelle: string }[] = [
  { cle: "dossierAssureur", libelle: "Suivi du dossier auprès de l'assureur" },
  { cle: "deplacementLieux", libelle: "Déplacement sur les lieux" },
  { cle: "mesuresConservatoires", libelle: "Prise de mesures conservatoires" },
  { cle: "assistanceExpertise", libelle: "Assistance aux mesures d'expertises" },
];

type Diligences = {
  dossierAssureur: boolean;
  deplacementLieux: boolean;
  mesuresConservatoires: boolean;
  assistanceExpertise: boolean;
};

const champ =
  "w-full rounded border border-line px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-green-700";
const label = "block text-[12px] font-medium text-ink-2 mb-1";

export function FormulaireFacturation({
  copros,
  pennylaneActif,
  coproFixe,
  depassementCsSeul = false,
  onSucces,
}: {
  copros: { code: string; nom: string }[];
  pennylaneActif: boolean;
  /** Si fourni, la copro est verrouillee (select masque) : usage modale pre-scopee. */
  coproFixe?: string;
  /** Si vrai, seul le flux "Dépassement CS" est présenté (barre d'onglets masquée). */
  depassementCsSeul?: boolean;
  /** Appele apres une facturation reussie (ferme la modale quand le form est monte dedans). */
  onSucces?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [onglet, setOnglet] = useState<Onglet>("depassement_cs");
  const [coproCode, setCoproCode] = useState(coproFixe ?? copros[0]?.code ?? "");
  // Apercu en attente de confirmation (depassement CS uniquement).
  const [apercu, setApercu] = useState<ApercuFacturation | null>(null);

  // Dépassement CS
  const [jourCs, setJourCs] = useState("");
  const [debutCs, setDebutCs] = useState("18:00");
  const [finCs, setFinCs] = useState("20:00");

  // Suivi de travaux
  const [libelleTravaux, setLibelleTravaux] = useState("");
  const [modeTravaux, setModeTravaux] = useState<"pourcentage" | "forfait">("pourcentage");
  const [montantTravauxHt, setMontantTravauxHt] = useState("");
  const [pourcentage, setPourcentage] = useState("");
  const [forfaitTtc, setForfaitTtc] = useState("");

  // Suivi de sinistre
  const [libelleSinistre, setLibelleSinistre] = useState("");
  const [dateSinistre, setDateSinistre] = useState("");
  const [diligences, setDiligences] = useState<Diligences>({
    dossierAssureur: false,
    deplacementLieux: false,
    mesuresConservatoires: false,
    assistanceExpertise: false,
  });

  // Pré-état daté / état daté
  const [nomClient, setNomClient] = useState("");
  const [dateEtablissement, setDateEtablissement] = useState("");
  // Montant du pre-etat date / etat date : pre-rempli au tarif du bareme, mais
  // MODIFIABLE (ces prestations se negocient avec le coproprietaire).
  const [montantForfaitaire, setMontantForfaitaire] = useState("");
  const [tarifBareme, setTarifBareme] = useState<{ anneeBareme: number; tarifTtc: number } | null>(null);
  const [chargeTarif, setChargeTarif] = useState(false);

  function annoncer(
    res:
      | { ok: true; donnees?: { montantHt?: number; factureId?: string | null; franchiseHeures?: number } }
      | { ok: false; erreur: string },
  ) {
    if (!res.ok) {
      toast.err(res.erreur);
      return;
    }
    const montant = res.donnees?.montantHt;
    if (res.donnees && "factureId" in res.donnees && res.donnees.factureId === null) {
      toast.ok(
        `Rien à facturer : la réunion ne dépasse pas la durée incluse au contrat (${res.donnees?.franchiseHeures ?? 0} h).`,
      );
    } else {
      toast.ok(
        montant !== undefined
          ? `Facturation créée : ${montant.toFixed(2)} € HT.`
          : "Facturation créée.",
      );
    }
    router.refresh();
    onSucces?.();
  }

  // Recharge le tarif du bareme (et pre-remplit le champ) des que la copro ou la
  // prestation change. Le gestionnaire voit le montant de reference d'emblee.
  useEffect(() => {
    if (onglet !== "pre_etat_date" && onglet !== "etat_date") return;
    if (!coproCode) return;
    let annule = false;
    // Le drapeau de chargement est pose DANS la promesse, pas dans le corps de
    // l'effet : un setState synchrone y declencherait des rendus en cascade.
    void Promise.resolve().then(() => {
      if (!annule) setChargeTarif(true);
    });
    tarifForfaitaireAction(coproCode, onglet).then((res) => {
      if (annule) return;
      setChargeTarif(false);
      if (!res.ok) {
        setTarifBareme(null);
        setMontantForfaitaire("");
        toast.err(res.erreur);
        return;
      }
      if (res.donnees) {
        setTarifBareme(res.donnees);
        setMontantForfaitaire(res.donnees.tarifTtc.toFixed(2));
      }
    });
    return () => {
      annule = true;
    };
    // toast est stable (contexte), pas besoin de le suivre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coproCode, onglet]);

  function creneauCs() {
    const [hd, md] = debutCs.split(":").map(Number);
    const [hf, mf] = finCs.split(":").map(Number);
    return {
      jourDebut: jourCs,
      heureDebut: hd ?? 0,
      minuteDebut: md ?? 0,
      jourFin: jourCs,
      heureFin: hf ?? 0,
      minuteFin: mf ?? 0,
    };
  }

  function honorairesTravaux() {
    return modeTravaux === "pourcentage"
      ? {
          mode: "pourcentage" as const,
          montantTravauxHt: Number(montantTravauxHt) || 0,
          pourcentage: Number(pourcentage) || 0,
        }
      : { mode: "forfait" as const, forfaitTtc: Number(forfaitTtc) || 0 };
  }

  /** Confirmation du recapitulatif : cree la facturation ET l'envoie. */
  function confirmer() {
    demarrer(async () => {
      const res =
        onglet === "depassement_cs"
          ? await creerFactureCsAction(coproCode, creneauCs())
          : onglet === "suivi_travaux"
            ? await creerFactureTravauxAction(coproCode, libelleTravaux.trim(), honorairesTravaux())
            : onglet === "suivi_sinistre"
              ? await creerFactureSinistreAction(
                  coproCode,
                  libelleSinistre.trim(),
                  diligences,
                  dateSinistre || undefined,
                )
              : await creerFactureEtatDateAction(
                  coproCode,
                  onglet === "pre_etat_date" ? "pre_etat_date" : "etat_date",
                  nomClient.trim() || undefined,
                  dateEtablissement || undefined,
                  montantForfaitaire.trim() ? Number(montantForfaitaire) : undefined,
                );
      setApercu(null);
      annoncer(res);
    });
  }

  function soumettre() {
    if (!coproCode) {
      toast.err("Sélectionne une copropriété.");
      return;
    }

    // Aucune prestation n'ecrit directement : on calcule l'apercu et on demande
    // confirmation. Le meme calcul servira a la creation, ils ne divergent pas.
    demarrer(async () => {
      let res;
      if (onglet === "depassement_cs") {
        if (!jourCs) return toast.err("Renseigne la date de la réunion.");
        res = await apercuFactureCsAction(coproCode, creneauCs());
      } else if (onglet === "suivi_travaux") {
        if (!libelleTravaux.trim()) return toast.err("Renseigne le libellé des travaux.");
        res = await apercuFactureTravauxAction(coproCode, libelleTravaux.trim(), honorairesTravaux());
      } else if (onglet === "suivi_sinistre") {
        if (!libelleSinistre.trim()) return toast.err("Renseigne le libellé du sinistre.");
        res = await apercuFactureSinistreAction(
          coproCode,
          libelleSinistre.trim(),
          diligences,
          dateSinistre || undefined,
        );
      } else {
        res = await apercuFactureEtatDateAction(
          coproCode,
          onglet === "pre_etat_date" ? "pre_etat_date" : "etat_date",
          nomClient.trim() || undefined,
          dateEtablissement || undefined,
          montantForfaitaire.trim() ? Number(montantForfaitaire) : undefined,
        );
      }
      if (!res.ok) return toast.err(res.erreur);
      if (res.donnees) setApercu(res.donnees);
    });
  }

  return (
    <Card>
      {!depassementCsSeul && (
        <div className="px-4 pt-4">
          <div className="flex flex-wrap gap-1 border-b border-line">
            {ONGLETS.map((o) => (
              <button
                key={o.cle}
                type="button"
                onClick={() => setOnglet(o.cle)}
                className={`px-3 py-2 text-[13px] border-b-2 -mb-px transition-colors ${
                  onglet === o.cle
                    ? "border-green-700 text-green-800 font-medium"
                    : "border-transparent text-ink-3 hover:text-ink"
                }`}
              >
                {o.libelle}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 py-4 flex flex-col gap-4">
        {coproFixe ? (
          // Copro verrouillee (modale pre-scopee) : on l'affiche en clair, non modifiable.
          <p className="text-[13px] text-ink-2">
            Copropriété : <span className="font-medium text-ink">{copros.find((c) => c.code === coproFixe)?.nom ?? coproFixe}</span>
          </p>
        ) : (
          <div>
            <label className={label} htmlFor="copro">
              Copropriété
            </label>
            <select
              id="copro"
              className={champ}
              value={coproCode}
              onChange={(e) => setCoproCode(e.target.value)}
            >
              {copros.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} - {c.nom}
                </option>
              ))}
            </select>
          </div>
        )}

        {onglet === "depassement_cs" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="jour-cs">Date de la réunion</label>
              <input id="jour-cs" type="date" className={champ} value={jourCs} onChange={(e) => setJourCs(e.target.value)} />
            </div>
            <div>
              <label className={label} htmlFor="debut-cs">Heure de début</label>
              <input id="debut-cs" type="time" className={champ} value={debutCs} onChange={(e) => setDebutCs(e.target.value)} />
            </div>
            <div>
              <label className={label} htmlFor="fin-cs">Heure de fin</label>
              <input id="fin-cs" type="time" className={champ} value={finCs} onChange={(e) => setFinCs(e.target.value)} />
            </div>
            <p className="col-span-2 text-[12px] text-ink-3">
              La durée incluse au contrat est lue sur la fiche de la copropriété : elle n&apos;est
              pas saisissable. Le dépassement est arrondi à la demi-heure supérieure, puis cette
              durée est déduite. Si la réunion ne la dépasse pas, aucune facture n&apos;est créée.
            </p>
          </div>
        )}

        {onglet === "suivi_travaux" && (
          <div className="flex flex-col gap-3">
            <div>
              <label className={label} htmlFor="lib-travaux">Libellé des travaux</label>
              <input id="lib-travaux" className={champ} value={libelleTravaux} onChange={(e) => setLibelleTravaux(e.target.value)} placeholder="Ravalement façade cour" />
            </div>
            <div className="flex gap-4 text-[13px]">
              {(["pourcentage", "forfait"] as const).map((m) => (
                <label key={m} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={modeTravaux === m} onChange={() => setModeTravaux(m)} />
                  {m === "pourcentage" ? "Pourcentage des travaux" : "Forfait"}
                </label>
              ))}
            </div>
            {modeTravaux === "pourcentage" ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label} htmlFor="mht">Montant des travaux HT (€)</label>
                  <input id="mht" type="number" step="0.01" min="0" className={champ} value={montantTravauxHt} onChange={(e) => setMontantTravauxHt(e.target.value)} />
                </div>
                <div>
                  <label className={label} htmlFor="porc">Honoraires (%)</label>
                  <input id="porc" type="number" step="0.1" min="0" max="100" className={champ} value={pourcentage} onChange={(e) => setPourcentage(e.target.value)} />
                </div>
              </div>
            ) : (
              <div>
                <label className={label} htmlFor="forfait">Forfait TTC (€)</label>
                <input id="forfait" type="number" step="0.01" min="0" className={champ} value={forfaitTtc} onChange={(e) => setForfaitTtc(e.target.value)} />
              </div>
            )}
          </div>
        )}

        {onglet === "suivi_sinistre" && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label} htmlFor="lib-sinistre">Libellé du sinistre</label>
                <input id="lib-sinistre" className={champ} value={libelleSinistre} onChange={(e) => setLibelleSinistre(e.target.value)} placeholder="Dégât des eaux 3e étage" />
              </div>
              <div>
                <label className={label} htmlFor="date-sinistre">Date du sinistre</label>
                <input id="date-sinistre" type="date" className={champ} value={dateSinistre} onChange={(e) => setDateSinistre(e.target.value)} />
              </div>
            </div>
            <fieldset>
              <legend className={label}>Diligences à facturer</legend>
              <div className="flex flex-col gap-1.5">
                {DILIGENCES.map((d) => (
                  <label key={d.cle} className="flex items-center gap-2 text-[13px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={diligences[d.cle]}
                      onChange={(e) => setDiligences({ ...diligences, [d.cle]: e.target.checked })}
                    />
                    {d.libelle}
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="text-[12px] text-ink-3">
              Chaque diligence est facturée au tarif du barème de l&apos;année du contrat en cours.
            </p>
          </div>
        )}

        {(onglet === "pre_etat_date" || onglet === "etat_date") && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="client">Nom du client</label>
              <input id="client" className={champ} value={nomClient} onChange={(e) => setNomClient(e.target.value)} placeholder="Étude notariale…" />
            </div>
            <div>
              <label className={label} htmlFor="date-etab">Date d&apos;établissement</label>
              <input id="date-etab" type="date" className={champ} value={dateEtablissement} onChange={(e) => setDateEtablissement(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className={label} htmlFor="montant-forfait">
                Montant TTC
                {chargeTarif && <span className="ml-2 font-normal text-ink-3">(chargement du tarif…)</span>}
              </label>
              <input
                id="montant-forfait"
                type="number"
                step="0.01"
                min="0"
                className={champ}
                value={montantForfaitaire}
                onChange={(e) => setMontantForfaitaire(e.target.value)}
              />
              <p className="mt-1 text-[12px] text-ink-3">
                {tarifBareme
                  ? `Pré-rempli au tarif du barème ${tarifBareme.anneeBareme} (${tarifBareme.tarifTtc.toFixed(2).replace(".", ",")} € TTC). Modifiable : cette prestation se négocie. Toute différence sera signalée à la validation et tracée sur la facture.`
                  : "Le tarif du barème se charge à la sélection de la copropriété."}
              </p>
            </div>
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={soumettre}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded bg-green-700 px-3 py-2 text-[13px] font-medium text-white hover:bg-green-800 disabled:opacity-60"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" strokeWidth={1.5} />}
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
