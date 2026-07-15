"use client";

// Fiche-HUB d'un dossier de reprise = onboarding d'une copro, en 4 zones :
//   1. EN-TETE : ref (S0XXX) + nom + adresse + Badge statut global + avancement %.
//   2. PATRIMOINE (pilote IA) : coeur du hub. Tant qu'aucune analyse -> upload multi-PDF +
//      "Analyser les documents". Apres analyse -> (a) cadrage extrait a verifier (cases que
//      l'humain bascule), (b) patrimoine extrait (compteurs + ecart par cle + anomalies +
//      badge "pret a produire"), (c) actions (injecter dry-run -> rapport ; produire xlsx).
//      Le patrimoine n'est PAS une liste de cases manuelles : c'est une ACTION IA + des
//      RESULTATS affiches (les etapes P1-P4 sont refletees ici, pas cochees a la main).
//   3. SUIVI HUMAIN : frise des phases + checklist courte de ce que l'IA ne fait PAS
//      (Verification V1-V4, Finalisation P5, Comptabilite C1-C6, Cloture) - cases cochables.
//   4. JOURNAL : timeline + ajout de note.
//
// L'analyse (server) reporte deja compteurs + anomalies dans le dossier (appliquerRecap).
// Le jeu de donnees vit cote client (state) le temps d'une session pour injecter/produire :
// l'etat memoire ne le persiste pas, une re-analyse le regenere.

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Minus,
  Circle,
  MessageSquare,
  FileUp,
  Sparkles,
  Download,
  Database,
  MapPin,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { formatDateLongue } from "@/lib/format-date";
import type { Phase, StatutEtape, StatutDossier } from "@/lib/reprise/domain/dossier";
import { PHASES } from "@/lib/reprise/domain/dossier";
import { ETABLISSEMENTS_REAL31 } from "@/lib/reprise/domain/etablissements";
import type { JeuDeDonnees, LiaisonOwnerCompte } from "@/lib/reprise/domain/patrimoine";
import type { MetadonneesCopro } from "@/lib/reprise/services/onboarder-copro";
import type { RecapPatrimoine } from "@/lib/reprise/services/orchestrateur-patrimoine";
import {
  majEtapeAction,
  ajouterNoteAction,
  produireAction,
  injecterAction,
  trancherLiaisonAction,
  type FichierProduit,
  type RapportInjectionVue,
} from "./actions";
import { FicheRenseignementsBloc, type FicheOwnerVue } from "./fiche-renseignements-bloc";

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Phases dont les etapes sont du SUIVI HUMAIN (cochable). Le PATRIMOINE est pilote par
// l'IA (zone 2) : ses etapes P1-P4 ne sont PAS des cases ici.
const PHASES_SUIVI: Phase[] = ["VERIFICATION", "COMPTABILITE", "MISE_EN_SERVICE"];
// Seule etape PATRIMOINE qui reste un geste humain de finalisation.
const ETAPE_PATRIMOINE_SUIVI = "P5";

// Vue serialisable d'une etape (ce que la page server projette).
export interface EtapeVue {
  code: string;
  phase: Phase;
  libelle: string;
  statut: StatutEtape;
}

export interface PatrimoineVue {
  analyseFaite: boolean;
  nbLots: number;
  nbCles: number;
  nbCoproprietaires: number;
  nbAttributions: number;
  nbAnomalies: number;
}

// Vue serialisable d'un dossier pour la fiche-hub.
export interface DossierFicheVue {
  ref: string;
  nomUsuel: string;
  adresse?: string;
  statut: StatutDossier;
  avancement: number; // 0..1
  etapesFaites: number;
  etapesTotal: number;
  etapes: EtapeVue[];
  anomalies: string[];
  patrimoine: PatrimoineVue;
  journal: { date: string; texte: string }[];
}

const STATUT_DOSSIER_LABEL: Record<StatutDossier, string> = {
  offre: "Offre",
  production: "Production",
  verification: "Verification",
  comptabilite: "Comptabilite",
  finalisation: "Finalisation",
  termine: "Termine",
};

const STATUT_DOSSIER_TON: Record<StatutDossier, "neutral" | "info" | "warn" | "ok"> = {
  offre: "neutral",
  production: "info",
  verification: "warn",
  comptabilite: "warn",
  finalisation: "info",
  termine: "ok",
};

const PHASE_LABEL: Record<Phase, string> = {
  OFFRE: "Offre",
  PATRIMOINE: "Patrimoine",
  VERIFICATION: "Verification",
  COMPTABILITE: "Comptabilite",
  MISE_EN_SERVICE: "Mise en service",
};

// Cycle de statut au clic : a_faire -> en_cours -> fait -> ignore -> a_faire.
const STATUT_SUIVANT: Record<StatutEtape, StatutEtape> = {
  a_faire: "en_cours",
  en_cours: "fait",
  fait: "ignore",
  ignore: "a_faire",
};

const STATUT_ETAPE_LABEL: Record<StatutEtape, string> = {
  a_faire: "A faire",
  en_cours: "En cours",
  fait: "Fait",
  ignore: "Ignore",
};

interface Analyse {
  recap: RecapPatrimoine;
  jeu: JeuDeDonnees;
}

// Analyse rehydratee cote serveur depuis le jeu persiste (dossier.jeu). Meme forme que
// l'analyse de session : recap recalcule + jeu complet, pour injecter/produire directement.
export type AnalyseInitiale = Analyse;

