"use client";

// Fiche-HUB d'un dossier de reprise (refonte 2026-08 : decoupee en zones, la fiche depassait
// 1 900 lignes). Ce fichier ne garde que la COMPOSITION :
//   1. EN-TETE : ref (S0XXX) + nom + adresse + statut + avancement + archiver/supprimer ;
//   2. BANDEAU "prochaine etape" : LA reponse a "on ne sait pas quoi faire" ;
//   3. les zones : PATRIMOINE (./zone-patrimoine : versement xlsx -> recap -> GO/STOP ->
//      injection), FICHES DE RENSEIGNEMENTS (./fiche-renseignements-bloc), SUIVI HUMAIN et
//      JOURNAL (./zone-suivi, repliables).
//
// ROLE (regle Sekou) : la fiche est LISIBLE par tout gestionnaire ; les zones d'ACTION sont
// reservees aux ADMINS REPRISE (grisees avec la raison, jamais cachees - ZoneAdminReprise).
// Le grisage n'est qu'une courtoisie : chaque Server Action / route refait le controle serveur.

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  MapPin,
  Archive,
  ArchiveRestore,
  Trash2,
  ChevronDown,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { PHASES } from "@/lib/reprise/domain/dossier";
import { archiverDossierAction, supprimerDossierRepriseAction } from "./actions";
import type { ProchaineEtape, ActionCible } from "@/lib/reprise/domain/prochaine-etape";
import { FicheRenseignementsBloc, type FicheOwnerVue } from "./fiche-renseignements-bloc";
import { ZoneAdminReprise } from "@/components/reprise/zone-admin";
import { ZonePatrimoine } from "./zone-patrimoine";
import { FrisePhases, GroupePhase, JournalDossier } from "./zone-suivi";
import {
  STATUT_DOSSIER_LABEL,
  STATUT_DOSSIER_TON,
  type Analyse,
  type AnalyseInitiale,
  type DossierFicheVue,
} from "./vues";

// Re-exports : la page serveur et les anciens importeurs gardent leur point d'entree.
export type { AnalyseInitiale, AnnexesVue, DossierFicheVue, EtapeVue, PatrimoineVue } from "./vues";

