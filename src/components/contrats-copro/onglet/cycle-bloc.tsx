"use client";

// Un cycle de suivi : l'en-tête (échéance en pastille selon le niveau, statut, progression),
// puis les étapes dans l'ordre métier. Chaque étape se date en ligne ; une intermédiaire datée
// s'efface ; la TERMINALE passe par « Clôturer ». Un cycle d'amorçage ne montre que son
// échéance et « Démarrer le suivi ».

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, Pencil, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  ETAPES,
  LIBELLE_STATUT_CYCLE,
  peutEffacerEtape,
  type Cycle,
  type EtapeDef,
  type OffreAssurance,
  type OffreGaz,
  type SujetSuivi,
} from "@/lib/domain/contrats-copro";
import type { CycleVue } from "@/lib/services/contrats-copro/types";
import { daterEtapeAction, definirEcheanceAction, demarrerSuiviAction } from "@/app/contrats-copro/actions";
import { jour, tonNiveau } from "./commun";
import { ModaleCloture } from "./modale-cloture";

export function CycleBloc({
  coproCode,
  sujet,
  vue,
  peutEcrire,
  aujourdhuiISO,
  offresAssurance,
  offresGaz,
  compagnieActuelle,
  offreRetenueNom,
  encadre = true,
}: {
  coproCode: string;
  sujet: SujetSuivi;
  vue: CycleVue;
  peutEcrire: boolean;
  aujourdhuiISO: string;
  offresAssurance?: OffreAssurance[];
  offresGaz?: OffreGaz[];
  compagnieActuelle?: string | null;
  /** Le nom de l'offre retenue à la validation (cycles clos), pour l'en-tête. */
  offreRetenueNom?: string | null;
  /** false : rendu nu (dans la carte d'un appareil), sans Card autour. */
  encadre?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [cloture, setCloture] = useState(false);
  const [editionEcheance, setEditionEcheance] = useState(false);
  const { cycle, niveau, progression } = vue;
  const enCours = cycle.statut === "en_cours";
  const ecrit = peutEcrire && cycle.statut !== "archive";

  function lancerDemarrage() {
    demarrer(async () => {
      const res = await demarrerSuiviAction({ coproCode, sujet, cycleId: cycle.id });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok("Suivi démarré.");
      router.refresh();
    });
  }

  const enTete = (
    <div className="flex flex-wrap items-center gap-2">
      <Badge ton={tonNiveau(niveau)} dot size="md">
        {cycle.echeanceISO ? `Échéance ${jour(cycle.echeanceISO)}` : "Échéance à compléter"}
      </Badge>
      {!enCours && <Badge ton="outline">{LIBELLE_STATUT_CYCLE[cycle.statut]}</Badge>}
      {ecrit && enCours && cycle.echeanceISO && !vue.aDemarrer && (
        <Button type="button" variant="ghost" size="sm" iconOnly aria-label="Modifier l'échéance" title="Modifier l'échéance" onClick={() => setEditionEcheance((v) => !v)}>
          <Pencil strokeWidth={1.5} />
        </Button>
      )}
      {!vue.aDemarrer && (
        <span className="text-meta text-ink-2 tabular-nums">
          {progression.franchies}/{progression.total} étapes
          {(niveau === "orange" || niveau === "rouge") && vue.joursSansAvancement !== null ? ` · figé depuis ${vue.joursSansAvancement} j` : ""}
        </span>
      )}
      {offreRetenueNom && <span className="text-meta text-ink-2">offre retenue : {offreRetenueNom}</span>}
    </div>
  );

  const actions = vue.aDemarrer && enCours && peutEcrire ? (
    <Button type="button" variant="doux" size="sm" loading={pending} onClick={lancerDemarrage}>
      <Play strokeWidth={1.5} /> Démarrer le suivi
    </Button>
  ) : cycle.statut === "clos" && peutEcrire ? (
    <Button type="button" variant="ghost" size="sm" onClick={() => setCloture(true)}>
      Re-clôturer
    </Button>
  ) : null;

  const corps = vue.aDemarrer ? (
    <p className="text-body text-ink-2">Suivi pas encore démarré : l&rsquo;échéance est connue, aucune étape n&rsquo;est engagée.</p>
  ) : (
    <div className="flex flex-col gap-2">
      {ecrit && enCours && (!cycle.echeanceISO || editionEcheance) && (
        <FormEcheance coproCode={coproCode} sujet={sujet} cycle={cycle} onFait={() => setEditionEcheance(false)} onAnnuler={cycle.echeanceISO ? () => setEditionEcheance(false) : undefined} />
      )}
      <ul className="divide-y divide-line">
        {ETAPES[sujet].map((def) => (
          <EtapeLigne
            key={def.cle}
            def={def}
            cycle={cycle}
            sujet={sujet}
            coproCode={coproCode}
            aujourdhuiISO={aujourdhuiISO}
            editable={ecrit && (enCours || (cycle.statut === "clos" && !!def.postTerminale))}
            onCloturer={ecrit && enCours ? () => setCloture(true) : undefined}
          />
        ))}
      </ul>
      {cycle.notes && <p className="text-meta text-ink-2 whitespace-pre-line">{cycle.notes}</p>}
    </div>
  );

  const modale = cloture && (
    <ModaleCloture
      coproCode={coproCode}
      sujet={sujet}
      cycle={cycle}
      offresAssurance={offresAssurance}
      offresGaz={offresGaz}
      compagnieActuelle={compagnieActuelle}
      aujourdhuiISO={aujourdhuiISO}
      onFermer={() => setCloture(false)}
    />
  );

  if (!encadre) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {enTete}
          {actions}
        </div>
        {corps}
        {modale}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex-wrap">{enTete}</CardTitle>
        {actions}
      </CardHeader>
      <CardBody padding="sm">{corps}</CardBody>
      {modale}
    </Card>
  );
}

