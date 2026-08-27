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
import { ArrowLeft, FileUp, Sparkles, Loader2, AlertTriangle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

import {
  appliquerDecisions,
  type DecisionEntree,
  type DecisionMapping,
  type EntreeMappingResolue,
} from "@/lib/reprise/domain/decisions-mapping";
import { enregistrerDecisionAction, oublierDecisionAction } from "./actions";
import { BlocProductionCompta } from "./bloc-production-compta";
import { SectionHomonymes, EntreeATraiter, EntreeAction, Accordeon, TableEntrees } from "./cartes-comptes";
import {
  montantEuro,
  type CompteAvantRepart,
  type DonneesRevue,
  type Equilibre,
  type LigneBalance,
} from "./vues-mapping";
import { NotesAnalyse } from "@/components/reprise/notes-analyse";
import { classerNotes } from "@/lib/reprise/domain/classement-notes";
import { verifierTailleLot } from "@/lib/reprise/domain/limites-upload";

function versTableau(decisions: Record<string, DecisionMapping>): DecisionEntree[] {
  return Object.entries(decisions).map(([compteSource, decision]) => ({ compteSource, decision }));
}

export function RevueMappingVue({
  persistant,
  refInitiale = "",
}: {
  persistant: boolean;
  /** Code copro pre-rempli depuis le bandeau "prochaine etape" (?ref=S0xxx). Reste editable. */
  refInitiale?: string;
}) {
  const [coproCode, setCoproCode] = useState(refInitiale);
  const [files, setFiles] = useState<File[]>([]);
  const [pending, startAnalyse] = useTransition();
  const [data, setData] = useState<DonneesRevue | null>(null);
  const [decisions, setDecisions] = useState<Record<string, DecisionMapping>>({});
  const toast = useToast();

  const lancerAnalyse = () => {
    const code = coproCode.trim();
    if (!code || files.length === 0) return;
    // Pre-verification du plafond AVANT l'upload (audit API 2026-07-16, P1-8) : message
    // immediat plutot qu'un 400 apres l'upload. Ici pipeline couche texte (pas d'appel IA) :
    // seul le plafond du LOT s'applique - la route refait le meme controle.
    //
    // En PRODUCTION ce plafond n'est pas le notre : Vercel coupe le body serverless a ~4,5 Mo
    // AVANT que la route ne tourne. On le dit avant l'upload (cf. limites-upload.ts).
    const totalOctets = files.reduce((s, f) => s + f.size, 0);
    const tropGros = verifierTailleLot(totalOctets, process.env.NODE_ENV === "production");
    if (tropGros) {
      toast.err(tropGros);
      return;
    }
    startAnalyse(async () => {
      const fd = new FormData();
      fd.append("coproCode", code);
      for (const f of files) fd.append("pdfs", f);
      try {
        const res = await fetch("/api/reprise/mapping-analyser", { method: "POST", body: fd });
        const r = await res.json();
        if (res.ok && r.ok) {
          setData({
            code,
            plan: r.plan,
            candidats: r.candidats,
            grandLivre: r.grandLivre ?? {},
            balance: r.balance ?? [],
            equilibre: r.equilibre,
          });
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
      />

      {pending ? (
        <ChargementAnalyse />
      ) : data ? (
        <ResultatRevue data={data} decisions={decisions} setDecisions={setDecisions} files={files} />
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
}: {
  coproCode: string;
  onCoproCode: (v: string) => void;
  files: File[];
  onFiles: (updater: (prev: File[]) => File[]) => void;
  pending: boolean;
  onAnalyse: () => void;
  dejaAnalyse: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Grand livre N-1</CardTitle>
        <Badge ton="ok" className="gap-1.5">
          <Sparkles strokeWidth={1.5} className="w-3 h-3" />
          {/* Couche texte locale : deterministe, zero IA, zero reseau. */}
          lecture couche texte - deterministe
        </Badge>
      </CardHeader>

      <div className="p-4 flex flex-col gap-4">
        <div className="rounded-md border border-line bg-surface-2 p-3.5">
          <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
            <FileUp strokeWidth={1.5} className="w-4 h-4 text-ink-3" />
            Grand livre du syndic sortant (PDF)
          </div>
          <p className="mt-1 text-[12px] text-ink-3">
            La couche texte du PDF natif est lue localement : toutes les ecritures (balance
            verifiee), puis chaque compte source est mappe vers eStale. PDF NATIF exige (pas un scan).
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
  files,
}: {
  data: DonneesRevue;
  decisions: Record<string, DecisionMapping>;
  setDecisions: (updater: (prev: Record<string, DecisionMapping>) => Record<string, DecisionMapping>) => void;
  /** Les fichiers GL de l'analyse : la production les re-uploade (route stateless). */
  files: File[];
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

  // Groupes homonymes (coproprietaires a comptes multiples) : presentes ENSEMBLE dans une section
  // dediee, et EXCLUS des groupes standards pour ne pas les afficher deux fois.
  const groupes = useMemo(() => data.plan.groupesHomonymes ?? [], [data.plan.groupesHomonymes]);
  const homonymeCompteSet = useMemo(() => new Set(groupes.flatMap((g) => g.comptes)), [groupes]);
  const entreeParCompte = useMemo(() => {
    const m = new Map<string, EntreeMappingResolue>();
    for (const e of entrees) m.set(e.compteSource, e);
    return m;
  }, [entrees]);

  const horsHomonyme = (e: EntreeMappingResolue) => !homonymeCompteSet.has(e.compteSource);
  const aTraiter = entrees.filter(
    (e) => horsHomonyme(e) && !e.ignore && (e.statut === "warning_appariement" || e.statut === "non_mappe"),
  );
  const actions = entrees.filter((e) => horsHomonyme(e) && !e.ignore && e.statut === "action_requise");
  const mappes = entrees.filter((e) => horsHomonyme(e) && !e.ignore && e.statut === "mappe");
  const ignores = entrees.filter((e) => horsHomonyme(e) && e.ignore);
  const reportes = entrees.filter(
    (e) => horsHomonyme(e) && !e.ignore && (e.statut === "reporte_bloc_b" || e.statut === "reporte_bloc_c"),
  );

  const nomDe = (nomenclature?: string) => (nomenclature ? nomParNomenclature.get(nomenclature) ?? "" : "");
  const gl = (compteSource: string) => data.grandLivre[compteSource];

  const avantRep = data.plan.avantRepartition;

  return (
    <div className="flex flex-col gap-5">
      {avantRep?.avantRepartition && <AlerteAvantRepartition comptes={avantRep.comptes} />}

      <BandeauRecap resolu={resolu} equilibre={data.equilibre} total={entrees.length} />

      {groupes.length > 0 && (
        <SectionHomonymes
          groupes={groupes}
          entreeParCompte={entreeParCompte}
          coproprietaires={data.candidats.coproprietaires}
          partis={data.candidats.partis}
          grandLivre={data.grandLivre}
          nomDe={nomDe}
          onTrancher={trancher}
          onAnnuler={annuler}
        />
      )}

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
                partis={data.candidats.partis}
                grandLivreCompte={gl(e.compteSource)}
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
                grandLivreCompte={gl(e.compteSource)}
                nomDe={nomDe}
                onTrancher={trancher}
                onAnnuler={annuler}
              />
            ))}
          </div>
        </section>
      )}

      {resolu.notes.length > 0 && (
        <NotesAnalyse notes={classerNotes(resolu.notes)} titre="Points d'attention" />
      )}

      {data.balance.length > 0 && <SectionBalance balance={data.balance} />}

      <Accordeon titre="Mappes" compte={mappes.length} ton="ok">
        <TableEntrees entrees={mappes} grandLivre={data.grandLivre} nomDe={nomDe} onAnnuler={annuler} />
      </Accordeon>

      {ignores.length > 0 && (
        <Accordeon titre="Ignores" compte={ignores.length} ton="neutral">
          <TableEntrees entrees={ignores} grandLivre={data.grandLivre} nomDe={nomDe} onAnnuler={annuler} />
        </Accordeon>
      )}

      <Accordeon titre="Reportes (blocs B / C)" compte={reportes.length} ton="info">
        <TableEntrees entrees={reportes} grandLivre={data.grandLivre} nomDe={nomDe} onAnnuler={annuler} />
      </Accordeon>

      <BlocProductionCompta coproCode={data.code} files={files} pret={resolu.pretAImporter} aTraiter={resolu.aTraiter} />
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

function AlerteAvantRepartition({ comptes }: { comptes: CompteAvantRepart[] }) {
  return (
    <div className="rounded-md border border-err-500/50 bg-err-50 px-4 py-3 text-[13px] text-err-700">
      <div className="flex items-start gap-2">
        <AlertTriangle strokeWidth={1.75} className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Ce grand livre semble etre la version AVANT repartition.</p>
          <p className="mt-1 text-[12.5px] text-err-700/90">
            {comptes.length} compte(s) de classe 6/7 portent un solde anterieur (report a-nouveau) non nul,
            alors qu&apos;apres cloture+repartition ils repartent a zero. Aucune reprise fiable n&apos;est
            possible : demander a l&apos;ancien syndic le grand livre APRES repartition/regule. Import bloque.
          </p>
          <ul className="mt-2 space-y-0.5 font-mono text-[11.5px]">
            {comptes.map((c) => (
              <li key={c.compte}>
                {c.compte} :{c.reportDebit ? ` report D ${montantEuro(c.reportDebit)}` : ""}
                {c.reportCredit ? ` report C ${montantEuro(c.reportCredit)}` : ""}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// --- Accordeon + table (mappes / ignores / reportes) ------------------------

/**
 * Balance par compte = l'artefact de verification de la COMPTABLE (regle REAL31 : elle valide
 * la balance de chaque compte, pas chaque ecriture). Table complete triee par compte : report
 * a-nouveau + ecritures extraites vs totaux imprimes par la source ; les comptes en ecart sont
 * mis en avant (a investiguer AVANT tout import), les reconcilies au centime rassurent d'un
 * coup d'oeil.
 */
function SectionBalance({ balance }: { balance: LigneBalance[] }) {
  const [ouvert, setOuvert] = useState(false);
  const enEcart = balance.filter((l) => l.statut === "ecart");
  const ok = balance.filter((l) => l.statut === "ok").length;
  const nonControles = balance.filter((l) => l.statut === "non_controle").length;
  return (
    <div className={cn("rounded-md border bg-surface", enEcart.length > 0 ? "border-err/40" : "border-line")}>
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left"
        aria-expanded={ouvert}
      >
        <span className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">
            Balance par compte (verification comptable)
          </span>
          <Badge ton="ok" dot>
            {ok} reconcilie{ok > 1 ? "s" : ""}
          </Badge>
          {enEcart.length > 0 && (
            <Badge ton="err" dot>
              {enEcart.length} en ecart
            </Badge>
          )}
          {nonControles > 0 && (
            <Badge ton="neutral" dot>
              {nonControles} non controle{nonControles > 1 ? "s" : ""}
            </Badge>
          )}
        </span>
        <ChevronDown
          strokeWidth={1.5}
          className={cn("w-4 h-4 text-ink-4 transition-transform", ouvert && "rotate-180")}
        />
      </button>
      {ouvert && (
        <div className="border-t border-line px-2 py-2">
          <p className="px-2 pb-2 text-[12px] text-ink-3">
            Report a-nouveau + ecritures extraites, confrontes aux totaux imprimes par l&apos;ancien
            syndic. Un compte &laquo; reconcilie &raquo; est verifie au centime : la comptable
            valide la balance, pas les lignes une a une.
          </p>
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-[12.5px]">
              <thead className="text-left text-[11px] uppercase text-ink-4 sticky top-0 bg-surface">
                <tr>
                  <th className="px-2 py-1.5">Compte</th>
                  <th className="px-2 py-1.5">Intitule</th>
                  <th className="px-2 py-1.5 text-right">Report D</th>
                  <th className="px-2 py-1.5 text-right">Report C</th>
                  <th className="px-2 py-1.5 text-right">Debit</th>
                  <th className="px-2 py-1.5 text-right">Credit</th>
                  <th className="px-2 py-1.5 text-right">Solde</th>
                  <th className="px-2 py-1.5 text-right">Ecart</th>
                  <th className="px-2 py-1.5">Statut</th>
                </tr>
              </thead>
              <tbody>
                {balance.map((l) => {
                  const ecart =
                    (l.ecartDebit && Math.abs(l.ecartDebit) >= 0.005 ? l.ecartDebit : 0) ||
                    (l.ecartCredit && Math.abs(l.ecartCredit) >= 0.005 ? l.ecartCredit : 0);
                  return (
                    <tr
                      key={l.compte}
                      className={cn("border-t border-line/60", l.statut === "ecart" && "bg-err/5")}
                    >
                      <td className="px-2 py-1 font-mono text-[12px] whitespace-nowrap">{l.compte}</td>
                      <td className="px-2 py-1 max-w-[220px] truncate" title={l.intitule}>
                        {l.intitule ?? ""}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">{montantEuro(l.reportDebit)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{montantEuro(l.reportCredit)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{montantEuro(l.debitCalcule)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{montantEuro(l.creditCalcule)}</td>
                      <td className="px-2 py-1 text-right tabular-nums font-medium">{montantEuro(l.solde)}</td>
                      <td className={cn("px-2 py-1 text-right tabular-nums", ecart !== 0 && "text-err font-semibold")}>
                        {ecart !== 0 ? montantEuro(ecart) : ""}
                      </td>
                      <td className="px-2 py-1">
                        {l.statut === "ok" && <Badge ton="ok">Reconcilie</Badge>}
                        {l.statut === "ecart" && <Badge ton="err">Ecart</Badge>}
                        {l.statut === "non_controle" && <Badge ton="neutral">Non controle</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
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

