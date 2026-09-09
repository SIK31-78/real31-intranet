"use client";

// TABLEAU D'ÉQUIPE des reprises : une ligne par dossier (avancement, phase, étape courante,
// assigné, dernière activité), compteurs en tête, filtres client (mes étapes / bloqués /
// archivés) et formulaire « Nouveau dossier » (admin reprise, avec l'équipe).
//
// Tri par défaut : les dossiers BLOQUÉS d'abord, puis par dernière activité décroissante.
// « Nouveau dossier » = geste d'encadrement -> grisé (jamais caché) pour un non-admin, la garde
// réelle est côté serveur (creerDossierAction).

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Plus, FolderOpen, Archive, Lock, AlertOctagon, Clock, UserRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { ZoneAdminReprise } from "@/components/reprise/zone-admin";
import { cn } from "@/lib/cn";
import { formatAuditeRelatif } from "@/lib/format-date";
import { PHASE_LABEL, ROLES_REPRISE, ROLE_LABEL, type RoleReprise } from "@/lib/reprise/domain/dossier";
import type { DossierResume } from "@/lib/reprise/services/resume-dossier";
import type { CollaborateurVue } from "@/app/reprise-copro/collaborateurs";
import { initialesDe, formatDateCourte } from "./[id]/vues";
import { creerDossierAction } from "./actions";

/** Ligne du tableau = résumé du dossier + ce qui revient à l'utilisateur courant. */
export interface LigneDossierVue extends DossierResume {
  mesEtapesRestantes: number;
}

type Filtre = "actifs" | "mes_etapes" | "bloques" | "archives";

const INPUT = "h-8 rounded-md border border-line bg-surface px-2 text-[13px] text-ink w-full";
const SELECT = "h-8 rounded-md border border-line bg-surface px-2 text-[13px] text-ink w-full";