// --- L'échéance d'un cycle qui n'en a pas (ou qu'on corrige) ---------------------------------

function FormEcheance({ coproCode, sujet, cycle, onFait, onAnnuler }: { coproCode: string; sujet: SujetSuivi; cycle: Cycle; onFait: () => void; onAnnuler?: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [valeur, setValeur] = useState(cycle.echeanceISO ?? "");
  const id = `ech-${cycle.id}`;

  function enregistrer() {
    if (!valeur) return;
    demarrer(async () => {
      const res = await definirEcheanceAction({ coproCode, sujet, cycleId: cycle.id, echeanceISO: valeur });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(`Échéance fixée au ${jour(valeur)}.`);
      onFait();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warn-500/30 bg-warn-50/40 px-3 py-2">
      <label htmlFor={id} className="text-body text-ink-2">
        Échéance
      </label>
      <Input id={id} type="date" largeur="auto" className="w-40" value={valeur} onChange={(e) => setValeur(e.target.value)} />
      <Button type="button" variant="secondary" size="sm" loading={pending} disabled={!valeur} onClick={enregistrer}>
        <Check strokeWidth={1.5} /> Enregistrer
      </Button>
      {onAnnuler && (
        <Button type="button" variant="ghost" size="sm" onClick={onAnnuler}>
          Annuler
        </Button>
      )}
    </div>
  );
}

// --- Une étape --------------------------------------------------------------------------------

function EtapeLigne({
  def,
  cycle,
  sujet,
  coproCode,
  aujourdhuiISO,
  editable,
  onCloturer,
}: {
  def: EtapeDef;
  cycle: Cycle;
  sujet: SujetSuivi;
  coproCode: string;
  aujourdhuiISO: string;
  editable: boolean;
  onCloturer?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const date = cycle.etapes[def.cle] ?? null;
  const [edition, setEdition] = useState(false);
  const [valeur, setValeur] = useState(date ?? aujourdhuiISO);
  const id = `etape-${cycle.id}-${def.cle}`;

  function dater(dateISO: string | null) {
    demarrer(async () => {
      const res = await daterEtapeAction({ coproCode, sujet, cycleId: cycle.id, etape: def.cle, dateISO });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(dateISO ? `« ${def.libelle} » datée du ${jour(dateISO)}.` : `« ${def.libelle} » effacée.`);
      setEdition(false);
      router.refresh();
    });
  }

  let droite: ReactNode;
  if (def.terminale) {
    droite = date ? (
      <DateFaite iso={date} />
    ) : onCloturer ? (
      <Button type="button" variant="doux" size="sm" onClick={onCloturer}>
        <CheckCircle2 strokeWidth={1.5} /> Clôturer
      </Button>
    ) : (
      <ADater />
    );
  } else if (editable && (edition || !date)) {
    droite = (
      <span className="flex items-center gap-1.5 flex-wrap justify-end">
        <Input id={id} type="date" largeur="auto" className="w-40" max={aujourdhuiISO} value={valeur} onChange={(e) => setValeur(e.target.value)} aria-label={`Date de l'étape ${def.libelle}`} />
        <Button type="button" variant="ghost" size="sm" loading={pending} disabled={!valeur || valeur > aujourdhuiISO} onClick={() => dater(valeur)}>
          Enregistrer
        </Button>
        {edition && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setEdition(false)}>
            Annuler
          </Button>
        )}
      </span>
    );
  } else if (date) {
    droite = (
      <span className="flex items-center gap-1.5">
        <DateFaite iso={date} />
        {editable && (
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setValeur(date); setEdition(true); }}>
              Modifier
            </Button>
            {peutEffacerEtape(sujet, def.cle) && (
              <Button type="button" variant="ghost" size="sm" loading={pending} onClick={() => dater(null)}>
                Effacer
              </Button>
            )}
          </>
        )}
      </span>
    );
  } else {
    droite = <ADater />;
  }

  return (
    <li className={cn("flex items-center justify-between gap-3 min-h-9 py-1 text-body", def.postTerminale && "text-ink-2")}>
      <label htmlFor={editable && !def.terminale && (edition || !date) ? id : undefined} className={cn("min-w-0 truncate", date ? "font-medium text-ink" : "text-ink-2")}>
        {def.libelle}
      </label>
      <span className="shrink-0">{droite}</span>
    </li>
  );
}

function DateFaite({ iso }: { iso: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-ink tabular-nums">
      <Check strokeWidth={2} className="w-3.5 h-3.5 text-ok-500" aria-hidden />
      {jour(iso)}
    </span>
  );
}

function ADater() {
  return <span className="text-ink-3">à dater</span>;
}
