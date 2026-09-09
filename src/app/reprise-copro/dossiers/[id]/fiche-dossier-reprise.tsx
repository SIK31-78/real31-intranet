"use client";

// FICHE d'un dossier de reprise (tableau de suivi d'équipe, ADR-037). Ce fichier garde la
// COMPOSITION et l'EN-TÊTE :
//   1. EN-TÊTE : réf + nom + adresse + sortant + date de bascule (cadrage éditable), avancement,
//      archiver / supprimer (admin) ;
//   2. ÉQUIPE : qui tient chaque rôle (select) -> assignation en masse des étapes du rôle ;
//   3. BANDEAU « prochaine étape » : LA réponse à « on ne sait pas quoi faire » ;
//   4. CHECKLIST par phase + JOURNAL (./zone-suivi) ;
//   5. FICHES DE RENSEIGNEMENTS (./fiche-renseignements-bloc) : vraie étape de fin de reprise.
//
// RÔLE : tout gestionnaire vit le suivi (statuts, assignations, notes, équipe, cadrage) ; archiver,
// supprimer et les gestes des fiches sont réservés aux admins reprise (grisés, jamais cachés).

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  MapPin,
  Archive,
  ArchiveRestore,
  Trash2,
  ArrowRight,
  Pencil,
  Building2,
  CalendarDays,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { ZoneAdminReprise } from "@/components/reprise/zone-admin";
import { PHASE_LABEL, ROLES_REPRISE, ROLE_LABEL, type EquipeReprise, type RoleReprise } from "@/lib/reprise/domain/dossier";
import type { ProchaineEtape } from "@/lib/reprise/domain/prochaine-etape";
import type { CollaborateurVue } from "@/app/reprise-copro/collaborateurs";
import { archiverDossierAction, supprimerDossierRepriseAction, definirCadrageAction, definirEquipeAction } from "./actions";
import { FicheRenseignementsBloc, type FicheOwnerVue } from "./fiche-renseignements-bloc";
import { ChecklistDossier, JournalDossier } from "./zone-suivi";
import { formatDateCourte, initialesDe, type DossierFicheVue } from "./vues";

export type { DossierFicheVue } from "./vues";

const INPUT = "h-8 rounded-md border border-line bg-surface px-2 text-[13px] text-ink w-full";

