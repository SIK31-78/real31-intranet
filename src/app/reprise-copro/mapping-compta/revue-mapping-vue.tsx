"use client";

// Ecran de REVUE / VALIDATION du plan de mapping comptable. Pilote IA + editeur de correction.
//
// Flux : (1) upload du grand livre + code copro -> POST /api/reprise/mapping-analyser (route
// handler : multipart lourd) qui renvoie le plan + le referentiel eStale (comptes 401/450) + les
// decisions deja tranchees. (2) Le gestionnaire tranche les alertes (warnings d'appariement,
// comptes 450 non mappes) ; chaque geste est PERSISTE (server action) et rejoue LOCALEMENT via le
// domaine pur appliquerDecisions -> recalcul instantane du verdict pretAImporter. (3) AUCUN import
// eStale ici : le bouton final est desactive (increment suivant).
//
// PII : les noms (source + candidats eStale) sont AFFICHES (c'est le but, app interne
// authentifiee) mais ne transitent par aucun log.

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  FileUp,
  Sparkles,
  Loader2,
  Check,
  Ban,
  AlertTriangle,
  ChevronDown,
  Database,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type {
  CandidatCompte,
  CategorieCompte,
  PlanMapping,
  StatutMapping,
} from "@/lib/reprise/domain/mapping-compta";
import {
  appliquerDecisions,
  type DecisionEntree,
  type DecisionMapping,
  type EntreeMappingResolue,
} from "@/lib/reprise/domain/decisions-mapping";
import { enregistrerDecisionAction, oublierDecisionAction } from "./actions";

type ModeIa = "claude" | "claude-cli" | "mistral" | "mock";

interface Candidats {
  fournisseurs: CandidatCompte[];
  coproprietaires: CandidatCompte[];
}

interface Equilibre {
  equilibre: boolean;
  ecart: number;
}

interface DonneesRevue {
  code: string;
  plan: PlanMapping;
  candidats: Candidats;
  equilibre: Equilibre;
  mode: ModeIa;
}

const CATEGORIE_LABEL: Record<CategorieCompte, string> = {
  fournisseur: "Fournisseur (401)",
  fnp_408: "Factures non parvenues (408)",
  coproprietaire: "Coproprietaire (450)",
  attente_ancien: "Compte d'attente (471)",
  attente_472: "Compte d'attente (472)",
  regularisation_489: "Regularisation (489)",
  banque: "Banque (512)",
  livret: "Livret (501)",
  autre_bloc_a: "Autre tiers / tresorerie (bloc A)",
  charge_bloc_b: "Charge (classe 6, bloc B)",
  hors_bloc_a: "Hors bloc A (classe 1/2/3/7)",
};

const STATUT_LABEL: Record<StatutMapping, string> = {
  mappe: "Mappe",
  action_requise: "A creer",
  warning_appariement: "A valider",
  reporte_bloc_b: "Reporte (bloc B)",
  reporte_bloc_c: "Reporte (bloc C)",
  non_mappe: "Non mappe",
};

/** Convertit la carte de decisions locale en tableau pour le domaine. */
function versTableau(decisions: Record<string, DecisionMapping>): DecisionEntree[] {
  return Object.entries(decisions).map(([compteSource, decision]) => ({ compteSource, decision }));
}

