"use client";

// Le formulaire complet de la fiche immeuble, dans une modale : les champs du registre
// national dans l'ordre de son formulaire (généralités, chauffage, ECS, ventilation,
// diagnostics, PPT, notes). Les selects se filtrent en cascade (type -> énergie -> système)
// et ce qui n'est plus cohérent se vide à la saisie ; le serveur rejoue la même règle.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Choix, Field, GroupeChoix, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import {
  ENERGIES_CHAUFFAGE,
  energiesPossibles,
  LIBELLE_ENERGIE_CHAUFFAGE,
  LIBELLE_PERIODE_CONSTRUCTION,
  LIBELLE_QUESTION_ECS_MEME,
  LIBELLE_QUESTION_PPT_INSCRIT_AG,
  LIBELLE_QUESTION_PPT_VOTE,
  LIBELLE_SYSTEME_CHAUFFAGE,
  LIBELLE_SYSTEME_ECS,
  LIBELLE_SYSTEME_VENTILATION,
  LIBELLE_TRI_ETAT,
  LIBELLE_TYPE_CHAUFFAGE,
  LIBELLE_TYPE_ECS,
  LIBELLE_TYPE_VENTILATION,
  PERIODES_CONSTRUCTION,
  QUESTIONS_TRI_ETAT,
  SYSTEMES_CHAUFFAGE,
  SYSTEMES_ECS,
  SYSTEMES_VENTILATION,
  systemesChauffagePossibles,
  systemesEcsPossibles,
  TYPES_CHAUFFAGE,
  TYPES_ECS,
  TYPES_VENTILATION,
  type FicheImmeuble,
  type PatchFicheImmeuble,
  type TriEtat,
} from "@/lib/domain/contrats-copro";
import { modifierImmeubleAction } from "@/app/contrats-copro/actions-immeuble";

type Saisie = {
  surfaceM2: string;
  anneeConstruction: string;
  periodeConstruction: string;
  nombreBatiments: string;
  chauffageType: string;
  chauffageEnergie: string;
  chauffageSysteme: string;
  ecsType: string;
  ecsMemeQueChauffage: boolean | null;
  ecsSysteme: string;
  ventilationType: string;
  ventilationSysteme: string;
  bornesRechargeVE: TriEtat | null;
  locauxVelos: TriEtat | null;
  dpeCollectifRealise: TriEtat | null;
  diagnosticStructureRealise: TriEtat | null;
  pptVote: TriEtat | null;
  pptAdoptionISO: string;
  pptInscritAG: TriEtat | null;
  notes: string;
};

const texte = (v: number | string | null) => (v === null ? "" : String(v));

function depuisFiche(f: FicheImmeuble): Saisie {
  return {
    surfaceM2: texte(f.surfaceM2),
    anneeConstruction: texte(f.anneeConstruction),
    periodeConstruction: f.periodeConstruction ?? "",
    nombreBatiments: texte(f.nombreBatiments),
    chauffageType: f.chauffageType ?? "",
    chauffageEnergie: f.chauffageEnergie ?? "",
    chauffageSysteme: f.chauffageSysteme ?? "",
    ecsType: f.ecsType ?? "",
    ecsMemeQueChauffage: f.ecsMemeQueChauffage,
    ecsSysteme: f.ecsSysteme ?? "",
    ventilationType: f.ventilationType ?? "",
    ventilationSysteme: f.ventilationSysteme ?? "",
    bornesRechargeVE: f.bornesRechargeVE,
    locauxVelos: f.locauxVelos,
    dpeCollectifRealise: f.dpeCollectifRealise,
    diagnosticStructureRealise: f.diagnosticStructureRealise,
    pptVote: f.pptVote,
    pptAdoptionISO: f.pptAdoptionISO ?? "",
    pptInscritAG: f.pptInscritAG,
    notes: f.notes ?? "",
  };
}

