"use client";

// ZONE PATRIMOINE de la fiche-hub (refonte 2026-08, extraite de fiche-dossier-reprise.tsx) :
// versement des fichiers Excel (parsing deterministe), resultats d'analyse (recap GO/STOP,
// cadrage, liaison 450, blocs compta), editeur de corrections, production des xlsx de repli
// et INJECTION eStale (dry-run par defaut, GO/STOP humain obligatoire - ADR-030).

import { useState, useTransition } from "react";
import {
  Check,
  FileUp,
  Sparkles,
  Download,
  Database,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { ETABLISSEMENTS_REAL31 } from "@/lib/reprise/domain/etablissements";
import type { JeuDeDonnees, LiaisonOwnerCompte } from "@/lib/reprise/domain/patrimoine";
import { verifierTailleLot } from "@/lib/reprise/domain/limites-upload";
import type { MetadonneesCopro } from "@/lib/reprise/services/onboarder-copro";
import type { RecapPatrimoine } from "@/lib/reprise/services/orchestrateur-patrimoine";
import type { VerdictRaccordement } from "@/lib/reprise/domain/controle-comptes";
import {
  produireAction,
  injecterAction,
  trancherLiaisonAction,
  type FichierProduit,
  type RapportInjectionVue,
} from "./actions";
import { DocumentsAnnexesBloc } from "./documents-annexes-bloc";
import { EditeurPatrimoine } from "./editeur-patrimoine";
import { ZoneAdminReprise } from "@/components/reprise/zone-admin";
import { NotesAnalyse } from "@/components/reprise/notes-analyse";
import { classerNotes, sourceNote, type NoteStructuree } from "@/lib/reprise/domain/classement-notes";
import { MIME_XLSX, type Analyse, type AnnexesVue, type DossierFicheVue, type PatrimoineVue } from "./vues";

// --- ZONE 2 : PATRIMOINE (fichiers Excel verses, parsing deterministe) ------

export function ZonePatrimoine({
  dossier,
  analyse,
  onAnalyse,
  ecritureReelle,
  dejaInjecte,
  adminReprise,
}: {
  dossier: DossierFicheVue;
  analyse: Analyse | null;
  onAnalyse: (a: Analyse | null) => void;
  ecritureReelle: boolean;
  dejaInjecte: boolean;
  adminReprise: boolean;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [analysePending, startAnalyse] = useTransition();
  const toast = useToast();

  const lancerAnalyse = () => {
    if (files.length === 0) return;
    // Pre-verification des plafonds AVANT l'upload (audit API 2026-07-16, P1-8) : message
    // actionnable immediat plutot qu'un echec API apres l'upload et des minutes d'attente.
    // Le grand livre (couche texte locale) n'est pas soumis au plafond IA. Raisonnement
    // complet : lib/reprise/domain/limites-upload.ts ; la route refait les memes controles.
    //
    // En PRODUCTION, le plafond du lot n'est PAS le notre : Vercel coupe le body d'une fonction
    // serverless a ~4,5 Mo AVANT que la route ne tourne (echec opaque cote navigateur). On le dit
    // ici, avant l'upload, avec la marche a suivre.
    const totalOctets = files.reduce((s, f) => s + f.size, 0);
    const tropGros = verifierTailleLot(totalOctets, process.env.NODE_ENV === "production");
    if (tropGros) {
      toast.err(tropGros);
      return;
    }
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
          onAnalyse({ recap: r.recap, jeu: r.jeu, ...(r.annexes ? { annexes: r.annexes } : {}) });
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
        <Badge ton="ok" className="gap-1.5">
          <Sparkles strokeWidth={1.5} className="w-3 h-3" />
          {/* Parsing local des fichiers Excel : deterministe, zero IA, zero reseau. */}
          fichiers Excel - lecture deterministe
        </Badge>
      </CardHeader>

      <div className="p-4 flex flex-col gap-4">
        {/* Upload + analyse : ADMIN REPRISE seulement (grise, jamais cache, pour les autres). */}
        <ZoneAdminReprise
          admin={adminReprise}
          raison="Verser les fichiers Excel du patrimoine et lancer l'analyse fait partie de la production du dossier."
        >
        <div className="rounded-md border border-line bg-surface-2 p-3.5">
          <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
            <FileUp strokeWidth={1.5} className="w-4 h-4 text-ink-3" />
            Fichiers Excel du patrimoine (+ grand livre PDF)
          </div>
          <p className="mt-1 text-[12px] text-ink-3">
            Verse les fichiers produits par le travail de preparation (skill estale-migration) :
            le module les relit, les verifie (auto-checks) et prepare l&apos;injection.
          </p>
          <div className="mt-2.5 rounded-md border border-line bg-surface px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-3">Fichiers attendus</p>
            <ul className="mt-1 text-[12px] text-ink-2 space-y-0.5">
              <li>lots.xlsx <span className="text-ink-4">- feuille &laquo; Lots &raquo; au format template eStale</span></li>
              <li>tantiemes_&lt;code&gt;_&lt;libelle&gt;.xlsx <span className="text-ink-4">- un fichier par cle (ex. tantiemes_001_charges-generales.xlsx)</span></li>
              <li>owners.xlsx <span className="text-ink-4">- feuille &laquo; Copropriétaires &raquo;, 22 colonnes</span></li>
              <li>links_DRAFT.xlsx <span className="text-ink-4">- attributions en NOMS (l&apos;injection API n&apos;a pas besoin des codes 4 caracteres)</span></li>
              <li>
                Grand livre N-1 et N (PDF natif) <span className="text-ink-4">- compta : ecritures, liaison des comptes 450</span>
                <span className="ml-1 inline-block rounded bg-surface-2 px-1 text-[10px] text-ink-3">nom de fichier avec &laquo; grand livre &raquo; ou &laquo; GL &raquo;</span>
              </li>
            </ul>
          </div>
          <input
            type="file"
            accept=".xlsx,application/pdf"
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
        </ZoneAdminReprise>

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
          <ResultatsAnalyse
            dossier={dossier}
            recap={analyse.recap}
            jeu={analyse.jeu}
            annexes={analyse.annexes}
            ecritureReelle={ecritureReelle}
            dejaInjecte={dejaInjecte}
            onAnalyse={onAnalyse}
            adminReprise={adminReprise}
          />
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

// Vue apres une analyse EN SESSION : cadrage a verifier + patrimoine extrait + editeur + actions.
function ResultatsAnalyse({
  dossier,
  recap,
  jeu,
  annexes,
  ecritureReelle,
  dejaInjecte,
  onAnalyse,
  adminReprise,
}: {
  dossier: DossierFicheVue;
  recap: RecapPatrimoine;
  jeu: JeuDeDonnees;
  annexes?: AnnexesVue;
  ecritureReelle: boolean;
  dejaInjecte: boolean;
  onAnalyse: (a: Analyse | null) => void;
  adminReprise: boolean;
}) {
  // Guidage par l'ecart : cliquer "corriger" sur une cle en ecart ouvre son editeur de tantiemes.
  const [focusCle, setFocusCle] = useState<string | null>(null);
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
      <PatrimoineExtrait recap={recap} onCorrigerCle={setFocusCle} />
      {(recap.compta || recap.liaison || recap.comptaErreur) && (
        <ComptaLiaison dossierRef={dossier.ref} recap={recap} jeu={jeu} adminReprise={adminReprise} />
      )}
      {annexes && annexes.annexes.length > 0 && (
        <ZoneAdminReprise
          admin={adminReprise}
          raison="Valider un contact d'annexe ecrit l'email / le telephone sur le coproprietaire du jeu."
        >
          <DocumentsAnnexesBloc
            dossierRef={dossier.ref}
            jeu={jeu}
            annexes={annexes.annexes}
            contacts={annexes.contacts}
            onJeuChange={(nouveauJeu) => onAnalyse({ jeu: nouveauJeu, recap, ...(annexes ? { annexes } : {}) })}
          />
        </ZoneAdminReprise>
      )}
      <ZoneAdminReprise
        admin={adminReprise}
        raison="L'editeur corrige le jeu de donnees extrait (lots, cles, tantiemes, coproprietaires)."
      >
        <EditeurPatrimoine
          dossierRef={dossier.ref}
          jeu={jeu}
          recap={recap}
          dejaInjecte={dejaInjecte}
          expandeeCle={focusCle}
          onExpandCle={setFocusCle}
          onApplied={(nouveauJeu, nouveauRecap) => onAnalyse({ jeu: nouveauJeu, recap: nouveauRecap })}
        />
      </ZoneAdminReprise>
      <ZoneAdminReprise
        admin={adminReprise}
        raison="Creer la copro dans eStale et produire les fichiers d'import sont des gestes d'onboarding."
      >
        <ActionsPatrimoine dossier={dossier} jeu={jeu} pretAProduire={recap.pretAProduire} ecritureReelle={ecritureReelle} />
      </ZoneAdminReprise>
    </div>
  );
}

/**
 * ALERTE ROUGE "grand livre AVANT repartition" : des comptes de classe 6/7 portent un solde
 * anterieur non nul (apres cloture+repartition ils repartent a zero) -> le grand livre transmis
 * est le mauvais. Bloquant metier : redemander a l'ancien syndic le grand livre APRES regule.
 * Libelles ok en UI (app interne) ; ici on n'a que des numeros + montants (PII-free par nature).
 */
function AlerteAvantRepartition({
  comptes,
}: {
  comptes: { compte: string; reportDebit: number; reportCredit: number }[];
}) {
  const euro = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div className="mt-2 rounded-md border border-err-500/50 bg-err-50 px-3 py-2.5 text-[12.5px] text-err-700">
      <div className="flex items-start gap-2">
        <AlertTriangle strokeWidth={1.75} className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Ce grand livre semble etre la version AVANT repartition.</p>
          <p className="mt-1 text-err-700/90">
            {comptes.length} compte(s) de classe 6/7 portent un solde anterieur non nul, alors qu&apos;apres
            cloture+repartition ils repartent a zero. Demander a l&apos;ancien syndic le grand livre APRES
            repartition/regule avant toute reprise.
          </p>
          <ul className="mt-1.5 space-y-0.5 font-mono text-[11.5px]">
            {comptes.map((c) => (
              <li key={c.compte}>
                {c.compte} :{c.reportDebit ? ` report D ${euro(c.reportDebit)}` : ""}
                {c.reportCredit ? ` report C ${euro(c.reportCredit)}` : ""}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ANOMALIE (ambre) "reports 6/7 sur le grand livre EN COURS" : des comptes de charges/produits
// portent un report a-nouveau non nul alors qu'apres cloture ils repartent a zero. A la difference
// du GL cloture (mauvais document, bloquant), c'est une anomalie a verifier sur l'exercice courant.
function AlerteReports67EnCours({
  comptes,
}: {
  comptes: { compte: string; reportDebit: number; reportCredit: number }[];
}) {
  const euro = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div className="mt-2 rounded-md border border-warn-500/50 bg-warn-50 px-3 py-2.5 text-[12.5px] text-warn-700">
      <div className="flex items-start gap-2">
        <AlertTriangle strokeWidth={1.75} className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Reports 6/7 non nuls sur l&apos;exercice EN COURS.</p>
          <p className="mt-1 text-warn-700/90">
            {comptes.length} compte(s) de classe 6/7 portent un solde anterieur non nul sur le grand livre en
            cours, alors qu&apos;apres cloture ils doivent repartir a zero. A verifier avec l&apos;ancien syndic.
          </p>
          <ul className="mt-1.5 space-y-0.5 font-mono text-[11.5px]">
            {comptes.map((c) => (
              <li key={c.compte}>
                {c.compte} :{c.reportDebit ? ` report D ${euro(c.reportDebit)}` : ""}
                {c.reportCredit ? ` report C ${euro(c.reportCredit)}` : ""}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// LE CONTROLE CROISE (le joyau) : verdict du raccordement cloture <-> en cours. Vert = les
// a-nouveaux de l'en cours egalent les soldes finaux du cloture au centime. Rouge = liste des
// ecarts + comptes sans vis-a-vis (l'un des deux grands livres est faux). PII-free (numeros +
// montants). Bloquant pour l'import cote plan de mapping.
function VerdictRaccordementBloc({ verdict }: { verdict: VerdictRaccordement }) {
  const euro = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (verdict.raccorde) {
    return (
      <div className="mt-3 rounded-md border border-ok-500/50 bg-ok-50 px-3 py-2.5 text-[12.5px] text-ok-700">
        <div className="flex items-start gap-2">
          <Check strokeWidth={2} className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Exercices raccordes au centime.</p>
            <p className="mt-1 text-ok-700/90">
              Les a-nouveaux de l&apos;exercice en cours egalent les soldes finaux de l&apos;exercice cloture
              ({verdict.nbComptesRaccordes} compte(s) confronte(s)). Le controle croise est vert.
            </p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-md border border-err-500/50 bg-err-50 px-3 py-2.5 text-[12.5px] text-err-700">
      <div className="flex items-start gap-2">
        <AlertTriangle strokeWidth={1.75} className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Les deux grands livres ne se raccordent pas.</p>
          <p className="mt-1 text-err-700/90">
            {verdict.ecarts.length} ecart(s) et {verdict.comptesSansVisAVis.length} compte(s) sans vis-a-vis.
            Les a-nouveaux de l&apos;exercice en cours doivent egaler les soldes finaux de l&apos;exercice
            cloture : l&apos;un des deux grands livres est faux. Import bloque tant que ce n&apos;est pas resolu.
          </p>
          {verdict.ecarts.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 font-mono text-[11.5px]">
              {verdict.ecarts.slice(0, 12).map((e) => (
                <li key={e.compte}>
                  {e.compte} : solde cloture {euro(e.soldeCloture)} vs report en cours {euro(e.reportEnCours)} (ecart{" "}
                  {euro(e.ecart)})
                </li>
              ))}
            </ul>
          )}
          {verdict.comptesSansVisAVis.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 font-mono text-[11.5px]">
              {verdict.comptesSansVisAVis.slice(0, 12).map((c) => (
                <li key={c.compte}>
                  {c.compte} : {euro(c.montant)} cote {c.cote === "cloture" ? "cloture" : "en cours"} sans vis-a-vis
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// Erreur d'extraction du grand livre (couche texte UNIQUEMENT : un PDF scanne n'est pas
// exploitable). Message actionnable, PII-free : il dit quoi redemander a l'ancien syndic. Le
// patrimoine, lui, reste analyse (degradation partielle) : ce bloc ne remplace que la compta.
function ErreurGrandLivre({ message }: { message: string }) {
  return (
    <div className="mt-2 rounded-md border border-err-500/50 bg-err-50 px-3 py-2.5 text-[12.5px] text-err-700">
      <div className="flex items-start gap-2">
        <AlertTriangle strokeWidth={1.75} className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Grand livre non exploite.</p>
          <p className="mt-1 text-err-700/90">{message}</p>
          <p className="mt-1 text-err-700/80">
            Le reste de l&apos;analyse (patrimoine) est valide. Redeposez le grand livre PDF natif puis
            relancez l&apos;analyse pour reprendre la comptabilite.
          </p>
        </div>
      </div>
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
  adminReprise,
}: {
  dossierRef: string;
  recap: RecapPatrimoine;
  jeu: JeuDeDonnees;
  adminReprise: boolean;
}) {
  // Etat local des liaisons (seed depuis le jeu) : mis a jour a chaque tranche pour refleter
  // instantanement les compteurs sans re-analyser.
  const [liaisons, setLiaisons] = useState<LiaisonOwnerCompte[]>(jeu.liaisons450 ?? []);
  const nomParOwner = new Map(jeu.owners.map((o) => [o.id, [o.nom, o.prenom].filter(Boolean).join(" ")]));

  const lies = liaisons.filter((l) => l.statut === "lie").length;
  const aTrancher = liaisons.filter((l) => l.statut === "ambigu").length;
  const sansCompte = liaisons.filter((l) => l.statut === "non_trouve").length;
  const ambigues = liaisons.filter((l) => l.statut === "ambigu");

  // Degradation PARTIELLE : le grand livre n'a pas pu etre extrait (ex. PDF scanne, couche texte
  // only). Le patrimoine reste analyse ; on affiche l'erreur GL ici sans faire echouer le dossier.
  if (recap.comptaErreur) {
    return (
      <section id="zone-compta" className="scroll-mt-4">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Comptabilite (grand livre)</h3>
        <ErreurGrandLivre message={recap.comptaErreur} />
      </section>
    );
  }

  return (
    <section id="zone-compta" className="scroll-mt-4">
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Comptabilite (grand livre)</h3>

      {recap.compta?.avantRepartition && recap.compta.avantRepartition.length > 0 && (
        <AlerteAvantRepartition comptes={recap.compta.avantRepartition} />
      )}

      {recap.compta && (
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-md border border-line bg-surface px-3 py-2">
            <div className="flex items-center gap-1.5">
              <Badge ton={recap.compta.equilibre ? "ok" : "err"} dot>
                {recap.compta.equilibre ? "equilibree" : `ecart ${recap.compta.ecart}`}
              </Badge>
            </div>
            <div className="text-[11px] text-ink-3 mt-1">Balance GL cloture (N-1)</div>
          </div>
          <Stat label="Comptes cloture" valeur={recap.compta.nbComptes} petit />
          <Stat label="Ecritures cloture" valeur={recap.compta.nbEcritures} petit />
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

      {/* Exercice EN COURS (second grand livre) : balance + comptes + ecritures, avec anomalie si
          des reports 6/7 subsistent (ils doivent repartir a zero apres cloture). */}
      {recap.comptaEnCours && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-md border border-line bg-surface px-3 py-2">
              <div className="flex items-center gap-1.5">
                <Badge ton={recap.comptaEnCours.equilibre ? "ok" : "err"} dot>
                  {recap.comptaEnCours.equilibre ? "equilibree" : `ecart ${recap.comptaEnCours.ecart}`}
                </Badge>
              </div>
              <div className="text-[11px] text-ink-3 mt-1">Balance GL en cours</div>
            </div>
            <Stat label="Comptes en cours" valeur={recap.comptaEnCours.nbComptes} petit />
            <Stat label="Ecritures en cours" valeur={recap.comptaEnCours.nbEcritures} petit />
          </div>
          {recap.comptaEnCours.avantRepartition && recap.comptaEnCours.avantRepartition.length > 0 && (
            <AlerteReports67EnCours comptes={recap.comptaEnCours.avantRepartition} />
          )}
        </>
      )}

      {/* LE CONTROLE CROISE (le joyau) : verdict du raccordement cloture <-> en cours. */}
      {recap.raccordement && <VerdictRaccordementBloc verdict={recap.raccordement} />}

      <p className="mt-2 text-[12px] text-ink-3">
        La liaison rattache chaque coproprietaire a son compte 450 de l&apos;ancien syndic (cle de la reprise
        comptable). Les cas ambigus se tranchent ci-dessous ; ils ne bloquent pas l&apos;injection du patrimoine.
      </p>

      {ambigues.length > 0 ? (
        <ZoneAdminReprise
          admin={adminReprise}
          raison="Trancher une liaison rattache un coproprietaire a son compte 450 chez l'ancien syndic."
          className="mt-3"
        >
          <ul className="divide-y divide-line rounded-md border border-line">
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
        </ZoneAdminReprise>
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
// onCorrigerCle : guidage par l'ecart -> ouvre l'editeur de tantiemes de la cle fautive.
function PatrimoineExtrait({ recap, onCorrigerCle }: { recap: RecapPatrimoine; onCorrigerCle: (code: string) => void }) {
  // Tout-venant hierarchise : notes d'extraction/compta/liaison classees par heuristique, +
  // les checks deja typés (erreurs bloquantes -> erreur, warnings -> anomalie), regroupes par
  // source. Les alertes dediees (avant-repartition, GL non exploite) restent gerees ailleurs.
  const notes: NoteStructuree[] = [
    ...classerNotes(recap.notes),
    ...recap.checks.warnings.map((w) => ({ niveau: "anomalie" as const, source: sourceNote(w.message), texte: w.message })),
    ...recap.checks.erreurs.map((e) => ({ niveau: "erreur" as const, source: sourceNote(e.message), texte: e.message })),
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
              <th className="text-right font-medium" />
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
                <td className="text-right">
                  {c.ecart !== 0 && (
                    <button
                      type="button"
                      onClick={() => onCorrigerCle(c.code)}
                      className="text-[12px] font-medium text-green-700 hover:text-green-600 underline decoration-dotted underline-offset-2"
                    >
                      corriger
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {notes.length > 0 && (
        <div className="mt-4">
          <NotesAnalyse notes={notes} />
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
          {/* Anomalies deja persistees (recap.notes + warnings des checks agreges) : defaut
              "anomalie" quand aucune heuristique plus forte ne tranche. */}
          <NotesAnalyse notes={classerNotes(anomalies, { niveauParDefaut: "anomalie" })} />
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