export function RevueMappingVue({ modeIa, persistant }: { modeIa: ModeIa; persistant: boolean }) {
  const [coproCode, setCoproCode] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [pending, startAnalyse] = useTransition();
  const [data, setData] = useState<DonneesRevue | null>(null);
  const [decisions, setDecisions] = useState<Record<string, DecisionMapping>>({});
  const toast = useToast();

  const lancerAnalyse = () => {
    const code = coproCode.trim();
    if (!code || files.length === 0) return;
    startAnalyse(async () => {
      const fd = new FormData();
      fd.append("coproCode", code);
      for (const f of files) fd.append("pdfs", f);
      try {
        const res = await fetch("/api/reprise/mapping-analyser", { method: "POST", body: fd });
        const r = await res.json();
        if (res.ok && r.ok) {
          setData({ code, plan: r.plan, candidats: r.candidats, equilibre: r.equilibre, mode: r.mode });
          const carte: Record<string, DecisionMapping> = {};
          for (const d of r.decisions as DecisionEntree[]) carte[d.compteSource] = d.decision;
          setDecisions(carte);
          toast.ok("Grand livre analyse - plan de mapping pret.");
        } else {
          toast.err(r.message ?? "Erreur pendant l'analyse.");
        }
      } catch {
        toast.err("Erreur reseau pendant l'analyse.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/reprise-copro"
        className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-green-700 w-fit"
      >
        <ArrowLeft strokeWidth={1.5} className="w-3.5 h-3.5" /> Reprise de copro
      </Link>

      <ZoneUpload
        coproCode={coproCode}
        onCoproCode={setCoproCode}
        files={files}
        onFiles={setFiles}
        pending={pending}
        onAnalyse={lancerAnalyse}
        dejaAnalyse={data !== null}
        modeIa={modeIa}
      />

      {pending ? (
        <ChargementAnalyse />
      ) : data ? (
        <ResultatRevue data={data} decisions={decisions} setDecisions={setDecisions} />
      ) : (
        <p className="text-[13px] text-ink-3">
          Aucune analyse pour le moment. Saisis le code copro, depose le grand livre puis lance
          l&apos;analyse.
        </p>
      )}

      {!persistant && (
        <p className="text-[12px] text-ink-3 border border-line rounded-md bg-surface-2 px-3 py-2">
          Etat non persistant (memoire) : les decisions sont perdues au redemarrage du serveur. La
          persistance Supabase s&apos;active avec COPRO_SOURCE=supabase (table
          reprise_mapping_decision), sans changer cet ecran.
        </p>
      )}
    </div>
  );
}

// --- Upload -----------------------------------------------------------------

function ZoneUpload({
  coproCode,
  onCoproCode,
  files,
  onFiles,
  pending,
  onAnalyse,
  dejaAnalyse,
  modeIa,
}: {
  coproCode: string;
  onCoproCode: (v: string) => void;
  files: File[];
  onFiles: (updater: (prev: File[]) => File[]) => void;
  pending: boolean;
  onAnalyse: () => void;
  dejaAnalyse: boolean;
  modeIa: ModeIa;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Grand livre N-1</CardTitle>
        <Badge ton={modeIa === "mock" ? "warn" : "ok"} className="gap-1.5">
          <Sparkles strokeWidth={1.5} className="w-3 h-3" />
          {modeIa === "mock"
            ? "pilote IA - mode demonstration"
            : modeIa === "claude"
              ? "pilote IA - Claude"
              : modeIa === "claude-cli"
                ? "pilote IA - Claude (CLI)"
                : "pilote IA - Mistral"}
        </Badge>
      </CardHeader>

      <div className="p-4 flex flex-col gap-4">
        <div className="rounded-md border border-line bg-surface-2 p-3.5">
          <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
            <FileUp strokeWidth={1.5} className="w-4 h-4 text-ink-3" />
            Grand livre du syndic sortant (PDF)
          </div>
          <p className="mt-1 text-[12px] text-ink-3">
            L&apos;IA extrait toutes les ecritures (balance verifiee), puis chaque compte source est
            mappe vers eStale. Le format du grand livre importe peu (agnostique au syndic).
          </p>

          <label className="mt-3 flex flex-col gap-1 max-w-[260px]">
            <span className="text-[11px] font-medium text-ink-3">Code copro (ex. S0302)</span>
            <input
              value={coproCode}
              onChange={(e) => onCoproCode(e.target.value)}
              placeholder="S0302"
              className="h-8 rounded-md border border-line bg-surface px-2 text-[13px] font-mono text-ink"
            />
          </label>

          <input
            type="file"
            accept="application/pdf"
            multiple
            onChange={(e) => {
              const ajoutes = Array.from(e.target.files ?? []);
              onFiles((prev) => {
                const parCle = new Map(prev.map((f) => [`${f.name}:${f.size}`, f]));
                for (const f of ajoutes) parCle.set(`${f.name}:${f.size}`, f);
                return [...parCle.values()];
              });
              e.target.value = "";
            }}
            className="mt-3 block w-full text-[13px] text-ink-2 file:mr-3 file:rounded-md file:border-0 file:bg-green-700 file:px-3 file:py-2 file:text-white file:text-[13px] file:font-medium hover:file:bg-green-600 file:cursor-pointer"
          />
          {files.length > 0 && (
            <ul className="mt-2 text-[12px] text-ink-3 space-y-1">
              {files.map((f) => (
                <li key={`${f.name}:${f.size}`} className="flex items-center gap-2">
                  <span className="truncate">- {f.name}</span>
                  <button
                    type="button"
                    onClick={() =>
                      onFiles((prev) => prev.filter((x) => `${x.name}:${x.size}` !== `${f.name}:${f.size}`))
                    }
                    className="shrink-0 text-ink-4 hover:text-err-700"
                    aria-label={`Retirer ${f.name}`}
                  >
                    retirer
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3">
            <Button
              type="button"
              variant="primary"
              onClick={onAnalyse}
              disabled={coproCode.trim().length === 0 || files.length === 0 || pending}
            >
              {pending ? "Analyse en cours..." : dejaAnalyse ? "Relancer l'analyse" : "Analyser le grand livre"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ChargementAnalyse() {
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-surface-2 px-4 py-4">
      <Loader2 strokeWidth={1.75} className="w-5 h-5 text-green-700 animate-spin shrink-0" />
      <div>
        <p className="text-[13px] font-medium text-ink">Analyse en cours...</p>
        <p className="text-[12px] text-ink-3">
          L&apos;IA lit le grand livre (ecritures + comptes). Compte plusieurs minutes sur de gros
          scans, ne quitte pas la page.
        </p>
      </div>
    </div>
  );
}

// --- Resultat : bandeau recap + groupes -------------------------------------

function ResultatRevue({
  data,
  decisions,
  setDecisions,
}: {
  data: DonneesRevue;
  decisions: Record<string, DecisionMapping>;
  setDecisions: (updater: (prev: Record<string, DecisionMapping>) => Record<string, DecisionMapping>) => void;
}) {
  const [, startPersist] = useTransition();
  const toast = useToast();

  const resolu = useMemo(() => appliquerDecisions(data.plan, versTableau(decisions)), [data.plan, decisions]);

  // Referentiel eStale nomenclature -> nom (pour afficher les cibles + les listes deroulantes).
  const nomParNomenclature = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of [...data.candidats.fournisseurs, ...data.candidats.coproprietaires]) {
      m.set(c.nomenclature, c.intitule);
    }
    return m;
  }, [data.candidats]);

  const trancher = (compteSource: string, decision: DecisionMapping) => {
    setDecisions((prev) => ({ ...prev, [compteSource]: decision }));
    startPersist(async () => {
      const r = await enregistrerDecisionAction(data.code, compteSource, decision);
      if (!r.ok) toast.err(r.message);
    });
  };

  const annuler = (compteSource: string) => {
    setDecisions((prev) => {
      const suivant = { ...prev };
      delete suivant[compteSource];
      return suivant;
    });
    startPersist(async () => {
      const r = await oublierDecisionAction(data.code, compteSource);
      if (!r.ok) toast.err(r.message);
    });
  };

  const entrees = resolu.entrees;
  const aTraiter = entrees.filter(
    (e) => !e.ignore && (e.statut === "warning_appariement" || e.statut === "non_mappe"),
  );
  const actions = entrees.filter((e) => !e.ignore && e.statut === "action_requise");
  const mappes = entrees.filter((e) => !e.ignore && e.statut === "mappe");
  const ignores = entrees.filter((e) => e.ignore);
  const reportes = entrees.filter(
    (e) => !e.ignore && (e.statut === "reporte_bloc_b" || e.statut === "reporte_bloc_c"),
  );

  const nomDe = (nomenclature?: string) => (nomenclature ? nomParNomenclature.get(nomenclature) ?? "" : "");

  return (
    <div className="flex flex-col gap-5">
      <BandeauRecap resolu={resolu} equilibre={data.equilibre} total={entrees.length} />

      {aTraiter.length > 0 && (
        <section>
          <EnTeteGroupe
            titre="A traiter"
            compte={aTraiter.length}
            ton="err"
            sous="Alertes a trancher : appariements a valider et comptes 450 non mappes."
          />
          <div className="mt-2 flex flex-col gap-3">
            {aTraiter.map((e) => (
              <EntreeATraiter
                key={e.compteSource}
                entree={e}
                candidats={
                  e.categorie === "fournisseur" ? data.candidats.fournisseurs : data.candidats.coproprietaires
                }
                nomDe={nomDe}
                onTrancher={trancher}
              />
            ))}
          </div>
        </section>
      )}

      {actions.length > 0 && (
        <section>
          <EnTeteGroupe
            titre="Creations a confirmer"
            compte={actions.length}
            ton="warn"
            sous="Comptes sans equivalent eStale : creation planifiee (fournisseur / compte d'attente)."
          />
          <div className="mt-2 flex flex-col gap-2">
            {actions.map((e) => (
              <EntreeAction
                key={e.compteSource}
                entree={e}
                candidats={data.candidats.fournisseurs}
                nomDe={nomDe}
                onTrancher={trancher}
                onAnnuler={annuler}
              />
            ))}
          </div>
        </section>
      )}

      {resolu.notes.length > 0 && <PointsAttention notes={resolu.notes} />}

      <Accordeon titre="Mappes" compte={mappes.length} ton="ok">
        <TableEntrees entrees={mappes} nomDe={nomDe} onAnnuler={annuler} />
      </Accordeon>

      {ignores.length > 0 && (
        <Accordeon titre="Ignores" compte={ignores.length} ton="neutral">
          <TableEntrees entrees={ignores} nomDe={nomDe} onAnnuler={annuler} />
        </Accordeon>
      )}

      <Accordeon titre="Reportes (blocs B / C)" compte={reportes.length} ton="info">
        <TableEntrees entrees={reportes} nomDe={nomDe} onAnnuler={annuler} />
      </Accordeon>

      <ZoneImport pret={resolu.pretAImporter} aTraiter={resolu.aTraiter} />
    </div>
  );
}

function BandeauRecap({
  resolu,
  equilibre,
  total,
}: {
  resolu: ReturnType<typeof appliquerDecisions>;
  equilibre: Equilibre;
  total: number;
}) {
  return (
    <div className="rounded-md border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-[14px] font-medium text-ink">Etat du plan</h2>
          <Badge ton={resolu.pretAImporter ? "ok" : "err"} dot>
            {resolu.pretAImporter ? "pret a importer" : `${resolu.aTraiter} a traiter`}
          </Badge>
        </div>
        <div className="text-[11px] text-ink-3 font-mono">{total} compte(s) source</div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Stat label="A traiter" valeur={resolu.aTraiter} alerte={resolu.aTraiter > 0} />
        <Stat label="Mappes" valeur={resolu.compteurs.mappe} />
        <Stat label="A creer" valeur={resolu.compteurs.action_requise} />
        <Stat label="A valider" valeur={resolu.compteurs.warning_appariement} />
        <Stat label="Non mappes" valeur={resolu.compteurs.non_mappe} />
        <Stat label="Reportes" valeur={resolu.compteurs.reporte_bloc_b + resolu.compteurs.reporte_bloc_c} />
      </div>

      {!equilibre.equilibre && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-err-500/40 bg-err-50 px-3 py-2 text-[12px] text-err-700">
          <AlertTriangle strokeWidth={1.75} className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Grand livre DESEQUILIBRE (ecart {equilibre.ecart}) : total debit != total credit. Verifie
            l&apos;extraction (reports/totaux exclus, ecritures manquantes) avant tout import.
          </span>
        </div>
      )}
    </div>
  );
}

function EnTeteGroupe({
  titre,
  compte,
  ton,
  sous,
}: {
  titre: string;
  compte: number;
  ton: "err" | "warn" | "ok" | "info" | "neutral";
  sous?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">{titre}</h3>
        <Badge ton={ton} dot>
          {compte}
        </Badge>
      </div>
      {sous && <p className="mt-0.5 text-[12px] text-ink-3">{sous}</p>}
    </div>
  );
}

// --- Carte d'une entree A TRAITER (warning / non mappe) ---------------------

function EntreeATraiter({
  entree,
  candidats,
  nomDe,
  onTrancher,
}: {
  entree: EntreeMappingResolue;
  candidats: CandidatCompte[];
  nomDe: (n?: string) => string;
  onTrancher: (compteSource: string, decision: DecisionMapping) => void;
}) {
  const [motifOuvert, setMotifOuvert] = useState(false);
  const [motif, setMotif] = useState("");
  const cs = entree.compteSource;
  const estFournisseur = entree.categorie === "fournisseur";

  return (
    <div className="rounded-md border border-line bg-surface p-3.5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-ink-2">{cs}</span>
            <Badge ton="neutral">{CATEGORIE_LABEL[entree.categorie]}</Badge>
            <Badge ton={entree.statut === "warning_appariement" ? "warn" : "err"} dot>
              {STATUT_LABEL[entree.statut]}
            </Badge>
          </div>
          {entree.intitule && <p className="mt-1 text-[13px] text-ink">{entree.intitule}</p>}
        </div>
        {entree.confiance !== undefined && (
          <div className="text-right shrink-0">
            <div className="text-[11px] text-ink-4 uppercase tracking-wide">Score</div>
            <div className="font-mono text-[13px] text-ink-2">{entree.confiance.toFixed(2)}</div>
          </div>
        )}
      </div>

      {/* Candidat propose (warnings) */}
      {entree.cible && (
        <div className="mt-2 rounded-md border border-line bg-surface-2 px-3 py-2 text-[12.5px]">
          <span className="text-ink-3">Candidat eStale : </span>
          <span className="font-mono text-ink-2">{entree.cible.nomenclature}</span>
          {nomDe(entree.cible.nomenclature) && <span className="text-ink"> - {nomDe(entree.cible.nomenclature)}</span>}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {entree.cible && (
          <Button type="button" variant="primary" size="sm" onClick={() => onTrancher(cs, { type: "valider_candidat" })}>
            <Check strokeWidth={2} /> Valider le candidat
          </Button>
        )}

        <SelectCible
          candidats={candidats}
          onChoisir={(nomenclature) => onTrancher(cs, { type: "choisir_cible", nomenclature })}
        />

        {estFournisseur && (
          <Button type="button" variant="secondary" size="sm" onClick={() => onTrancher(cs, { type: "creer_fournisseur" })}>
            <Database strokeWidth={1.5} /> Marquer a creer
          </Button>
        )}

        <Button type="button" variant="danger" size="sm" onClick={() => setMotifOuvert((v) => !v)}>
          <Ban strokeWidth={1.5} /> Ignorer
        </Button>
      </div>

      {motifOuvert && (
        <div className="mt-2 flex items-center gap-2">
          <input
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Motif (obligatoire, trace)"
            className="flex-1 h-8 px-2.5 rounded-md border border-line bg-surface text-[13px] text-ink"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={motif.trim().length === 0}
            onClick={() => onTrancher(cs, { type: "ignorer", motif: motif.trim() })}
          >
            Confirmer l&apos;ignore
          </Button>
        </div>
      )}
    </div>
  );
}

function SelectCible({
  candidats,
  onChoisir,
}: {
  candidats: CandidatCompte[];
  onChoisir: (nomenclature: string) => void;
}) {
  return (
    <select
      value=""
      onChange={(e) => {
        if (e.target.value) onChoisir(e.target.value);
      }}
      className="h-[26px] rounded-sm border border-line bg-surface px-2 text-[12px] text-ink max-w-[240px]"
      aria-label="Choisir un autre compte eStale"
    >
      <option value="">Choisir un autre compte...</option>
      {candidats.map((c) => (
        <option key={c.nomenclature} value={c.nomenclature}>
          {c.nomenclature} - {c.intitule}
        </option>
      ))}
    </select>
  );
}

// --- Carte d'une entree ACTION (creation) -----------------------------------

function EntreeAction({
  entree,
  candidats,
  nomDe,
  onTrancher,
  onAnnuler,
}: {
  entree: EntreeMappingResolue;
  candidats: CandidatCompte[];
  nomDe: (n?: string) => string;
  onTrancher: (compteSource: string, decision: DecisionMapping) => void;
  onAnnuler: (compteSource: string) => void;
}) {
  const cs = entree.compteSource;
  const confirme = entree.decision?.type === "creer_fournisseur";
  const estFournisseur = entree.categorie === "fournisseur";
  const action = entree.action;

  return (
    <div className="rounded-md border border-line bg-surface px-3.5 py-2.5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-ink-2">{cs}</span>
            <Badge ton="neutral">{CATEGORIE_LABEL[entree.categorie]}</Badge>
            {confirme && (
              <Badge ton="ok" dot>
                confirme
              </Badge>
            )}
          </div>
          {entree.intitule && <p className="mt-1 text-[13px] text-ink">{entree.intitule}</p>}
          <p className="mt-0.5 text-[12px] text-ink-3">
            {action?.type === "creer_fournisseur"
              ? "Fournisseur a creer dans eStale."
              : action?.type === "creer_sous_compte"
                ? `Sous-compte d'attente a creer (${action.parent}${action.suffix} - ${action.nom}).`
                : "Creation planifiee."}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {estFournisseur && !confirme && (
            <>
              <Button type="button" variant="secondary" size="sm" onClick={() => onTrancher(cs, { type: "creer_fournisseur" })}>
                <Check strokeWidth={2} /> Confirmer
              </Button>
              <SelectCible
                candidats={candidats}
                onChoisir={(nomenclature) => onTrancher(cs, { type: "choisir_cible", nomenclature })}
              />
            </>
          )}
          {confirme && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onAnnuler(cs)}>
              <Undo2 strokeWidth={1.5} /> Annuler
            </Button>
          )}
        </div>
      </div>
      {nomDe(entree.cible?.nomenclature) && (
        <p className="mt-1 text-[12px] text-ink-3">
          Cible : <span className="font-mono text-ink-2">{entree.cible?.nomenclature}</span> - {nomDe(entree.cible?.nomenclature)}
        </p>
      )}
    </div>
  );
}

// --- Points d'attention (notes : 489, decisions inapplicables...) -----------

function PointsAttention({ notes }: { notes: string[] }) {
  return (
    <section>
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Points d&apos;attention</h3>
      <ul className="mt-1.5 space-y-1">
        {notes.map((n, i) => (
          <li key={i} className="text-[12.5px] text-ink-2">
            - {n}
          </li>
        ))}
      </ul>
    </section>
  );
}

// --- Accordeon + table (mappes / ignores / reportes) ------------------------

function Accordeon({
  titre,
  compte,
  ton,
  children,
}: {
  titre: string;
  compte: number;
  ton: "ok" | "info" | "neutral";
  children: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div className="rounded-md border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left"
        aria-expanded={ouvert}
      >
        <span className="flex items-center gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">{titre}</span>
          <Badge ton={ton} dot>
            {compte}
          </Badge>
        </span>
        <ChevronDown
          strokeWidth={1.5}
          className={cn("w-4 h-4 text-ink-4 transition-transform", ouvert && "rotate-180")}
        />
      </button>
      {ouvert && <div className="border-t border-line px-2 py-2">{children}</div>}
    </div>
  );
}

function TableEntrees({
  entrees,
  nomDe,
  onAnnuler,
}: {
  entrees: EntreeMappingResolue[];
  nomDe: (n?: string) => string;
  onAnnuler: (compteSource: string) => void;
}) {
  if (entrees.length === 0) {
    return <p className="px-2 py-3 text-[12.5px] text-ink-3">Aucun compte dans ce groupe.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead className="text-left text-[11px] uppercase text-ink-4">
          <tr>
            <th className="px-2 py-1 font-medium">Compte</th>
            <th className="px-2 font-medium">Categorie</th>
            <th className="px-2 font-medium">Cible eStale</th>
            <th className="px-2 font-medium">Statut</th>
            <th className="px-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {entrees.map((e) => (
            <tr key={e.compteSource} className="border-t border-line">
              <td className="px-2 py-1.5 font-mono text-ink-2 align-top">{e.compteSource}</td>
              <td className="px-2 text-ink align-top">{CATEGORIE_LABEL[e.categorie]}</td>
              <td className="px-2 align-top">
                {e.cible ? (
                  <span>
                    <span className="font-mono text-ink-2">{e.cible.nomenclature}</span>
                    {nomDe(e.cible.nomenclature) && <span className="text-ink-3"> - {nomDe(e.cible.nomenclature)}</span>}
                  </span>
                ) : (
                  <span className="text-ink-4">-</span>
                )}
              </td>
              <td className="px-2 align-top">
                <span className="inline-flex items-center gap-1.5">
                  {STATUT_LABEL[e.statut]}
                  {e.decision && (
                    <Badge ton="brand">{e.ignore ? "ignore" : "manuel"}</Badge>
                  )}
                </span>
              </td>
              <td className="px-2 align-top text-right">
                {e.decision && (
                  <button
                    type="button"
                    onClick={() => onAnnuler(e.compteSource)}
                    className="inline-flex items-center gap-1 text-[12px] text-ink-4 hover:text-green-700"
                  >
                    <Undo2 strokeWidth={1.5} className="w-3.5 h-3.5" /> annuler
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Import (desactive : increment suivant) ---------------------------------

function ZoneImport({ pret, aTraiter }: { pret: boolean; aTraiter: number }) {
  return (
    <div className="rounded-md border border-line bg-surface-2 p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button type="button" variant="primary" disabled title="Import : increment suivant">
          <Database strokeWidth={1.5} /> Importer dans eStale
        </Button>
        <Badge ton="neutral">Import : increment suivant</Badge>
        {pret ? (
          <span className="text-[12px] text-ink-2">Toutes les alertes sont tranchees : le plan est pret a importer.</span>
        ) : (
          <span className="text-[12px] text-ink-3">Il reste {aTraiter} compte(s) a trancher avant que le plan soit pret.</span>
        )}
      </div>
    </div>
  );
}

// --- Petit ---------------------------------------------------------------

function Stat({ label, valeur, alerte }: { label: string; valeur: number; alerte?: boolean }) {
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2">
      <div className={cn("text-[18px] font-semibold", alerte ? "text-err-700" : "text-ink")}>{valeur}</div>
      <div className="text-[11px] text-ink-3">{label}</div>
    </div>
  );
}