export function FicheDossierReprise({
  dossier,
  analyseInitiale,
  modeIa,
  ecritureReelle,
  fiches,
  aDesOwners,
  mailActif,
}: {
  dossier: DossierFicheVue;
  analyseInitiale: AnalyseInitiale | null;
  modeIa: "claude" | "claude-cli" | "mistral" | "mock";
  ecritureReelle: boolean;
  fiches: FicheOwnerVue[];
  aDesOwners: boolean;
  mailActif: boolean;
}) {
  const pct = Math.round(dossier.avancement * 100);

  // Le recap + jeu vivent cote client apres une analyse. Initialise avec le jeu PERSISTE
  // (analyseInitiale) s'il existe : la vue ResultatsAnalyse s'affiche des l'ouverture et
  // injection/production marchent SANS re-analyser. Sinon null (jamais analyse dans un
  // adapter qui persiste le jeu).
  const [analyse, setAnalyse] = useState<Analyse | null>(analyseInitiale);

  // Etapes de SUIVI HUMAIN uniquement (Verification / Comptabilite / Mise en service +
  // la finalisation P5), groupees par phase dans l'ordre canonique.
  const etapesSuivi = dossier.etapes.filter(
    (e) => PHASES_SUIVI.includes(e.phase) || e.code === ETAPE_PATRIMOINE_SUIVI,
  );
  const groupesSuivi = PHASES.map((phase) => ({
    phase,
    etapes: etapesSuivi.filter((e) => e.phase === phase),
  })).filter((gr) => gr.etapes.length > 0);

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/reprise-copro/dossiers"
        className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-green-700 w-fit"
      >
        <ArrowLeft strokeWidth={1.5} className="w-3.5 h-3.5" /> Tous les dossiers
      </Link>

      {/* ZONE 1 - En-tete */}
      <div className="bg-surface border border-line rounded-md p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-[12px] text-ink-2">{dossier.ref}</span>
              <Badge ton={STATUT_DOSSIER_TON[dossier.statut]} dot>
                {STATUT_DOSSIER_LABEL[dossier.statut]}
              </Badge>
            </div>
            <h1 className="text-[20px] font-medium tracking-tight text-ink">{dossier.nomUsuel}</h1>
            {dossier.adresse && (
              <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-ink-3">
                <MapPin strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-4 shrink-0" />
                {dossier.adresse}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-[22px] font-semibold text-green-700 leading-none">{pct}%</div>
            <div className="mt-1 text-[11px] text-ink-3 font-mono">
              {dossier.etapesFaites}/{dossier.etapesTotal} etapes
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
            <div
              className="h-full bg-green-700 transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* ZONE 2 - Patrimoine (pilote IA) */}
      <ZonePatrimoine
        dossier={dossier}
        analyse={analyse}
        onAnalyse={setAnalyse}
        modeIa={modeIa}
        ecritureReelle={ecritureReelle}
      />

      {/* ZONE 2bis - Fiches de renseignements (courriers -> formulaire public -> validation) */}
      <FicheRenseignementsBloc
        dossierRef={dossier.ref}
        aDesOwners={aDesOwners}
        fiches={fiches}
        mailActif={mailActif}
        ecritureReelle={ecritureReelle}
      />

      {/* ZONE 3 - Suivi humain (ce que l'IA ne fait pas) */}
      <Card>
        <CardHeader>
          <CardTitle>Suivi humain</CardTitle>
          <span className="text-[11px] text-ink-4">Ce que l&apos;IA ne fait pas - cliquer pour avancer</span>
        </CardHeader>

        {/* Frise des phases en tete du bloc de suivi. */}
        <FrisePhases etapes={dossier.etapes} />

        <div className="flex flex-col">
          {groupesSuivi.map((gr) => (
            <GroupePhase key={gr.phase} dossierRef={dossier.ref} phase={gr.phase} etapes={gr.etapes} />
          ))}
        </div>
      </Card>

      {/* ZONE 4 - Journal */}
      <JournalDossier dossierRef={dossier.ref} journal={dossier.journal} />
    </div>
  );
}

// --- ZONE 2 : PATRIMOINE (pilote IA) ---------------------------------------

function ZonePatrimoine({
  dossier,
  analyse,
  onAnalyse,
  modeIa,
  ecritureReelle,
}: {
  dossier: DossierFicheVue;
  analyse: Analyse | null;
  onAnalyse: (a: Analyse | null) => void;
  modeIa: "claude" | "claude-cli" | "mistral" | "mock";
  ecritureReelle: boolean;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [analysePending, startAnalyse] = useTransition();
  const toast = useToast();

  const lancerAnalyse = () => {
    if (files.length === 0) return;
    startAnalyse(async () => {
      const fd = new FormData();
      fd.append("dossierId", dossier.ref);
      for (const f of files) fd.append("pdfs", f);
      try {
        // Upload via route handler (pas Server Action) : evite la limite de body + le
        // souci de transfert des objets File sous Turbopack/Next 16.
        const res = await fetch("/api/reprise/analyser", { method: "POST", body: fd });
        const r = await res.json();
        if (res.ok && r.ok) {
          onAnalyse({ recap: r.recap, jeu: r.jeu });
          toast.ok("Analyse terminee - dossier alimente.");
        } else {
          toast.err(r.message ?? "Erreur pendant l'analyse.");
        }
      } catch {
        toast.err("Erreur reseau pendant l'analyse.");
      }
    });
  };

  // Deja analyse au moins une fois (compteurs persistes) mais pas dans cette session :
  // on affiche les resultats persistes et on invite a re-analyser pour injecter/produire.
  const dejaAnalyse = dossier.patrimoine.analyseFaite;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Patrimoine</CardTitle>
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
        {/* Upload + analyse : toujours disponible (relancer une analyse actualise). */}
        <div className="rounded-md border border-line bg-surface-2 p-3.5">
          <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
            <FileUp strokeWidth={1.5} className="w-4 h-4 text-ink-3" />
            Documents du syndic sortant (PDF)
          </div>
          <p className="mt-1 text-[12px] text-ink-3">
            L&apos;IA extrait le cadrage ET le patrimoine. Vous ne faites que verifier ce qu&apos;elle
            a sorti.
          </p>
          <div className="mt-2.5 rounded-md border border-line bg-surface px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-3">Documents attendus</p>
            <ul className="mt-1 text-[12px] text-ink-2 space-y-0.5">
              <li>PV d&apos;AG de nomination + feuille de presence <span className="text-ink-4">- coproprietaires, mandat</span></li>
              <li>RGDD / annexes comptables de la convocation <span className="text-ink-4">- cles reelles (eau froide/chaude, chauffage, ascenseur...)</span></li>
              <li>EDD (etat descriptif de division) + RCP et modificatifs <span className="text-ink-4">- lots, cles, tantiemes</span></li>
              <li>Fiche synthese, registre national <span className="text-ink-4">- controle : nb lots, batiments</span></li>
              <li>
                Grand livre N-1 <span className="text-ink-4">- compta : ecritures, comptes 450 lies aux coproprietaires</span>
                <span className="ml-1 inline-block rounded bg-surface-2 px-1 text-[10px] text-ink-3">nom de fichier avec &laquo; grand livre &raquo; ou &laquo; GL &raquo;</span>
              </li>
            </ul>
          </div>
          <input
            type="file"
            accept="application/pdf"
            multiple
            onChange={(e) => {
              const ajoutes = Array.from(e.target.files ?? []);
              setFiles((prev) => {
                const parCle = new Map(prev.map((f) => [`${f.name}:${f.size}`, f]));
                for (const f of ajoutes) parCle.set(`${f.name}:${f.size}`, f);
                return [...parCle.values()];
              });
              e.target.value = ""; // permet de re-selectionner / rajouter les memes
            }}
            className="mt-3 block w-full text-[13px] text-ink-2 file:mr-3 file:rounded-md file:border-0 file:bg-green-700 file:px-3 file:py-2 file:text-white file:text-[13px] file:font-medium hover:file:bg-green-600 file:cursor-pointer"
          />
          <p className="mt-1.5 text-[11px] text-ink-4">
            Ajoute les documents un par un ou en lot : ils s&apos;accumulent (retire au besoin).
          </p>
          {files.length > 0 && (
            <ul className="mt-2 text-[12px] text-ink-3 space-y-1">
              {files.map((f) => (
                <li key={`${f.name}:${f.size}`} className="flex items-center gap-2">
                  <span className="truncate">- {f.name}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setFiles((prev) => prev.filter((x) => `${x.name}:${x.size}` !== `${f.name}:${f.size}`))
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
            <Button type="button" variant="primary" onClick={lancerAnalyse} disabled={files.length === 0 || analysePending}>
              {analysePending ? "Analyse en cours..." : dejaAnalyse ? "Relancer l'analyse" : "Analyser les documents"}
            </Button>
          </div>
        </div>

        {/* Chargement : l'analyse (CLI / IA) prend 1 a 3 min -> etat clair, pas juste un bouton grise. */}
        {analysePending ? (
          <div className="flex items-center gap-3 rounded-md border border-line bg-surface-2 px-4 py-4">
            <Loader2 strokeWidth={1.75} className="w-5 h-5 text-green-700 animate-spin shrink-0" />
            <div>
              <p className="text-[13px] font-medium text-ink">Analyse en cours...</p>
              <p className="text-[12px] text-ink-3">
                L&apos;IA lit les documents (structure + coproprietaires). Compte plusieurs minutes (jusqu&apos;a ~15 min avec Opus sur de gros scans), ne quitte pas la page.
              </p>
            </div>
          </div>
        ) : analyse ? (
          <ResultatsAnalyse dossier={dossier} recap={analyse.recap} jeu={analyse.jeu} ecritureReelle={ecritureReelle} />
        ) : dejaAnalyse ? (
          // Cas 2 : deja analyse (compteurs persistes) mais pas dans cette session.
          <PatrimoinePersistant patrimoine={dossier.patrimoine} anomalies={dossier.anomalies} />
        ) : (
          // Cas 3 : jamais analyse.
          <p className="text-[13px] text-ink-3">
            Aucune analyse pour le moment. Deposez les documents ci-dessus, puis lancez l&apos;analyse.
          </p>
        )}
      </div>
    </Card>
  );
}

// Vue apres une analyse EN SESSION : cadrage a verifier + patrimoine extrait + actions.
function ResultatsAnalyse({
  dossier,
  recap,
  jeu,
  ecritureReelle,
}: {
  dossier: DossierFicheVue;
  recap: RecapPatrimoine;
  jeu: JeuDeDonnees;
  ecritureReelle: boolean;
}) {
  // (a) Cadrage extrait, a verifier : etats "a verifier / verifie" bascules par l'humain.
  const nbBatiments = new Set(
    jeu.lots.map((l) => l.escalier).filter((s): s is string => !!s && s.trim().length > 0),
  ).size;
  const clesDetectees = recap.cles.length;
  const cleDefaut = jeu.cles.find((c) => c.defaut)?.code;
  const notesEdd = recap.notes.length;
  const mappingOwners = recap.owners.total;

  const cadrage: PointCadrage[] = [
    { cle: "bat", libelle: "Batiments detectes", valeur: nbBatiments > 0 ? `${nbBatiments}` : "1 (aucun escalier distinct)" },
    { cle: "cles", libelle: "Cles de repartition detectees", valeur: `${clesDetectees}${cleDefaut ? ` (defaut : ${cleDefaut})` : ""}` },
    { cle: "edd", libelle: "EDD retenu (notes d'extraction)", valeur: notesEdd > 0 ? `${notesEdd} point(s) de vigilance` : "aucune note - EDD direct" },
    { cle: "owners", libelle: "Mapping coproprietaires", valeur: `${mappingOwners} owner(s) - ${recap.owners.sci} SCI, ${recap.owners.couples} couple(s)` },
  ];

  return (
    <div className="flex flex-col gap-5">
      <CadrageAVerifier points={cadrage} />
      <PatrimoineExtrait recap={recap} />
      {(recap.compta || recap.liaison) && <ComptaLiaison dossierRef={dossier.ref} recap={recap} jeu={jeu} />}
      <ActionsPatrimoine dossier={dossier} jeu={jeu} pretAProduire={recap.pretAProduire} ecritureReelle={ecritureReelle} />
    </div>
  );
}

// Bloc COMPTA + LIAISON (analyse unifiee avec grand livre) : balance du grand livre + etat de la
// liaison owners <-> comptes 450, avec la revue humaine des cas ambigus. La liaison ambigue NE
// BLOQUE PAS l'injection patrimoine : c'est un complement compta reutilise par le mapping.
function ComptaLiaison({
  dossierRef,
  recap,
  jeu,
}: {
  dossierRef: string;
  recap: RecapPatrimoine;
  jeu: JeuDeDonnees;
}) {
  // Etat local des liaisons (seed depuis le jeu) : mis a jour a chaque tranche pour refleter
  // instantanement les compteurs sans re-analyser.
  const [liaisons, setLiaisons] = useState<LiaisonOwnerCompte[]>(jeu.liaisons450 ?? []);
  const nomParOwner = new Map(jeu.owners.map((o) => [o.id, [o.nom, o.prenom].filter(Boolean).join(" ")]));

  const lies = liaisons.filter((l) => l.statut === "lie").length;
  const aTrancher = liaisons.filter((l) => l.statut === "ambigu").length;
  const sansCompte = liaisons.filter((l) => l.statut === "non_trouve").length;
  const ambigues = liaisons.filter((l) => l.statut === "ambigu");

  return (
    <section>
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Comptabilite (grand livre)</h3>

      {recap.compta && (
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-md border border-line bg-surface px-3 py-2">
            <div className="flex items-center gap-1.5">
              <Badge ton={recap.compta.equilibre ? "ok" : "err"} dot>
                {recap.compta.equilibre ? "equilibree" : `ecart ${recap.compta.ecart}`}
              </Badge>
            </div>
            <div className="text-[11px] text-ink-3 mt-1">Balance grand livre</div>
          </div>
          <Stat label="Comptes" valeur={recap.compta.nbComptes} petit />
          <Stat label="Ecritures" valeur={recap.compta.nbEcritures} petit />
          <div className="rounded-md border border-line bg-surface px-3 py-2">
            <div className="text-[15px] font-semibold text-ink">
              <span className="text-green-700">{lies}</span>
              <span className="text-ink-4"> / </span>
              <span className={aTrancher > 0 ? "text-warn-700" : "text-ink-3"}>{aTrancher}</span>
              <span className="text-ink-4"> / </span>
              <span className="text-ink-3">{sansCompte}</span>
            </div>
            <div className="text-[11px] text-ink-3">Liaison 450 : lies / a trancher / sans compte</div>
          </div>
        </div>
      )}

      <p className="mt-2 text-[12px] text-ink-3">
        La liaison rattache chaque coproprietaire a son compte 450 de l&apos;ancien syndic (cle de la reprise
        comptable). Les cas ambigus se tranchent ci-dessous ; ils ne bloquent pas l&apos;injection du patrimoine.
      </p>

      {ambigues.length > 0 ? (
        <ul className="mt-3 divide-y divide-line rounded-md border border-line">
          {ambigues.map((l) => (
            <LigneLiaisonAmbigue
              key={l.ownerId}
              dossierRef={dossierRef}
              liaison={l}
              nom={nomParOwner.get(l.ownerId) ?? l.ownerId}
              onTranchee={setLiaisons}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[12px] text-ink-3">
          {liaisons.length > 0 ? "Aucune liaison ambigue a trancher." : "Aucune liaison (pas de grand livre exploite)."}
        </p>
      )}
    </section>
  );
}

// Une ligne de liaison AMBIGUE : owner + selecteur de compte 450 candidat (ou "sans compte").
function LigneLiaisonAmbigue({
  dossierRef,
  liaison,
  nom,
  onTranchee,
}: {
  dossierRef: string;
  liaison: LiaisonOwnerCompte;
  nom: string;
  onTranchee: (liaisons: LiaisonOwnerCompte[]) => void;
}) {
  const [choix, setChoix] = useState<string>(liaison.candidats?.[0]?.compteSource ?? "");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const trancher = () => {
    startTransition(async () => {
      const r = await trancherLiaisonAction(dossierRef, liaison.ownerId, choix);
      if (r.ok) {
        onTranchee(r.liaisons);
        toast.ok(choix ? "Liaison rattachee." : "Coproprietaire marque sans compte 450.");
      } else {
        toast.err(r.message);
      }
    });
  };

  return (
    <li className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[13px] text-ink truncate">{nom}</p>
        <p className="text-[11px] text-ink-4">
          {liaison.groupeHomonyme ? "homonyme cote grand livre - " : ""}
          confiance {liaison.confiance !== undefined ? liaison.confiance.toFixed(2) : "?"}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <select
          value={choix}
          onChange={(e) => setChoix(e.target.value)}
          className="h-8 rounded-md border border-line bg-surface px-2 text-[12px] font-mono text-ink"
        >
          {(liaison.candidats ?? []).map((c) => (
            <option key={c.compteSource} value={c.compteSource}>
              {c.compteSource} ({c.confiance.toFixed(2)})
            </option>
          ))}
          <option value="">- sans compte 450 -</option>
        </select>
        <Button type="button" variant="secondary" onClick={trancher} disabled={pending}>
          {pending ? "..." : "Trancher"}
        </Button>
      </div>
    </li>
  );
}

interface PointCadrage {
  cle: string;
  libelle: string;
  valeur: string;
}

// (a) Cadrage extrait, a verifier : chaque ligne bascule "a verifier" <-> "verifie".
function CadrageAVerifier({ points }: { points: PointCadrage[] }) {
  const [verifies, setVerifies] = useState<Record<string, boolean>>({});
  const tousVerifies = points.every((p) => verifies[p.cle]);

  return (
    <section>
      <div className="flex items-center gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Cadrage extrait, a verifier</h3>
        {tousVerifies && (
          <Badge ton="ok" dot>
            tout verifie
          </Badge>
        )}
      </div>
      <ul className="mt-2 divide-y divide-line rounded-md border border-line">
        {points.map((p) => {
          const ok = !!verifies[p.cle];
          return (
            <li key={p.cle} className="flex items-center gap-3 px-3 py-2">
              <button
                type="button"
                onClick={() => setVerifies((v) => ({ ...v, [p.cle]: !v[p.cle] }))}
                aria-label={`${p.libelle} : ${ok ? "verifie" : "a verifier"}`}
                className="shrink-0"
              >
                <span
                  className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center transition-colors",
                    ok ? "bg-green-700 text-white" : "bg-surface border border-line",
                  )}
                  aria-hidden
                >
                  {ok && <Check strokeWidth={3} className="w-3 h-3" />}
                </span>
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-ink">{p.libelle}</p>
                <p className="text-[12px] text-ink-3">{p.valeur}</p>
              </div>
              <Badge ton={ok ? "ok" : "neutral"} className="shrink-0">
                {ok ? "Verifie" : "A verifier"}
              </Badge>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// (b) Patrimoine extrait : compteurs + ecart par cle + anomalies + badge "pret a produire".
function PatrimoineExtrait({ recap }: { recap: RecapPatrimoine }) {
  const anomalies = [
    ...recap.notes.map((m) => ({ ton: "info" as const, message: m })),
    ...recap.checks.warnings.map((w) => ({ ton: "warn" as const, message: w.message })),
    ...recap.checks.erreurs.map((e) => ({ ton: "err" as const, message: e.message })),
  ];

  return (
    <section>
      <div className="flex items-center gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Patrimoine extrait</h3>
        <Badge ton={recap.pretAProduire ? "ok" : "err"} dot>
          {recap.pretAProduire ? "pret a produire" : "erreurs bloquantes"}
        </Badge>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Lots" valeur={recap.lots.total} />
        <Stat label="Cles" valeur={recap.cles.length} />
        <Stat label="Coproprietaires" valeur={recap.owners.total} />
        <Stat label="Attributions" valeur={recap.attributions.total} />
      </div>

      {recap.attributions.lotsOrphelins > 0 && (
        <p className="mt-2 text-[12px] text-err-700">
          {recap.attributions.lotsOrphelins} lot(s) orphelin(s) (sans coproprietaire).
        </p>
      )}

      <h4 className="mt-4 text-[11px] font-medium text-ink-3 uppercase tracking-wide">Ecart par cle</h4>
      <div className="mt-1.5 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-left text-[11px] uppercase text-ink-4">
            <tr>
              <th className="py-1 font-medium">Code</th>
              <th className="font-medium">Libelle</th>
              <th className="text-right font-medium">Lots</th>
              <th className="text-right font-medium">Somme</th>
              <th className="text-right font-medium">Ecart</th>
            </tr>
          </thead>
          <tbody>
            {recap.cles.map((c) => (
              <tr key={c.code} className="border-t border-line">
                <td className="py-1.5 font-mono text-ink-2">{c.code}</td>
                <td className="text-ink">{c.libelle}</td>
                <td className="text-right text-ink-2">{c.nbLots}</td>
                <td className="text-right text-ink-2">{c.sommeCalculee}</td>
                <td className="text-right">
                  <Badge ton={c.ecart === 0 ? "ok" : "err"}>{c.ecart}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {anomalies.length > 0 && (
        <div className="mt-4">
          <h4 className="text-[11px] font-medium text-ink-3 uppercase tracking-wide">
            Anomalies et points de vigilance ({anomalies.length})
          </h4>
          <ul className="mt-1.5 space-y-1">
            {anomalies.map((a, i) => (
              <li
                key={i}
                className={cn(
                  "text-[12.5px]",
                  a.ton === "err" && "text-err-700",
                  a.ton === "warn" && "text-warn-700",
                  a.ton === "info" && "text-ink-2",
                )}
              >
                - {a.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// (c) Actions : creer la copro + injecter (dry-run ou reel) + produire xlsx (repli).
// Un mini-formulaire copro (etablissement + nom + gestion + adresse) precede l'injection :
// createCondo a besoin de ces metadonnees avant d'injecter le patrimoine.
function ActionsPatrimoine({
  dossier,
  jeu,
  pretAProduire,
  ecritureReelle,
}: {
  dossier: DossierFicheVue;
  jeu: JeuDeDonnees;
  pretAProduire: boolean;
  ecritureReelle: boolean;
}) {
  const [rapport, setRapport] = useState<RapportInjectionVue | null>(null);
  const [fichiers, setFichiers] = useState<FichierProduit[] | null>(null);
  const [injPending, startInjection] = useTransition();
  const [prodPending, startProduction] = useTransition();
  const toast = useToast();
  const confirmer = useConfirm();

  // Champs copro. Reference = ref du dossier (non modifiable). Nom pre-rempli depuis le
  // nom usuel. Gestion CONDO par defaut. Adresse : on pre-decoupe grossierement l'adresse
  // du dossier si presente, mais code postal / ville restent a saisir (obligatoires eStale).
  const [establishmentID, setEstablishmentID] = useState("");
  const [name, setName] = useState(dossier.nomUsuel);
  const [management, setManagement] = useState<"CONDO" | "AS" | "AFU">("CONDO");
  const [street, setStreet] = useState(dossier.adresse ?? "");
  const [postcode, setPostcode] = useState("");
  const [city, setCity] = useState("");

  // Injection possible seulement si l'etablissement + les champs adresse obligatoires
  // sont renseignes (createCondo exige postcode/city/country).
  const metaComplet =
    establishmentID.trim().length > 0 &&
    name.trim().length > 0 &&
    postcode.trim().length > 0 &&
    city.trim().length > 0;

  const lancerInjection = () => {
    startInjection(async () => {
      const meta: MetadonneesCopro = {
        name: name.trim(),
        reference: dossier.ref,
        management,
        establishmentID,
        address: {
          postcode: postcode.trim(),
          city: city.trim(),
          country: "France",
          ...(street.trim() ? { street: street.trim() } : {}),
        },
      };
      const r = await injecterAction(dossier.ref, jeu, meta);
      if (r.ok) {
        setRapport(r.rapport);
        if (r.rapport.succes) {
          toast.ok(r.rapport.reel ? "Injection REELLE terminee (copro creee dans eStale)." : "Simulation d'injection reussie.");
        } else {
          toast.err(r.rapport.reel ? "Injection reelle arretee sur une erreur." : "Simulation arretee sur une erreur.");
        }
      } else {
        toast.err(r.message);
      }
    });
  };

  // GO/STOP : confirmation systematique. En mode REEL, la modale est en rouge (danger) et
  // rappelle qu'on ECRIT en PRODUCTION. En dry-run, confirmation legere (aucun effet reseau).
  const injecter = async () => {
    if (!metaComplet) return;
    const ok = await confirmer(
      ecritureReelle
        ? {
            titre: "Ecriture REELLE dans eStale (PRODUCTION)",
            message: `La copro "${name.trim()}" (ref ${dossier.ref}) va etre CREEE puis alimentee dans l'eStale de PRODUCTION. Cette action est irreversible cote eStale. Confirmer ?`,
            confirmer: "GO - ecrire en PROD",
            annuler: "STOP",
            danger: true,
          }
        : {
            titre: "Simulation d'injection (dry-run)",
            message: "Aucune ecriture reelle : on deroule le plan pour verification. Lancer la simulation ?",
            confirmer: "Lancer la simulation",
            annuler: "Annuler",
          },
    );
    if (!ok) return;
    lancerInjection();
  };

  const produire = () => {
    startProduction(async () => {
      const r = await produireAction(dossier.ref, jeu);
      if (r.ok) {
        setFichiers(r.fichiers);
        toast.ok("Fichiers eStale produits.");
      } else {
        toast.err(r.message);
      }
    });
  };

  return (
    <section>
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Actions</h3>

      {/* Indicateur de MODE : dry-run (defaut, vert) vs reel (rouge, ecritures PROD). */}
      <div
        className={cn(
          "mt-2 rounded-md border px-3 py-2 text-[12px]",
          ecritureReelle ? "border-err-500/40 bg-err-50 text-err-700" : "border-line bg-surface-2 text-ink-2",
        )}
      >
        {ecritureReelle ? (
          <span>
            <span className="font-semibold">Mode REEL</span> - l&apos;injection ECRIT dans l&apos;eStale de
            PRODUCTION. Une confirmation GO/STOP sera demandee.
          </span>
        ) : (
          <span>
            <span className="font-semibold">Mode DRY-RUN</span> - simulation sans aucune ecriture reelle
            (ESTALE_ECRITURE non positionne sur &laquo; reel &raquo;).
          </span>
        )}
      </div>

      {/* Mini-formulaire copro : createCondo a besoin de ces metadonnees. */}
      <div className="mt-3 rounded-md border border-line bg-surface p-3.5">
        <div className="text-[12px] font-medium text-ink">Copropriete a creer dans eStale</div>
        <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-3">Etablissement (obligatoire)</span>
            <select
              value={establishmentID}
              onChange={(e) => setEstablishmentID(e.target.value)}
              className="h-8 rounded-md border border-line bg-surface px-2 text-[13px] text-ink"
            >
              <option value="">- choisir -</option>
              {ETABLISSEMENTS_REAL31.map((et) => (
                <option key={et.id} value={et.id}>
                  {et.sigle} - {et.nom}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-3">Reference (ref du dossier)</span>
            <input
              value={dossier.ref}
              readOnly
              className="h-8 rounded-md border border-line bg-surface-2 px-2 text-[13px] font-mono text-ink-3"
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[11px] font-medium text-ink-3">Nom de la copropriete</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 rounded-md border border-line bg-surface px-2 text-[13px] text-ink"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-3">Type de gestion</span>
            <select
              value={management}
              onChange={(e) => setManagement(e.target.value as "CONDO" | "AS" | "AFU")}
              className="h-8 rounded-md border border-line bg-surface px-2 text-[13px] text-ink"
            >
              <option value="CONDO">CONDO - copropriete (defaut)</option>
              <option value="AS">AS - association syndicale</option>
              <option value="AFU">AFU - association fonciere urbaine</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-3">Rue (optionnel)</span>
            <input
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              className="h-8 rounded-md border border-line bg-surface px-2 text-[13px] text-ink"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-3">Code postal (obligatoire)</span>
            <input
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              inputMode="numeric"
              className="h-8 rounded-md border border-line bg-surface px-2 text-[13px] text-ink"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-3">Ville (obligatoire)</span>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="h-8 rounded-md border border-line bg-surface px-2 text-[13px] text-ink"
            />
          </label>
        </div>
        <p className="mt-2 text-[11px] text-ink-4">Pays : France (par defaut). L&apos;etablissement et l&apos;adresse (CP + ville) sont exiges par eStale.</p>
      </div>

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          variant={ecritureReelle ? "danger" : "primary"}
          onClick={injecter}
          disabled={injPending || !metaComplet}
        >
          <Database strokeWidth={1.5} />{" "}
          {injPending
            ? ecritureReelle
              ? "Injection reelle..."
              : "Simulation..."
            : ecritureReelle
              ? "Creer + injecter dans eStale (REEL)"
              : "Creer + injecter (dry-run)"}
        </Button>
        <Button type="button" variant="secondary" onClick={produire} disabled={!pretAProduire || prodPending}>
          <Download strokeWidth={1.5} /> {prodPending ? "Generation..." : "Produire les xlsx (repli)"}
        </Button>
        {!metaComplet && (
          <span className="text-[12px] text-ink-3">Choisir un etablissement + saisir CP et ville pour injecter.</span>
        )}
        {!pretAProduire && (
          <span className="text-[12px] text-err-700">Production bloquee tant qu&apos;il reste des erreurs.</span>
        )}
      </div>

      {rapport && <RapportInjection rapport={rapport} />}
      {fichiers && <TelechargementsXlsx fichiers={fichiers} />}
    </section>
  );
}

function RapportInjection({ rapport }: { rapport: RapportInjectionVue }) {
  const c = rapport.compteurs;
  return (
    <div className="mt-3 rounded-md border border-line bg-surface-2 p-3.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] font-medium text-ink">
          Rapport d&apos;injection ({rapport.reel ? "REEL - PRODUCTION" : "dry-run"})
        </span>
        <Badge ton={rapport.reel ? "err" : "info"} dot>
          {rapport.reel ? "ecriture reelle" : "simulation"}
        </Badge>
        <Badge ton={rapport.succes ? "ok" : "err"} dot>
          {rapport.succes ? "plan complet" : "arrete sur erreur"}
        </Badge>
      </div>
      <p className="mt-1 text-[11.5px] text-ink-4 font-mono">
        condo {rapport.condoID || "(non cree)"}
        {rapport.coproCreee ? " - copro creee" : ""}
        {rapport.reel ? "" : " - aucune ecriture reelle"}
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
        <Stat label="Lots" valeur={c.lots} petit />
        <Stat label="Cles" valeur={c.cles} petit />
        <Stat label="Tantiemes" valeur={c.tantiemes} petit />
        <Stat label="Owners" valeur={c.owners} petit />
        <Stat label="Liens" valeur={c.links} petit />
      </div>

      <h4 className="mt-3 text-[11px] font-medium text-ink-3 uppercase tracking-wide">
        Plan ordonne ({rapport.operationsTotal} operation{rapport.operationsTotal > 1 ? "s" : ""})
      </h4>
      <ol className="mt-1.5 space-y-0.5">
        {rapport.operations.map((op) => (
          <li key={op.seq} className="flex items-baseline gap-2 text-[12px]">
            <span className="font-mono text-ink-4 w-6 shrink-0 text-right">{op.seq}</span>
            <span className="font-mono text-green-700 shrink-0">{op.mutation}</span>
            <span className="text-ink-2 min-w-0 truncate">{op.cible}</span>
            {op.ref && <span className="font-mono text-ink-4 shrink-0">-&gt; {op.ref}</span>}
          </li>
        ))}
        {rapport.operationsTotal > rapport.operations.length && (
          <li className="text-[12px] text-ink-4 pl-8">
            + {rapport.operationsTotal - rapport.operations.length} operation(s) de plus...
          </li>
        )}
      </ol>

      {rapport.avertissements.length > 0 && (
        <div className="mt-3">
          <h4 className="text-[11px] font-medium text-warn-700 uppercase tracking-wide">
            Avertissements ({rapport.avertissements.length})
          </h4>
          <ul className="mt-1 space-y-0.5">
            {rapport.avertissements.map((a, i) => (
              <li key={i} className="text-[12px] text-warn-700">
                - {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {rapport.erreur && (
        <p className="mt-3 text-[12px] text-err-700">Erreur : {rapport.erreur}</p>
      )}
    </div>
  );
}

function TelechargementsXlsx({ fichiers }: { fichiers: FichierProduit[] }) {
  return (
    <div className="mt-3 rounded-md border border-line bg-surface-2 p-3.5">
      <div className="flex items-center gap-2 text-[12px] font-medium text-ink">
        <Download strokeWidth={1.5} className="w-4 h-4 text-ink-3" /> Fichiers eStale (repli)
      </div>
      <p className="mt-1 text-[12px] text-ink-3">
        Import eStale dans l&apos;ordre strict : lots -&gt; cles -&gt; tantiemes -&gt; owners -&gt; links.
      </p>
      <ul className="mt-2 space-y-1.5">
        {fichiers.map((f) => (
          <li key={f.nom}>
            <a
              href={`data:${MIME_XLSX};base64,${f.base64}`}
              download={f.nom}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-green-700 hover:text-green-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 rounded"
            >
              <Download strokeWidth={1.5} className="w-3.5 h-3.5" />
              {f.nom}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Vue "compteurs persistes" (analyse d'une session precedente, jeu non conserve).
function PatrimoinePersistant({
  patrimoine,
  anomalies,
}: {
  patrimoine: PatrimoineVue;
  anomalies: string[];
}) {
  return (
    <section>
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Patrimoine extrait (dernier resultat)</h3>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Lots" valeur={patrimoine.nbLots} />
        <Stat label="Cles" valeur={patrimoine.nbCles} />
        <Stat label="Coproprietaires" valeur={patrimoine.nbCoproprietaires} />
        <Stat label="Attributions" valeur={patrimoine.nbAttributions} />
      </div>
      {anomalies.length > 0 && (
        <div className="mt-3">
          <h4 className="text-[11px] font-medium text-ink-3 uppercase tracking-wide">
            Anomalies et points de vigilance ({anomalies.length})
          </h4>
          <ul className="mt-1.5 space-y-1">
            {anomalies.map((a, i) => (
              <li key={i} className="text-[12.5px] text-ink-2">
                - {a}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 text-[12px] text-ink-3">
        Relancez l&apos;analyse ci-dessus pour injecter (dry-run) ou produire les fichiers : le detail
        du jeu de donnees n&apos;est pas conserve entre deux sessions.
      </p>
    </section>
  );
}

function Stat({ label, valeur, alerte, petit }: { label: string; valeur: number; alerte?: boolean; petit?: boolean }) {
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2">
      <div className={cn(petit ? "text-[15px]" : "text-[18px]", "font-semibold", alerte ? "text-err-700" : "text-ink")}>
        {valeur}
      </div>
      <div className="text-[11px] text-ink-3">{label}</div>
    </div>
  );
}

// --- ZONE 3 : SUIVI HUMAIN --------------------------------------------------

// Frise des phases : etat d'avancement de chaque grande phase (part des etapes faites).
function FrisePhases({ etapes }: { etapes: EtapeVue[] }) {
  const groupes = PHASES.map((phase) => {
    const liste = etapes.filter((e) => e.phase === phase);
    const faites = liste.filter((e) => e.statut === "fait" || e.statut === "ignore").length;
    return { phase, total: liste.length, faites };
  }).filter((gr) => gr.total > 0);

  return (
    <div className="px-4 py-3 border-b border-line flex items-stretch gap-2 overflow-x-auto">
      {groupes.map((gr) => {
        const complet = gr.faites === gr.total;
        const entame = gr.faites > 0 && !complet;
        return (
          <div
            key={gr.phase}
            className={cn(
              "flex-1 min-w-[120px] rounded-md border px-2.5 py-1.5",
              complet && "border-green-600/40 bg-green-50",
              entame && "border-info-500/30 bg-info-50",
              !complet && !entame && "border-line bg-surface-2",
            )}
          >
            <div className="text-[11px] font-semibold text-ink-2 truncate">{PHASE_LABEL[gr.phase]}</div>
            <div className={cn("text-[11px] font-mono", complet ? "text-green-700" : "text-ink-3")}>
              {gr.faites}/{gr.total}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GroupePhase({
  dossierRef,
  phase,
  etapes,
}: {
  dossierRef: string;
  phase: Phase;
  etapes: EtapeVue[];
}) {
  return (
    <div className="border-b border-line last:border-b-0">
      <div className="px-4 pt-3 pb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          {PHASE_LABEL[phase]}
        </span>
      </div>
      <ul>
        {etapes.map((e) => (
          <LigneEtape key={e.code} dossierRef={dossierRef} etape={e} />
        ))}
      </ul>
    </div>
  );
}

function LigneEtape({ dossierRef, etape }: { dossierRef: string; etape: EtapeVue }) {
  const [statut, setStatut] = useState<StatutEtape>(etape.statut);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const cycler = () => {
    const suivant = STATUT_SUIVANT[statut];
    const precedent = statut;
    setStatut(suivant); // optimiste
    startTransition(async () => {
      const r = await majEtapeAction(dossierRef, etape.code, suivant);
      if (r.ok) {
        toast.ok(`${etape.code} : ${STATUT_ETAPE_LABEL[suivant]}.`);
      } else {
        setStatut(precedent); // rollback
        toast.err(r.message);
      }
    });
  };

  return (
    <li className="flex items-center gap-2.5 px-4 py-2">
      <button
        type="button"
        onClick={cycler}
        disabled={pending}
        aria-label={`Etape ${etape.code} : ${STATUT_ETAPE_LABEL[statut]} (cliquer pour changer)`}
        title={`${STATUT_ETAPE_LABEL[statut]} - cliquer pour changer`}
        className="shrink-0 disabled:opacity-50"
      >
        <PastilleEtape statut={statut} />
      </button>
      <span className="font-mono text-[11px] text-ink-3 w-12 shrink-0">{etape.code}</span>
      <span
        className={cn(
          "flex-1 min-w-0 text-[13px]",
          statut === "fait" && "text-ink-2",
          statut === "en_cours" && "text-green-700 font-medium",
          statut === "a_faire" && "text-ink",
          statut === "ignore" && "text-ink-4 line-through",
        )}
      >
        {etape.libelle}
      </span>
      <Badge ton={BADGE_TON[statut]} className="shrink-0">
        {STATUT_ETAPE_LABEL[statut]}
      </Badge>
    </li>
  );
}

const BADGE_TON: Record<StatutEtape, "neutral" | "info" | "ok"> = {
  a_faire: "neutral",
  en_cours: "info",
  fait: "ok",
  ignore: "neutral",
};

// Pastille cochable, un rendu par statut.
function PastilleEtape({ statut }: { statut: StatutEtape }) {
  const base = "w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors";
  if (statut === "fait") {
    return (
      <span className={cn(base, "bg-green-700 text-white")} aria-hidden>
        <Check strokeWidth={3} className="w-3 h-3" />
      </span>
    );
  }
  if (statut === "en_cours") {
    return (
      <span className={cn(base, "bg-surface border-2 border-green-700 text-green-700")} aria-hidden>
        <Circle strokeWidth={0} className="w-2 h-2 fill-green-700" />
      </span>
    );
  }
  if (statut === "ignore") {
    return (
      <span className={cn(base, "bg-surface-2 border border-line text-ink-4")} aria-hidden>
        <Minus strokeWidth={2} className="w-3 h-3" />
      </span>
    );
  }
  return <span className={cn(base, "bg-surface border border-line")} aria-hidden />;
}

// --- ZONE 4 : JOURNAL -------------------------------------------------------

function JournalDossier({
  dossierRef,
  journal,
}: {
  dossierRef: string;
  journal: { date: string; texte: string }[];
}) {
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const envoyer = () => {
    const t = note.trim();
    if (!t) return;
    startTransition(async () => {
      const r = await ajouterNoteAction(dossierRef, t);
      if (r.ok) {
        toast.ok("Note ajoutee.");
        setNote("");
      } else {
        toast.err(r.message);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Journal du dossier</CardTitle>
      </CardHeader>
      <div className="px-4 py-3 border-b border-line flex items-center gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && envoyer()}
          placeholder="Ajouter une note..."
          className="flex-1 h-8 px-2.5 rounded-md border border-line bg-surface text-[13px] text-ink"
        />
        <button
          type="button"
          onClick={envoyer}
          disabled={!note.trim() || pending}
          className="h-8 px-3 rounded-md bg-green-700 text-white text-[12px] font-medium hover:bg-green-600 disabled:opacity-50 shrink-0"
        >
          Noter
        </button>
      </div>
      {journal.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-ink-3 text-center">Aucune entree pour le moment.</p>
      ) : (
        <ul className="divide-y divide-line">
          {[...journal].reverse().map((ev, idx) => (
            <li key={idx} className="flex items-start gap-2.5 px-4 py-2.5">
              <MessageSquare strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-4 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-ink">{ev.texte}</p>
                <p className="text-[11px] text-ink-4 mt-0.5">{formatDateLongue(ev.date.slice(0, 10))}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