export function FicheDossierReprise({
  dossier,
  analyseInitiale,
  etapeSuivante,
  nbFichesGenerees,
  ecritureReelle,
  dejaInjecte,
  fiches,
  aDesOwners,
  mailActif,
  adminReprise,
}: {
  dossier: DossierFicheVue;
  analyseInitiale: AnalyseInitiale | null;
  etapeSuivante: ProchaineEtape;
  nbFichesGenerees: number;
  ecritureReelle: boolean;
  dejaInjecte: boolean;
  fiches: FicheOwnerVue[];
  aDesOwners: boolean;
  mailActif: boolean;
  /** Directeur / manager / super-admin : lui seul peut AGIR sur le dossier (le suivi reste a tous). */
  adminReprise: boolean;
}) {
  const pct = Math.round(dossier.avancement * 100);

  // Etat d'ouverture centralise des sections repliables (suivi / journal, secondaires). La zone
  // "concernee" par la prochaine etape s'ouvre par defaut ; les autres restent repliees (moins de
  // densite) SANS jamais etre cachees (tout se deplie). Le bandeau force l'ouverture + scroll.
  const [ouvertes, setOuvertes] = useState<Record<string, boolean>>(() => ({
    "zone-suivi": etapeSuivante.action === "zone:suivi",
    "zone-journal": false,
  }));
  const basculer = (id: string) => setOuvertes((o) => ({ ...o, [id]: !o[id] }));

  // "Aller a" une zone depuis le bandeau : ouvre la section cible (si repliable) puis scrolle.
  const allerAZone = (action: ActionCible) => {
    if (action === "nav:mapping") return; // gere par un <Link> (navigation), pas un scroll
    const id = action.replace("zone:", "zone-");
    setOuvertes((o) => ({ ...o, [id]: true }));
    // rAF : laisse React deplier la section avant de scroller vers l'ancre.
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  // Le recap + jeu vivent cote client apres une analyse. Initialise avec le jeu PERSISTE
  // (analyseInitiale) s'il existe : la vue ResultatsAnalyse s'affiche des l'ouverture et
  // injection/production marchent SANS re-analyser. Sinon null (jamais analyse dans un
  // adapter qui persiste le jeu).
  const [analyse, setAnalyse] = useState<Analyse | null>(analyseInitiale);

  // Checklist de SUIVI HUMAIN = TOUTES les etapes reelles du pipeline de reprise (R1..R11 +
  // eventuelles anciennes etapes preservees par la migration), groupees par phase dans l'ordre
  // canonique. Le patrimoine se pilote en zone 2 (fichiers verses) ; ici on suit l'avancement humain.
  const groupesSuivi = PHASES.map((phase) => ({
    phase,
    etapes: dossier.etapes.filter((e) => e.phase === phase),
  })).filter((gr) => gr.etapes.length > 0);

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/reprise-copro/dossiers"
        className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-green-700 w-fit"
      >
        <ArrowLeft strokeWidth={1.5} className="w-3.5 h-3.5" /> Tous les dossiers
      </Link>

      {/* ZONE 1 - En-tete (+ actions archiver / supprimer) */}
      <div className="bg-surface border border-line rounded-md p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-mono text-[12px] text-ink-2">{dossier.ref}</span>
              <Badge ton={STATUT_DOSSIER_TON[dossier.statut]} dot>
                {STATUT_DOSSIER_LABEL[dossier.statut]}
              </Badge>
              {dossier.archive && (
                <Badge ton="neutral" className="gap-1">
                  <Archive strokeWidth={1.5} className="w-3 h-3" /> Archive
                </Badge>
              )}
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

        {/* Actions dossier : archiver (reversible, discret) + supprimer (2 temps, irreversible). */}
        <ZoneAdminReprise
          admin={adminReprise}
          raison="Archiver ou supprimer une reprise engage le dossier du cabinet."
        >
          <ActionsDossier ref_={dossier.ref} nomUsuel={dossier.nomUsuel} archive={dossier.archive} nbFichesGenerees={nbFichesGenerees} dejaInjecte={dejaInjecte} />
        </ZoneAdminReprise>
      </div>

      {/* BANDEAU "prochaine etape" : LA reponse a "on ne sait pas quoi faire". Un dossier archive
          sort du pipeline actif -> on affiche un rappel d'archive a la place. */}
      {dossier.archive ? (
        <div className="rounded-md border border-line bg-surface-2 px-4 py-3 text-[13px] text-ink-3 flex items-center gap-2">
          <Archive strokeWidth={1.5} className="w-4 h-4 text-ink-4 shrink-0" />
          Dossier archive - consultable en lecture. Desarchive-le (en-tete) pour reprendre le suivi.
        </div>
      ) : (
        <BandeauProchaineEtape etape={etapeSuivante} dossierRef={dossier.ref} onAller={allerAZone} />
      )}

      {/* ZONE 2 - Patrimoine (fichiers Excel verses, parsing deterministe) */}
      <div id="zone-patrimoine" className="scroll-mt-4">
        <ZonePatrimoine
          dossier={dossier}
          analyse={analyse}
          onAnalyse={setAnalyse}
          ecritureReelle={ecritureReelle}
          dejaInjecte={dejaInjecte}
          adminReprise={adminReprise}
        />
      </div>

      {/* ZONE 3 - Fiches de renseignements (ancre pour le bandeau ; garde son propre en-tete) */}
      <div id="zone-fiches" className="scroll-mt-4">
        <FicheRenseignementsBloc
          dossierRef={dossier.ref}
          aDesOwners={aDesOwners}
          fiches={fiches}
          mailActif={mailActif}
          ecritureReelle={ecritureReelle}
          adminReprise={adminReprise}
        />
      </div>

      {/* ZONE 4 - Suivi humain (repliable) */}
      <SectionRepliable
        id="zone-suivi"
        titre="Suivi humain"
        soustitre="Etapes reelles de la reprise - cliquer pour avancer"
        ouverte={ouvertes["zone-suivi"] ?? false}
        onBasculer={() => basculer("zone-suivi")}
      >
        <Card>
          <FrisePhases etapes={dossier.etapes} />
          <div className="flex flex-col">
            {groupesSuivi.map((gr) => (
              <GroupePhase key={gr.phase} dossierRef={dossier.ref} phase={gr.phase} etapes={gr.etapes} />
            ))}
          </div>
        </Card>
      </SectionRepliable>

      {/* ZONE 5 - Journal (repliable) */}
      <SectionRepliable
        id="zone-journal"
        titre="Journal du dossier"
        ouverte={ouvertes["zone-journal"] ?? false}
        onBasculer={() => basculer("zone-journal")}
      >
        <JournalDossier dossierRef={dossier.ref} journal={dossier.journal} />
      </SectionRepliable>
    </div>
  );
}