function nombreOuNull(s: string): number | null {
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function entierOuNull(s: string): number | null {
  const n = nombreOuNull(s);
  return n === null ? null : Math.trunc(n);
}

const videANull = (s: string) => (s === "" ? null : s);

/** Options d'un select en cascade : les valeurs permises, plus la valeur courante si elle est
 *  hors liste (donnée héritée : on l'affiche, on ne la perd pas tant qu'on n'y touche pas). */
function options<K extends string>(toutes: readonly K[], permises: readonly string[], courante: string, libelles: Record<string, string>) {
  const ok = new Set<string>(permises);
  const liste = toutes.filter((v) => ok.has(v) || (courante !== "" && v === courante)).map((v) => ({ value: v as string, label: libelles[v] ?? v }));
  if (courante !== "" && !toutes.includes(courante as K)) liste.push({ value: courante, label: libelles[courante] ?? courante });
  return liste;
}

function SelectChamp({
  id,
  label,
  valeur,
  choix,
  onChange,
}: {
  id: string;
  label: string;
  valeur: string;
  choix: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <Select id={id} value={valeur} onChange={(e) => onChange(e.target.value)}>
        <option value="">Non renseigné</option>
        {choix.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function TriEtatChamp({
  nom,
  label,
  valeur,
  nonConnuePermis,
  onChange,
}: {
  nom: string;
  label: string;
  valeur: TriEtat | null;
  nonConnuePermis: boolean;
  onChange: (v: TriEtat) => void;
}) {
  const valeurs: TriEtat[] = nonConnuePermis ? ["oui", "non", "non_connue"] : ["oui", "non"];
  return (
    <GroupeChoix label={label}>
      {valeurs.map((v) => (
        <Choix key={v} type="radio" name={nom} label={LIBELLE_TRI_ETAT[v]} checked={valeur === v} onChange={() => onChange(v)} />
      ))}
    </GroupeChoix>
  );
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 border-t border-line pt-3 first:border-t-0 first:pt-0">
      <legend className="text-body font-semibold text-ink mb-2">{titre}</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">{children}</div>
    </fieldset>
  );
}

export function FormulaireImmeuble({ fiche, onFermer }: { fiche: FicheImmeuble; onFermer: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [s, setS] = useState<Saisie>(() => depuisFiche(fiche));
  const [erreur, setErreur] = useState<string | null>(null);

  const poser = <K extends keyof Saisie>(cle: K, valeur: Saisie[K]) => setS((prev) => ({ ...prev, [cle]: valeur }));

  // Cascades anticipées côté formulaire : ce qui devient incohérent se vide tout de suite.
  const changerTypeChauffage = (type: string) => {
    setS((prev) => {
      let energie = prev.chauffageEnergie;
      let systeme = prev.chauffageSysteme;
      if (type === "SANS_CHAUFFAGE") {
        energie = "";
        systeme = "";
      } else {
        if (energie !== "" && !(energiesPossibles(type) as readonly string[]).includes(energie)) {
          energie = "";
          systeme = "";
        }
        if (systeme !== "" && !(systemesChauffagePossibles(type, energie) as readonly string[]).includes(systeme)) systeme = "";
      }
      return { ...prev, chauffageType: type, chauffageEnergie: energie, chauffageSysteme: systeme };
    });
  };
  const changerEnergie = (energie: string) => {
    setS((prev) => ({
      ...prev,
      chauffageEnergie: energie,
      chauffageSysteme: prev.chauffageSysteme !== "" && !(systemesChauffagePossibles(prev.chauffageType, energie) as readonly string[]).includes(prev.chauffageSysteme) ? "" : prev.chauffageSysteme,
    }));
  };
  const changerTypeEcs = (type: string) => {
    setS((prev) => ({ ...prev, ecsType: type, ecsSysteme: prev.ecsSysteme !== "" && !(systemesEcsPossibles(type) as readonly string[]).includes(prev.ecsSysteme) ? "" : prev.ecsSysteme }));
  };
  const changerEcsMeme = (b: boolean) => setS((prev) => ({ ...prev, ecsMemeQueChauffage: b, ecsSysteme: b ? "" : prev.ecsSysteme }));
  const changerPptVote = (v: TriEtat) => setS((prev) => ({ ...prev, pptVote: v, pptAdoptionISO: v === "oui" ? prev.pptAdoptionISO : "", pptInscritAG: v === "non" ? prev.pptInscritAG : null }));

  const sansChauffage = s.chauffageType === "SANS_CHAUFFAGE";
  const typesChauffage = options(TYPES_CHAUFFAGE, TYPES_CHAUFFAGE, s.chauffageType, LIBELLE_TYPE_CHAUFFAGE);
  const energies = options(ENERGIES_CHAUFFAGE, energiesPossibles(s.chauffageType), s.chauffageEnergie, LIBELLE_ENERGIE_CHAUFFAGE);
  const systemes = options(SYSTEMES_CHAUFFAGE, systemesChauffagePossibles(s.chauffageType, s.chauffageEnergie), s.chauffageSysteme, LIBELLE_SYSTEME_CHAUFFAGE);
  const systemesEcs = options(SYSTEMES_ECS, systemesEcsPossibles(s.ecsType), s.ecsSysteme, LIBELLE_SYSTEME_ECS);

  function enregistrer() {
    setErreur(null);
    const surface = nombreOuNull(s.surfaceM2);
    if (s.surfaceM2.trim() !== "" && surface === null) return setErreur("La surface doit être un nombre.");
    const annee = entierOuNull(s.anneeConstruction);
    if (s.anneeConstruction.trim() !== "" && annee === null) return setErreur("L'année de construction doit être un nombre.");
    const nbBat = entierOuNull(s.nombreBatiments);
    if (s.nombreBatiments.trim() !== "" && nbBat === null) return setErreur("Le nombre de bâtiments doit être un nombre.");

    const patch: PatchFicheImmeuble = {
      surfaceM2: surface,
      anneeConstruction: annee,
      periodeConstruction: videANull(s.periodeConstruction),
      nombreBatiments: nbBat,
      chauffageType: videANull(s.chauffageType),
      chauffageEnergie: videANull(s.chauffageEnergie),
      chauffageSysteme: videANull(s.chauffageSysteme),
      ecsType: videANull(s.ecsType),
      ecsMemeQueChauffage: s.ecsMemeQueChauffage,
      ecsSysteme: videANull(s.ecsSysteme),
      ventilationType: videANull(s.ventilationType),
      ventilationSysteme: videANull(s.ventilationSysteme),
      bornesRechargeVE: s.bornesRechargeVE,
      locauxVelos: s.locauxVelos,
      dpeCollectifRealise: s.dpeCollectifRealise,
      diagnosticStructureRealise: s.diagnosticStructureRealise,
      pptVote: s.pptVote,
      pptAdoptionISO: videANull(s.pptAdoptionISO),
      pptInscritAG: s.pptInscritAG,
      notes: videANull(s.notes.trim()),
    };
    demarrer(async () => {
      const res = await modifierImmeubleAction({ coproCode: fiche.coproCode, patch });
      if (!res.ok) return setErreur(res.erreur);
      toast.ok("Fiche immeuble enregistrée.");
      router.refresh();
      onFermer();
    });
  }

  return (
    <Modal titre="Fiche immeuble" onFermer={onFermer} size="lg">
      <ModalBody>
        <div className="flex flex-col gap-5">
          <Bloc titre="Généralités">
            <Field label="Surface (m²)" htmlFor="im-surface">
              <Input id="im-surface" inputMode="decimal" value={s.surfaceM2} onChange={(e) => poser("surfaceM2", e.target.value)} className="tabular-nums" />
            </Field>
            <Field label="Année de construction" htmlFor="im-annee">
              <Input id="im-annee" inputMode="numeric" value={s.anneeConstruction} onChange={(e) => poser("anneeConstruction", e.target.value)} className="tabular-nums" />
            </Field>
            <SelectChamp id="im-periode" label="Période de construction" valeur={s.periodeConstruction} choix={options(PERIODES_CONSTRUCTION, PERIODES_CONSTRUCTION, s.periodeConstruction, LIBELLE_PERIODE_CONSTRUCTION)} onChange={(v) => poser("periodeConstruction", v)} />
            <Field label="Nombre de bâtiments" htmlFor="im-nb-bat" hint={fiche.batiments.length > 0 ? `${fiche.batiments.length} bâtiment${fiche.batiments.length > 1 ? "s" : ""} saisi${fiche.batiments.length > 1 ? "s" : ""} plus bas` : undefined}>
              <Input id="im-nb-bat" inputMode="numeric" value={s.nombreBatiments} onChange={(e) => poser("nombreBatiments", e.target.value)} className="tabular-nums" />
            </Field>
          </Bloc>

          <Bloc titre="Chauffage">
            <SelectChamp id="im-ch-type" label="Type de chauffage" valeur={s.chauffageType} choix={typesChauffage} onChange={changerTypeChauffage} />
            {!sansChauffage && (
              <>
                <SelectChamp id="im-ch-energie" label="Énergie de chauffage" valeur={s.chauffageEnergie} choix={energies} onChange={changerEnergie} />
                <SelectChamp id="im-ch-systeme" label="Système de chauffage" valeur={s.chauffageSysteme} choix={systemes} onChange={(v) => poser("chauffageSysteme", v)} />
              </>
            )}
          </Bloc>

          <Bloc titre="Eau chaude sanitaire">
            <SelectChamp id="im-ecs-type" label="Type d'ECS" valeur={s.ecsType} choix={options(TYPES_ECS, TYPES_ECS, s.ecsType, LIBELLE_TYPE_ECS)} onChange={changerTypeEcs} />
            <div className="sm:col-span-2">
              <GroupeChoix label={LIBELLE_QUESTION_ECS_MEME}>
                <Choix type="radio" name="im-ecs-meme" label="Oui" checked={s.ecsMemeQueChauffage === true} onChange={() => changerEcsMeme(true)} />
                <Choix type="radio" name="im-ecs-meme" label="Non" checked={s.ecsMemeQueChauffage === false} onChange={() => changerEcsMeme(false)} />
              </GroupeChoix>
            </div>
            {s.ecsMemeQueChauffage !== true && <SelectChamp id="im-ecs-systeme" label="Système d'ECS" valeur={s.ecsSysteme} choix={systemesEcs} onChange={(v) => poser("ecsSysteme", v)} />}
          </Bloc>

          <Bloc titre="Ventilation">
            <SelectChamp id="im-vent-type" label="Type de ventilation" valeur={s.ventilationType} choix={options(TYPES_VENTILATION, TYPES_VENTILATION, s.ventilationType, LIBELLE_TYPE_VENTILATION)} onChange={(v) => poser("ventilationType", v)} />
            <SelectChamp id="im-vent-systeme" label="Système de ventilation" valeur={s.ventilationSysteme} choix={options(SYSTEMES_VENTILATION, SYSTEMES_VENTILATION, s.ventilationSysteme, LIBELLE_SYSTEME_VENTILATION)} onChange={(v) => poser("ventilationSysteme", v)} />
          </Bloc>

          <Bloc titre="Diagnostics et infrastructures">
            {QUESTIONS_TRI_ETAT.map((q) => (
              <div key={q.cle} className="sm:col-span-2">
                <TriEtatChamp nom={`im-${q.cle}`} label={q.libelle} valeur={s[q.cle]} nonConnuePermis={q.nonConnuePermis} onChange={(v) => poser(q.cle, v)} />
              </div>
            ))}
          </Bloc>

          <Bloc titre="Plan pluriannuel de travaux">
            <div className="sm:col-span-2">
              <TriEtatChamp nom="im-ppt-vote" label={LIBELLE_QUESTION_PPT_VOTE} valeur={s.pptVote} nonConnuePermis={false} onChange={changerPptVote} />
            </div>
            {s.pptVote === "oui" && (
              <Field label="Date d'adoption du PPT" htmlFor="im-ppt-date">
                <Input id="im-ppt-date" type="date" value={s.pptAdoptionISO} onChange={(e) => poser("pptAdoptionISO", e.target.value)} largeur="auto" />
              </Field>
            )}
            {s.pptVote === "non" && (
              <div className="sm:col-span-2">
                <TriEtatChamp nom="im-ppt-ag" label={LIBELLE_QUESTION_PPT_INSCRIT_AG} valeur={s.pptInscritAG} nonConnuePermis={false} onChange={(v) => poser("pptInscritAG", v)} />
              </div>
            )}
          </Bloc>

          <Field label="Notes" htmlFor="im-notes">
            <Textarea id="im-notes" value={s.notes} onChange={(e) => poser("notes", e.target.value)} rows={3} />
          </Field>

          {erreur && (
            <p className="text-body text-err-700" role="alert">
              {erreur}
            </p>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button type="button" variant="ghost" onClick={onFermer} disabled={pending}>
          Annuler
        </Button>
        <Button type="button" variant="primary" onClick={enregistrer} loading={pending}>
          Enregistrer
        </Button>
      </ModalFooter>
    </Modal>
  );
}