export function DossiersRepriseVue({
  lignes,
  collaborateurs,
  moi,
  aujourdHui,
  adminReprise,
}: {
  lignes: LigneDossierVue[];
  collaborateurs: CollaborateurVue[];
  moi: { id: string; nom: string };
  /** ISO date du jour (ancre déterministe pour les dates relatives). */
  aujourdHui: string;
  adminReprise: boolean;
}) {
  const [filtre, setFiltre] = useState<Filtre>("actifs");
  const [formOuvert, setFormOuvert] = useState(false);

  const actifs = useMemo(() => lignes.filter((l) => !l.archive), [lignes]);
  const nbBloques = actifs.filter((l) => l.nbBloquees > 0).length;
  const nbMesEtapes = actifs.reduce((n, l) => n + l.mesEtapesRestantes, 0);
  const nbArchives = lignes.length - actifs.length;

  const visibles = useMemo(() => {
    let liste: LigneDossierVue[];
    switch (filtre) {
      case "archives":
        liste = lignes.filter((l) => l.archive);
        break;
      case "bloques":
        liste = actifs.filter((l) => l.nbBloquees > 0);
        break;
      case "mes_etapes":
        liste = actifs.filter((l) => l.mesEtapesRestantes > 0);
        break;
      default:
        liste = actifs;
    }
    return [...liste].sort((a, b) => {
      const ba = a.nbBloquees > 0 ? 1 : 0;
      const bb = b.nbBloquees > 0 ? 1 : 0;
      if (ba !== bb) return bb - ba;
      return (b.derniereActivite ?? "").localeCompare(a.derniereActivite ?? "");
    });
  }, [lignes, actifs, filtre]);

  return (
    <div className="flex flex-col gap-4">
      {/* Compteurs */}
      <div className="grid grid-cols-3 gap-3">
        <Compteur valeur={actifs.length} libelle={actifs.length > 1 ? "dossiers actifs" : "dossier actif"} />
        <Compteur valeur={nbBloques} libelle={nbBloques > 1 ? "bloqués" : "bloqué"} ton={nbBloques > 0 ? "err" : undefined} />
        <Compteur
          valeur={nbMesEtapes}
          libelle={nbMesEtapes > 1 ? "étapes qui me reviennent" : "étape qui me revient"}
          ton={nbMesEtapes > 0 ? "info" : undefined}
        />
      </div>

      {/* Filtres + création */}
      <div className="flex items-center gap-2 flex-wrap">
        <FiltreBouton actif={filtre === "actifs"} onClick={() => setFiltre("actifs")}>
          Tous ({actifs.length})
        </FiltreBouton>
        <FiltreBouton actif={filtre === "mes_etapes"} onClick={() => setFiltre("mes_etapes")}>
          <UserRound strokeWidth={1.5} className="w-3.5 h-3.5" /> Mes étapes
        </FiltreBouton>
        <FiltreBouton actif={filtre === "bloques"} onClick={() => setFiltre("bloques")}>
          <AlertOctagon strokeWidth={1.5} className="w-3.5 h-3.5" /> Bloqués ({nbBloques})
        </FiltreBouton>
        <FiltreBouton actif={filtre === "archives"} onClick={() => setFiltre("archives")}>
          <Archive strokeWidth={1.5} className="w-3.5 h-3.5" /> Archivés ({nbArchives})
        </FiltreBouton>
        <Button
          type="button"
          variant="primary"
          onClick={() => setFormOuvert((o) => !o)}
          className="ml-auto"
          disabled={!adminReprise}
          title={adminReprise ? undefined : "Réservé aux directeurs et managers : ouvrir une reprise engage le cabinet."}
        >
          {adminReprise ? <Plus strokeWidth={2} /> : <Lock strokeWidth={1.5} />} Nouveau dossier
        </Button>
      </div>

      {formOuvert && (
        <ZoneAdminReprise admin={adminReprise} raison="Ouvrir une reprise engage le cabinet sur un onboarding.">
          <FormCreation collaborateurs={collaborateurs} moi={moi} onFait={() => setFormOuvert(false)} />
        </ZoneAdminReprise>
      )}

      {visibles.length === 0 ? (
        <Card>
          <div className="px-4 py-10 text-center">
            <FolderOpen strokeWidth={1.5} className="w-6 h-6 text-ink-4 mx-auto mb-2" />
            <p className="text-[13px] text-ink-3">{messageVide(filtre)}</p>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[960px]">
              <thead>
                <tr className="text-left text-[11.5px] uppercase tracking-wide text-ink-3 border-b border-line">
                  <th className="px-4 py-2 font-medium">Réf</th>
                  <th className="px-3 py-2 font-medium">Copropriété</th>
                  <th className="px-3 py-2 font-medium">Bascule</th>
                  <th className="px-3 py-2 font-medium">Avancement</th>
                  <th className="px-3 py-2 font-medium">Phase</th>
                  <th className="px-3 py-2 font-medium">Assigné à</th>
                  <th className="px-4 py-2 font-medium">Activité</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((l) => (
                  <LigneDossier key={l.ref} l={l} aujourdHui={aujourdHui} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function messageVide(filtre: Filtre): string {
  switch (filtre) {
    case "archives":
      return "Aucun dossier archivé.";
    case "bloques":
      return "Aucune reprise bloquée. Bonne nouvelle.";
    case "mes_etapes":
      return "Aucune étape ne t'est assignée sur une reprise en cours.";
    default:
      return "Aucune reprise en cours. Crée la première avec « Nouveau dossier ».";
  }
}

function Compteur({ valeur, libelle, ton }: { valeur: number; libelle: string; ton?: "err" | "info" }) {
  return (
    <Card className="px-4 py-3">
      <div
        className={cn(
          "text-[22px] font-semibold leading-none",
          ton === "err" && "text-err-700",
          ton === "info" && "text-info-700",
          !ton && "text-ink",
        )}
      >
        {valeur}
      </div>
      <div className="mt-1 text-[11.5px] text-ink-3">{libelle}</div>
    </Card>
  );
}

function FiltreBouton({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={cn(
        "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[12px] transition-colors",
        actif ? "border-green-600/40 bg-green-50 text-green-800" : "border-line text-ink-3 hover:border-line-2",
      )}
    >
      {children}
    </button>
  );
}

function LigneDossier({ l, aujourdHui }: { l: LigneDossierVue; aujourdHui: string }) {
  const pct = Math.round(l.avancement * 100);
  const href = `/reprise-copro/dossiers/${encodeURIComponent(l.ref)}`;
  const etape = l.etapeCourante;
  const bloquee = etape?.statut === "bloque";
  const enRetard = Boolean(etape?.echeance) && etape!.echeance! < aujourdHui && !bloquee;
  const termine = !etape && l.etapesTotal > 0;

  return (
    <tr className={cn("border-b border-line last:border-0 align-top hover:bg-surface-2 transition-colors", bloquee && "bg-err-50/40")}>
      <td className="px-4 py-2.5 whitespace-nowrap">
        <Link href={href} className="font-mono text-[12px] text-ink-2 hover:text-green-700">
          {l.ref}
        </Link>
      </td>
      <td className="px-3 py-2.5 min-w-[200px]">
        <Link href={href} className="font-medium text-ink hover:text-green-700 block">
          {l.nomUsuel}
        </Link>
        {l.adresse && <div className="text-[12px] text-ink-3 truncate max-w-[260px]">{l.adresse}</div>}
        {l.sortant && <div className="text-[11.5px] text-ink-4">Sortant : {l.sortant}</div>}
        {l.archive && (
          <Badge ton="neutral" className="mt-1 gap-1">
            <Archive strokeWidth={1.5} className="w-3 h-3" /> Archivé
          </Badge>
        )}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-ink-2">{l.dateBascule ? formatDateCourte(l.dateBascule) : <span className="text-ink-4">-</span>}</td>
      <td className="px-3 py-2.5 min-w-[140px]">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-[80px] rounded-full bg-surface-2 overflow-hidden">
            <div className="h-full rounded-full bg-green-600" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[11px] text-ink-3 font-mono whitespace-nowrap">
            {l.etapesFaites}/{l.etapesTotal}
          </span>
        </div>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {l.phase ? <Badge ton="outline">{PHASE_LABEL[l.phase]}</Badge> : termine ? <Badge ton="ok">Terminée</Badge> : <span className="text-ink-4">-</span>}
          {l.nbBloquees > 0 && (
            <Badge ton="err" dot title={bloquee && etape?.note ? etape.note : undefined}>
              {l.nbBloquees} bloquée{l.nbBloquees > 1 ? "s" : ""}
            </Badge>
          )}
          {enRetard && (
            <Badge ton="warn" className="gap-1">
              <Clock strokeWidth={1.5} className="w-3 h-3" /> En retard
            </Badge>
          )}
        </div>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        {etape?.assigne ? (
          <span className="inline-flex items-center gap-1.5">
            <Avatar initiales={initialesDe(etape.assigne.nom)} title={etape.assigne.nom} />
            <span className="text-ink-2">{etape.assigne.nom}</span>
          </span>
        ) : (
          <span className="text-ink-4">Non assignée</span>
        )}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap text-[12px] text-ink-3">
        {l.derniereActivite ? formatAuditeRelatif(l.derniereActivite, aujourdHui) : "-"}
      </td>
    </tr>
  );
}

// --- Formulaire « Nouveau dossier » ------------------------------------------

function FormCreation({
  collaborateurs,
  moi,
  onFait,
}: {
  collaborateurs: CollaborateurVue[];
  moi: { id: string; nom: string };
  onFait: () => void;
}) {
  const [ref, setRef] = useState("");
  const [nomUsuel, setNomUsuel] = useState("");
  const [adresse, setAdresse] = useState("");
  const [sortant, setSortant] = useState("");
  const [dateBascule, setDateBascule] = useState("");
  // Le référent = l'utilisateur courant par défaut (celui qui ouvre la reprise la conduit).
  const [equipe, setEquipe] = useState<Record<RoleReprise, string>>({
    referent: collaborateurs.some((c) => c.id === moi.id) ? moi.id : "",
    gestionnaire: "",
    assistant: "",
    comptable: "",
  });
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const valide = ref.trim().length > 0 && nomUsuel.trim().length > 0;

  const submit = () => {
    if (!valide) return;
    startTransition(async () => {
      const r = await creerDossierAction({
        ref: ref.trim().toUpperCase(),
        nomUsuel: nomUsuel.trim(),
        adresse: adresse.trim() || undefined,
        sortant: sortant.trim() || undefined,
        dateBascule: dateBascule || undefined,
        equipe: {
          referent: equipe.referent || null,
          gestionnaire: equipe.gestionnaire || null,
          assistant: equipe.assistant || null,
          comptable: equipe.comptable || null,
        },
      });
      if (r.ok) {
        toast.ok("Dossier de reprise créé.");
        onFait();
      } else {
        toast.err(r.message);
      }
    });
  };

  return (
    <Card>
      <div className="p-4 flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[12px] text-ink-3">
            Référence ESTALE
            <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="ex. S0302" autoFocus className={INPUT} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-3">
            Nom de la copropriété
            <input value={nomUsuel} onChange={(e) => setNomUsuel(e.target.value)} placeholder="ex. 31 Foch" className={INPUT} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-3 sm:col-span-2">
            Adresse de l&apos;immeuble <span className="text-ink-4">(optionnel)</span>
            <input value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="ex. 31 avenue Foch, 31000 Toulouse" className={INPUT} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-3">
            Syndic sortant <span className="text-ink-4">(optionnel)</span>
            <input value={sortant} onChange={(e) => setSortant(e.target.value)} placeholder="ex. Foncia" className={INPUT} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-3">
            Date de bascule <span className="text-ink-4">(optionnel)</span>
            <input type="date" value={dateBascule} onChange={(e) => setDateBascule(e.target.value)} className={INPUT} />
          </label>
        </div>

        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3 mb-2">Équipe</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ROLES_REPRISE.map((role) => (
              <label key={role} className="flex flex-col gap-1 text-[12px] text-ink-3">
                {ROLE_LABEL[role]}
                <select value={equipe[role]} onChange={(e) => setEquipe((q) => ({ ...q, [role]: e.target.value }))} className={SELECT}>
                  <option value="">Personne</option>
                  {collaborateurs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p className="mt-2 text-[11.5px] text-ink-4">
            Chaque étape de la checklist est assignée d&apos;office à la personne qui tient son rôle. Modifiable ensuite étape par étape.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="primary" onClick={submit} disabled={pending || !valide}>
            {pending ? "Création…" : "Créer le dossier"}
          </Button>
          <Button type="button" variant="secondary" onClick={onFait}>
            Annuler
          </Button>
        </div>
      </div>
    </Card>
  );
}