// --- BANDEAU "prochaine etape" ----------------------------------------------
// Rend l'action a mettre en avant, coloree selon la tonalite (vert discret / ambre / rouge), avec
// LE bouton de l'action directement dedans (scroll vers la zone, ou lien vers l'ecran de mapping
// avec la ref pre-remplie). C'est le premier reflexe de lecture de la fiche.
const TON_BANDEAU: Record<ProchaineEtape["tonalite"], { conteneur: string; titre: string; bouton: string }> = {
  normal: {
    conteneur: "border-green-600/40 bg-green-50",
    titre: "text-green-800",
    bouton: "bg-green-700 hover:bg-green-800 text-white",
  },
  attention: {
    conteneur: "border-warn-500/50 bg-warn-50",
    titre: "text-warn-700",
    bouton: "bg-warn-500 hover:bg-warn-700 text-white",
  },
  bloque: {
    conteneur: "border-err-500/50 bg-err-50",
    titre: "text-err-700",
    bouton: "bg-err-500 hover:bg-err-700 text-white",
  },
};

function BandeauProchaineEtape({
  etape,
  dossierRef,
  onAller,
}: {
  etape: ProchaineEtape;
  dossierRef: string;
  onAller: (action: ActionCible) => void;
}) {
  const ton = TON_BANDEAU[etape.tonalite];
  return (
    <div className={cn("rounded-md border px-4 py-3.5", ton.conteneur)}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-4">Prochaine etape</p>
          <p className={cn("mt-0.5 text-[15px] font-semibold", ton.titre)}>{etape.titre}</p>
          <p className="mt-1 text-[12.5px] text-ink-2">{etape.description}</p>
        </div>
        {etape.action && etape.actionLibelle && (
          <div className="shrink-0">
            {etape.action === "nav:mapping" ? (
              <Link
                href={`/reprise-copro/mapping-compta?ref=${encodeURIComponent(dossierRef)}`}
                className={cn(
                  "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md text-[13px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
                  ton.bouton,
                )}
              >
                {etape.actionLibelle}
                <ExternalLink strokeWidth={1.75} className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => onAller(etape.action!)}
                className={cn(
                  "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md text-[13px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
                  ton.bouton,
                )}
              >
                {etape.actionLibelle}
                <ArrowRight strokeWidth={1.75} className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// --- SECTION REPLIABLE ------------------------------------------------------
// En-tete cliquable (titre + chevron) qui replie/deplie son contenu. Repliee = moins de densite
// visuelle ; jamais cachee (tout se deplie). Recoit un id (ancre de scroll depuis le bandeau).
function SectionRepliable({
  id,
  titre,
  soustitre,
  ouverte,
  onBasculer,
  children,
}: {
  id: string;
  titre: string;
  soustitre?: string;
  ouverte: boolean;
  onBasculer: () => void;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-4">
      <button
        type="button"
        onClick={onBasculer}
        aria-expanded={ouverte}
        className="w-full flex items-center gap-2 px-1 py-1.5 text-left group"
      >
        <ChevronDown
          strokeWidth={2}
          className={cn("w-4 h-4 text-ink-4 transition-transform", ouverte ? "" : "-rotate-90")}
        />
        <span className="text-[13px] font-semibold text-ink">{titre}</span>
        {soustitre && <span className="text-[11px] text-ink-4 truncate">- {soustitre}</span>}
      </button>
      {ouverte && <div className="mt-1">{children}</div>}
    </section>
  );
}

// --- ACTIONS DOSSIER (archiver / supprimer) ---------------------------------
// Archiver = reversible (bouton discret). Supprimer = irreversible, confirmation EN DEUX TEMPS
// (rappel ref + nom + "irreversible" + ce qui part avec), calquee sur le module Dossiers.
function ActionsDossier({
  ref_,
  nomUsuel,
  archive,
  nbFichesGenerees,
  dejaInjecte,
}: {
  ref_: string;
  nomUsuel: string;
  archive: boolean;
  nbFichesGenerees: number;
  dejaInjecte: boolean;
}) {
  const [confirmeSuppr, setConfirmeSuppr] = useState(false);
  const [archivePending, startArchive] = useTransition();
  const [supprPending, startSuppr] = useTransition();
  const toast = useToast();

  const basculerArchive = () => {
    startArchive(async () => {
      const r = await archiverDossierAction(ref_, !archive);
      if (r.ok) toast.ok(archive ? "Dossier desarchive." : "Dossier archive.");
      else toast.err(r.message);
    });
  };

  const supprimer = () => {
    startSuppr(async () => {
      const r = await supprimerDossierRepriseAction(ref_);
      // En cas de succes, l'action redirige (pas de retour). On ne gere ici que l'echec.
      if (!r.ok) toast.err(r.message);
    });
  };

  return (
    <div className="mt-4 pt-3 border-t border-line">
      {!confirmeSuppr ? (
        <div className="flex items-center gap-4 flex-wrap">
          <button
            type="button"
            onClick={basculerArchive}
            disabled={archivePending}
            className="inline-flex items-center gap-1.5 text-[12px] text-ink-3 hover:text-ink transition-colors disabled:opacity-50"
          >
            {archive ? (
              <>
                <ArchiveRestore strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0" /> Desarchiver
              </>
            ) : (
              <>
                <Archive strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0" /> Archiver ce dossier
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => setConfirmeSuppr(true)}
            className="inline-flex items-center gap-1.5 text-[12px] text-ink-4 hover:text-err-700 transition-colors ml-auto"
          >
            <Trash2 strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0" /> Supprimer definitivement
          </button>
        </div>
      ) : (
        <div className="rounded-md border border-err-700/40 bg-err-50 px-3 py-2.5">
          <p className="text-[12.5px] font-medium text-err-700">
            Supprimer definitivement le dossier {ref_} - « {nomUsuel} » ?
          </p>
          <p className="mt-1 text-[12px] text-ink-2">
            Action <span className="font-medium">irreversible</span>. Partent avec le dossier : le suivi (etapes,
            journal), le jeu de donnees analyse
            {nbFichesGenerees > 0 ? ` et ${nbFichesGenerees} fiche(s) de renseignements` : ""}.
            {dejaInjecte && " La copro deja injectee dans eStale n'est PAS supprimee (seul le suivi de reprise part)."}
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={supprimer}
              disabled={supprPending}
              className="h-8 px-3 rounded-md bg-err-700 text-white text-[12px] font-medium hover:bg-err-500 disabled:opacity-50"
            >
              {supprPending ? "Suppression..." : "Supprimer definitivement"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmeSuppr(false)}
              disabled={supprPending}
              className="h-8 px-3 rounded-md border border-line text-[12px] text-ink-2 hover:border-line-2"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