export function FicheDossierReprise({
  dossier,
  etapeSuivante,
  collaborateurs,
  aujourdHui,
  moiId,
  nbFichesGenerees,
  ecritureReelle,
  fiches,
  aDesOwners,
  mailActif,
  adminReprise,
}: {
  dossier: DossierFicheVue;
  etapeSuivante: ProchaineEtape;
  collaborateurs: CollaborateurVue[];
  /** ISO date du jour (échéances dépassées, déterministe). */
  aujourdHui: string;
  /** Id de l'utilisateur courant (filtre « Seulement mes étapes »). */
  moiId: string;
  nbFichesGenerees: number;
  ecritureReelle: boolean;
  fiches: FicheOwnerVue[];
  aDesOwners: boolean;
  mailActif: boolean;
  /** Directeur / manager / super-admin : archiver, supprimer, gestes des fiches. */
  adminReprise: boolean;
}) {
  const pct = Math.round(dossier.avancement * 100);

  // « Aller à l'étape » depuis le bandeau : scrolle vers la ligne (ancre etape-<code>).
  const allerAEtape = (code: string) => {
    document.getElementById(`etape-${code}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="flex flex-col gap-5">
      <Link href="/reprise-copro/dossiers" className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-green-700 w-fit">
        <ArrowLeft strokeWidth={1.5} className="w-3.5 h-3.5" /> Toutes les reprises
      </Link>

      {/* 1. EN-TÊTE + cadrage */}
      <div className="bg-surface border border-line rounded-md p-5">
        <EnTete dossier={dossier} pct={pct} />
        <ZoneAdminReprise admin={adminReprise} raison="Archiver ou supprimer une reprise engage le dossier du cabinet.">
          <ActionsDossier ref_={dossier.ref} nomUsuel={dossier.nomUsuel} archive={dossier.archive} nbFichesGenerees={nbFichesGenerees} />
        </ZoneAdminReprise>
      </div>

      {/* 3. BANDEAU « prochaine étape » */}
      {dossier.archive ? (
        <div className="rounded-md border border-line bg-surface-2 px-4 py-3 text-[13px] text-ink-3 flex items-center gap-2">
          <Archive strokeWidth={1.5} className="w-4 h-4 text-ink-4 shrink-0" />
          Dossier archivé : consultable en lecture. Désarchive-le (en-tête) pour reprendre le suivi.
        </div>
      ) : (
        <BandeauProchaineEtape etape={etapeSuivante} onAller={allerAEtape} />
      )}

      {/* 2. ÉQUIPE */}
      <EquipeDossier dossierRef={dossier.ref} equipe={dossier.equipe} collaborateurs={collaborateurs} />

      {/* 4. CHECKLIST par phase */}
      <ChecklistDossier dossierRef={dossier.ref} etapes={dossier.etapes} collaborateurs={collaborateurs} aujourdHui={aujourdHui} moiId={moiId} />

      {/* 5. FICHES DE RENSEIGNEMENTS (étape EX4 / EX6) */}
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

      {/* 4bis. JOURNAL */}
      <JournalDossier dossierRef={dossier.ref} journal={dossier.journal} />
    </div>
  );
}

// --- EN-TÊTE : identité + cadrage éditable -----------------------------------
// Le cadrage (nom, adresse, sortant, bascule) s'édite en place : un crayon ouvre 4 champs,
// « Enregistrer » appelle definirCadrageAction. Ouvert à tout gestionnaire.
function EnTete({ dossier, pct }: { dossier: DossierFicheVue; pct: number }) {
  const [edition, setEdition] = useState(false);
  const [nomUsuel, setNomUsuel] = useState(dossier.nomUsuel);
  const [adresse, setAdresse] = useState(dossier.adresse ?? "");
  const [sortant, setSortant] = useState(dossier.sortant ?? "");
  const [dateBascule, setDateBascule] = useState(dossier.dateBascule ?? "");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const enregistrer = () => {
    if (!nomUsuel.trim()) return;
    startTransition(async () => {
      const r = await definirCadrageAction(dossier.ref, {
        nomUsuel: nomUsuel.trim(),
        adresse: adresse.trim(),
        sortant: sortant.trim(),
        dateBascule,
      });
      if (r.ok) {
        toast.ok("Cadrage enregistré.");
        setEdition(false);
      } else {
        toast.err(r.message);
      }
    });
  };

  const annuler = () => {
    setNomUsuel(dossier.nomUsuel);
    setAdresse(dossier.adresse ?? "");
    setSortant(dossier.sortant ?? "");
    setDateBascule(dossier.dateBascule ?? "");
    setEdition(false);
  };

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-mono text-[12px] text-ink-2">{dossier.ref}</span>
            {dossier.archive && (
              <Badge ton="neutral" className="gap-1">
                <Archive strokeWidth={1.5} className="w-3 h-3" /> Archivé
              </Badge>
            )}
          </div>

          {!edition ? (
            <>
              <div className="flex items-center gap-2">
                <h1 className="text-[20px] font-medium tracking-tight text-ink">{dossier.nomUsuel}</h1>
                <button
                  type="button"
                  onClick={() => setEdition(true)}
                  aria-label="Modifier le cadrage"
                  title="Modifier nom, adresse, sortant, date de bascule"
                  className="p-1 rounded-md text-ink-4 hover:text-ink hover:bg-surface-2"
                >
                  <Pencil strokeWidth={1.5} className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="mt-1 flex flex-col gap-0.5 text-[12.5px] text-ink-3">
                <p className="flex items-center gap-1.5">
                  <MapPin strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-4 shrink-0" />
                  {dossier.adresse ?? <span className="text-ink-4">Adresse non renseignée</span>}
                </p>
                <p className="flex items-center gap-1.5">
                  <Building2 strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-4 shrink-0" />
                  {dossier.sortant ? `Sortant : ${dossier.sortant}` : <span className="text-ink-4">Syndic sortant non renseigné</span>}
                </p>
                <p className="flex items-center gap-1.5">
                  <CalendarDays strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-4 shrink-0" />
                  {dossier.dateBascule ? `Bascule le ${formatDateCourte(dossier.dateBascule)}` : <span className="text-ink-4">Date de bascule non renseignée</span>}
                </p>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
              <label className="flex flex-col gap-1 text-[12px] text-ink-3 sm:col-span-2">
                Nom de la copropriété
                <input value={nomUsuel} onChange={(e) => setNomUsuel(e.target.value)} className={INPUT} autoFocus />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-ink-3 sm:col-span-2">
                Adresse
                <input value={adresse} onChange={(e) => setAdresse(e.target.value)} className={INPUT} />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-ink-3">
                Syndic sortant
                <input value={sortant} onChange={(e) => setSortant(e.target.value)} className={INPUT} />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-ink-3">
                Date de bascule
                <input type="date" value={dateBascule} onChange={(e) => setDateBascule(e.target.value)} className={INPUT} />
              </label>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Button type="button" variant="primary" size="sm" onClick={enregistrer} disabled={pending || !nomUsuel.trim()}>
                  {pending ? "Enregistrement…" : "Enregistrer"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={annuler} disabled={pending}>
                  Annuler
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="text-right shrink-0">
          <div className="text-[22px] font-semibold text-green-700 leading-none">{pct}%</div>
          <div className="mt-1 text-[11px] text-ink-3 font-mono">
            {dossier.etapesFaites}/{dossier.etapesTotal} étapes
          </div>
        </div>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div className="h-full bg-green-700 transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
    </>
  );
}

// --- ÉQUIPE : qui tient chaque rôle ------------------------------------------
// Changer un select enregistre l'équipe et assigne les étapes du rôle qui n'ont PAS encore
// d'assigné (forcer = false). Le bouton « Réassigner d'après l'équipe » rejoue l'assignation
// pour tous les rôles ; la case « écraser » force aussi les assignations faites à la main.
function EquipeDossier({
  dossierRef,
  equipe,
  collaborateurs,
}: {
  dossierRef: string;
  equipe: EquipeReprise;
  collaborateurs: CollaborateurVue[];
}) {
  const [ids, setIds] = useState<Record<RoleReprise, string>>(() => ({
    referent: equipe.referent?.id ?? "",
    gestionnaire: equipe.gestionnaire?.id ?? "",
    assistant: equipe.assistant?.id ?? "",
    comptable: equipe.comptable?.id ?? "",
  }));
  const [ecraser, setEcraser] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const envoyer = (prochains: Record<RoleReprise, string>, forcer: boolean, messageOk: string) => {
    const precedents = ids;
    setIds(prochains); // optimiste
    startTransition(async () => {
      const r = await definirEquipeAction(
        dossierRef,
        {
          referent: prochains.referent || null,
          gestionnaire: prochains.gestionnaire || null,
          assistant: prochains.assistant || null,
          comptable: prochains.comptable || null,
        },
        forcer,
      );
      if (r.ok) toast.ok(messageOk);
      else {
        setIds(precedents); // rollback
        toast.err(r.message);
      }
    });
  };

  const changer = (role: RoleReprise, id: string) => {
    envoyer({ ...ids, [role]: id }, false, `${ROLE_LABEL[role]} enregistré(e), étapes du rôle assignées.`);
  };

  const reassigner = () => {
    envoyer(ids, ecraser, ecraser ? "Toutes les étapes réassignées d'après l'équipe." : "Étapes sans assigné assignées d'après l'équipe.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Users strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-4" /> Équipe
        </CardTitle>
      </CardHeader>
      <div className="p-4 flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {ROLES_REPRISE.map((role) => {
            const nom = collaborateurs.find((c) => c.id === ids[role])?.nom;
            return (
              <label key={role} className="flex flex-col gap-1 text-[12px] text-ink-3">
                <span className="flex items-center gap-1.5">
                  {nom && <Avatar initiales={initialesDe(nom)} title={nom} />}
                  {ROLE_LABEL[role]}
                </span>
                <select
                  value={ids[role]}
                  onChange={(e) => changer(role, e.target.value)}
                  disabled={pending}
                  className="h-8 rounded-md border border-line bg-surface px-2 text-[13px] text-ink w-full disabled:opacity-50"
                >
                  <option value="">Personne</option>
                  {collaborateurs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
        <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-line">
          <Button type="button" variant="secondary" size="sm" onClick={reassigner} disabled={pending}>
            Réassigner les étapes d&apos;après l&apos;équipe
          </Button>
          <label className="inline-flex items-center gap-1.5 text-[12px] text-ink-3 cursor-pointer">
            <input type="checkbox" checked={ecraser} onChange={(e) => setEcraser(e.target.checked)} className="accent-green-700" />
            Écraser les assignations existantes
          </label>
        </div>
      </div>
    </Card>
  );
}

// --- BANDEAU « prochaine étape » ---------------------------------------------
const TON_BANDEAU: Record<ProchaineEtape["tonalite"], { conteneur: string; titre: string; bouton: string; etiquette: string }> = {
  normal: {
    conteneur: "border-info-500/40 bg-info-50",
    titre: "text-info-700",
    bouton: "bg-info-700 hover:bg-info-500 text-white",
    etiquette: "Prochaine étape",
  },
  attention: {
    conteneur: "border-warn-500/50 bg-warn-50",
    titre: "text-warn-700",
    bouton: "bg-warn-500 hover:bg-warn-700 text-white",
    etiquette: "À traiter",
  },
  bloque: {
    conteneur: "border-err-500/50 bg-err-50",
    titre: "text-err-700",
    bouton: "bg-err-500 hover:bg-err-700 text-white",
    etiquette: "Bloqué",
  },
  termine: {
    conteneur: "border-green-600/40 bg-green-50",
    titre: "text-green-800",
    bouton: "bg-green-700 hover:bg-green-800 text-white",
    etiquette: "Reprise terminée",
  },
};

function BandeauProchaineEtape({ etape, onAller }: { etape: ProchaineEtape; onAller: (code: string) => void }) {
  const ton = TON_BANDEAU[etape.tonalite];
  return (
    <div className={cn("rounded-md border px-4 py-3.5", ton.conteneur)}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-4">
            {ton.etiquette}
            {etape.phase && <span className="ml-1.5 normal-case tracking-normal">· {PHASE_LABEL[etape.phase]}</span>}
            {etape.code && <span className="ml-1.5 font-mono normal-case tracking-normal">{etape.code}</span>}
          </p>
          <p className={cn("mt-0.5 text-[15px] font-semibold", ton.titre)}>{etape.titre}</p>
          <p className="mt-1 text-[12.5px] text-ink-2">{etape.description}</p>
          {etape.note && <p className={cn("mt-1 text-[12.5px]", etape.tonalite === "bloque" ? "text-err-700" : "text-ink-3")}>{etape.note}</p>}
          <div className="mt-1.5 flex items-center gap-3 flex-wrap text-[12px] text-ink-3">
            {etape.assigne ? (
              <span className="inline-flex items-center gap-1.5">
                <Avatar initiales={initialesDe(etape.assigne.nom)} title={etape.assigne.nom} />
                {etape.assigne.nom}
              </span>
            ) : (
              etape.code && <span className="text-ink-4">Personne n&apos;est assigné</span>
            )}
            {etape.echeance && <span>Échéance {formatDateCourte(etape.echeance)}</span>}
          </div>
        </div>
        {etape.code && (
          <button
            type="button"
            onClick={() => onAller(etape.code!)}
            className={cn(
              "shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md text-[13px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
              ton.bouton,
            )}
          >
            Voir l&apos;étape
            <ArrowRight strokeWidth={1.75} className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// --- ACTIONS DOSSIER (archiver / supprimer) ---------------------------------
function ActionsDossier({
  ref_,
  nomUsuel,
  archive,
  nbFichesGenerees,
}: {
  ref_: string;
  nomUsuel: string;
  archive: boolean;
  nbFichesGenerees: number;
}) {
  const [archivePending, startArchive] = useTransition();
  const [supprPending, startSuppr] = useTransition();
  const toast = useToast();
  const confirmer = useConfirm();

  const basculerArchive = () => {
    startArchive(async () => {
      const r = await archiverDossierAction(ref_, !archive);
      if (r.ok) toast.ok(archive ? "Dossier désarchivé." : "Dossier archivé.");
      else toast.err(r.message);
    });
  };

  const supprimer = async () => {
    const ok = await confirmer({
      titre: `Supprimer définitivement ${ref_} – « ${nomUsuel} » ?`,
      message: `Action irréversible. Partent avec le dossier : le suivi (étapes, équipe, journal)${
        nbFichesGenerees > 0 ? ` et ${nbFichesGenerees} fiche(s) de renseignements` : ""
      }. La copropriété dans ESTALE n'est pas touchée.`,
      confirmer: "Supprimer définitivement",
      danger: true,
    });
    if (!ok) return;
    startSuppr(async () => {
      const r = await supprimerDossierRepriseAction(ref_);
      // En cas de succès, l'action redirige (pas de retour). On ne gère ici que l'échec.
      if (!r.ok) toast.err(r.message);
    });
  };

  return (
    <div className="mt-4 pt-3 border-t border-line flex items-center gap-4 flex-wrap">
      <button
        type="button"
        onClick={basculerArchive}
        disabled={archivePending}
        className="inline-flex items-center gap-1.5 text-[12px] text-ink-3 hover:text-ink transition-colors disabled:opacity-50"
      >
        {archive ? (
          <>
            <ArchiveRestore strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0" /> Désarchiver
          </>
        ) : (
          <>
            <Archive strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0" /> Archiver ce dossier
          </>
        )}
      </button>
      <button
        type="button"
        onClick={supprimer}
        disabled={supprPending}
        className="inline-flex items-center gap-1.5 text-[12px] text-ink-4 hover:text-err-700 transition-colors ml-auto disabled:opacity-50"
      >
        <Trash2 strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0" /> {supprPending ? "Suppression…" : "Supprimer définitivement"}
      </button>
    </div>
  );
}
