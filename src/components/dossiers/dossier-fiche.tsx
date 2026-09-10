"use client";

// Fiche dossier : en-tete + statut, onglets (Suivi / Mes evenements), etapes EDITABLES
// et ASSIGNABLES (gestionnaire/assistant), journal/timeline. Brique 1 (manuel).

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft, Check, Plus, Trash2, ChevronUp, ChevronDown, MessageSquare, Flag, Mail, Phone, Inbox, Pencil, Gavel, ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { formatDateLongue } from "@/lib/format-date";
import {
  TYPE_DOSSIER_LABEL,
  STATUT_DOSSIER_LABEL,
  PORTEE_LABEL,
  TYPE_DOSSIER_ORDRE,
  progressionDossier,
  type Dossier,
  type EtapeDossier,
  type StatutDossier,
  type KindEvenement,
  type AssigneRole,
  type TypeDossier,
  type PorteeDossier,
} from "@/lib/domain/dossier";
import type { MembreAssignable } from "@/lib/services/dossiers/get-dossiers";
import {
  majEtapesAction,
  ajouterNoteAction,
  changerStatutAction,
  supprimerNoteAction,
  rattacherAgAction,
  modifierDossierAction,
  supprimerDossierAction,
} from "@/app/dossiers/actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input, Select } from "@/components/ui/field";

const PORTEE_ORDRE: PorteeDossier[] = ["copropriete", "coproprietaire", "lot"];

const KIND_ICON: Record<KindEvenement, typeof Flag> = {
  note: MessageSquare,
  etape: Check,
  statut: Flag,
  email: Mail,
  appel: Phone,
};

function uid(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

type OngletDossier = "suivi" | "evenements";

export function DossierFiche({
  dossier,
  gestionnaire,
  assistant,
  monInitiales,
}: {
  dossier: Dossier;
  gestionnaire?: MembreAssignable;
  assistant?: MembreAssignable;
  /** Initiales de l'utilisateur courant : il ne peut supprimer QUE ses propres notes. */
  monInitiales: string;
}) {
  const [onglet, setOnglet] = useState<OngletDossier>("suivi");
  const [editMeta, setEditMeta] = useState(false);
  const [etapes, setEtapes] = useState<EtapeDossier[]>(dossier.etapes);
  const [nouvelle, setNouvelle] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const p = progressionDossier({ ...dossier, etapes });

  const sauver = (next: EtapeDossier[]) => {
    setEtapes(next);
    startTransition(() => majEtapesAction(dossier.id, next));
  };
  const toggle = (id: string) => sauver(etapes.map((e) => (e.id === id ? { ...e, fait: !e.fait } : e)));
  const supprimer = (id: string) => sauver(etapes.filter((e) => e.id !== id));
  const renommer = (id: string, label: string) => setEtapes(etapes.map((e) => (e.id === id ? { ...e, label } : e)));
  const assigner = (id: string, role: AssigneRole | "") =>
    sauver(etapes.map((e) => (e.id === id ? { ...e, ...(role ? { assigneA: role } : { assigneA: undefined }) } : e)));
  const deplacer = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= etapes.length) return;
    const next = [...etapes];
    [next[i], next[j]] = [next[j], next[i]];
    sauver(next);
  };
  const ajouter = () => {
    const label = nouvelle.trim();
    if (!label) return;
    sauver([...etapes, { id: uid(), label, fait: false }]);
    setNouvelle("");
  };
  const changerStatut = (statut: StatutDossier) => startTransition(() => changerStatutAction(dossier.id, statut));
  const envoyerNote = () => {
    const t = note.trim();
    if (!t) return;
    startTransition(async () => {
      await ajouterNoteAction(dossier.id, t);
      toast.ok("Note ajoutée.");
    });
    setNote("");
  };
  const supprimerNote = (le: string) =>
    startTransition(async () => {
      await supprimerNoteAction(dossier.id, le);
      toast.ok("Note supprimée.");
    });

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dossiers" className="inline-flex items-center gap-1 text-body text-ink-3 hover:text-green-700 w-fit">
        <ArrowLeft strokeWidth={1.5} className="w-3.5 h-3.5" /> Tous les dossiers
      </Link>

      <div className="bg-surface border border-line rounded-lg shadow-1 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            {editMeta ? (
              <EditionMetadonnees dossier={dossier} onFerme={() => setEditMeta(false)} />
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <Badge ton="outline">{TYPE_DOSSIER_LABEL[dossier.type]}</Badge>
                  <span className="text-body text-ink-3">
                    {PORTEE_LABEL[dossier.portee]}{dossier.cible ? ` - ${dossier.cible}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <h1 className="text-page font-medium tracking-tight text-ink">{dossier.titre}</h1>
                  <Button
                    onClick={() => setEditMeta(true)}
                    aria-label="Modifier le dossier"
                    title="Modifier le dossier"
                    variant="ghost" iconOnly className="shrink-0"
                  >
                    <Pencil strokeWidth={1.5} className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </>
            )}
            <p className="mt-1 text-body text-ink-3">
              <Link href={`/copropriete/${dossier.coproCode}`} className="font-mono hover:text-green-700">{dossier.coproCode}</Link>{" "}
              {dossier.coproNom ?? ""}
              {dossier.origine ? ` · Origine : ${dossier.origine}` : ""}
            </p>
            <div className="mt-2">
              <RattachementAg
                dossierId={dossier.id}
                agDate={dossier.agDate}
                numeroResolution={dossier.numeroResolution}
              />
            </div>
            {dossier.type === "sinistre" && (
              <div className="mt-3">
                <ButtonLink href={`/sinistre/wizard?dossier=${dossier.id}`} variant="primary">
                  <ClipboardList strokeWidth={1.5} /> Ouvrir l’assistant sinistre
                </ButtonLink>
              </div>
            )}
          </div>
          <label className="flex flex-col gap-1 text-meta text-ink-3 shrink-0">
            Statut
            <Select
              value={dossier.statut}
              onChange={(e) => changerStatut(e.target.value as StatutDossier)}
              disabled={pending}
              largeur="auto"
            >
              {(["ouvert", "en_cours", "clos"] as StatutDossier[]).map((s) => (
                <option key={s} value={s}>{STATUT_DOSSIER_LABEL[s]}</option>
              ))}
            </Select>
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Progress valeur={p.pct} label={`${p.faites} étapes sur ${p.total}`} className="flex-1" />
          <span className="text-meta text-ink-2 tabular-nums">{p.faites}/{p.total}</span>
        </div>
      </div>

      {/* Onglets */}
      <div role="tablist" aria-label="Sections du dossier" className="flex items-center gap-1 border-b border-line">
        <OngletBouton actif={onglet === "suivi"} onClick={() => setOnglet("suivi")}>Suivi</OngletBouton>
        <OngletBouton actif={onglet === "evenements"} onClick={() => setOnglet("evenements")}>Mes événements</OngletBouton>
      </div>

      {onglet === "suivi" ? (
        <>
          <Card>
            <CardHeader><CardTitle>Étapes du dossier</CardTitle></CardHeader>
            <div className="divide-y divide-line">
              {etapes.map((e, i) => (
                <div key={e.id} className="flex items-center gap-2 px-4 py-2">
                  <button
                    type="button"
                    onClick={() => toggle(e.id)}
                    aria-pressed={e.fait}
                    aria-label={e.fait ? "Décocher" : "Cocher"}
                    className={cn(
                      "w-5 h-5 rounded-sm border flex items-center justify-center shrink-0 transition-colors",
                      e.fait ? "bg-ok-500 border-ok-500 text-white" : "border-line-2 hover:border-ink-3",
                    )}
                  >
                    {e.fait && <Check strokeWidth={3} className="w-3 h-3" />}
                  </button>
                  <input
                    value={e.label}
                    onChange={(ev) => renommer(e.id, ev.target.value)}
                    onBlur={() => sauver(etapes)}
                    className={cn(
                      "flex-1 min-w-0 bg-transparent text-body focus:outline-none",
                      e.fait ? "line-through text-ink-3" : "text-ink",
                    )}
                  />
                  <Select
                    value={e.assigneA ?? ""}
                    onChange={(ev) => assigner(e.id, ev.target.value as AssigneRole | "")}
                    title="Assigner la tâche"
                    largeur="auto" className="shrink-0 max-w-[120px]"
                  >
                    <option value="">- assigner</option>
                    {gestionnaire && <option value="gestionnaire">Gest. {gestionnaire.initiales}</option>}
                    {assistant && <option value="assistant">Assist. {assistant.initiales}</option>}
                  </Select>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button onClick={() => deplacer(i, -1)} disabled={i === 0} aria-label="Monter" variant="ghost" iconOnly>
                      <ChevronUp className="w-3.5 h-3.5" />
                    </Button>
                    <Button onClick={() => deplacer(i, 1)} disabled={i === etapes.length - 1} aria-label="Descendre" variant="ghost" iconOnly>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </Button>
                    <Button onClick={() => supprimer(e.id)} aria-label="Supprimer" variant="danger" iconOnly>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-2 px-4 py-2">
                <Plus strokeWidth={1.5} className="w-4 h-4 text-ink-3 shrink-0" />
                <Input
                  value={nouvelle}
                  onChange={(e) => setNouvelle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && ajouter()}
                  placeholder="Ajouter une étape..."
                  className="flex-1"
                />
                {nouvelle.trim() && (
                  <Button onClick={ajouter} variant="ghost" className="shrink-0">Ajouter</Button>
                )}
              </div>
            </div>
            {(gestionnaire || assistant) && (
              <p className="px-4 py-2 text-meta text-ink-3 border-t border-line">
                Équipe : {gestionnaire ? `gestionnaire ${gestionnaire.nom}` : ""}
                {gestionnaire && assistant ? " · " : ""}
                {assistant ? `assistant ${assistant.nom}` : ""}
              </p>
            )}
          </Card>

          <Card>
            <CardHeader><CardTitle>Journal du dossier</CardTitle></CardHeader>
            <div className="px-4 py-3 border-b border-line flex items-center gap-2">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && envoyerNote()}
                placeholder="Ajouter une note..."
                className="flex-1"
              />
              <Button
                onClick={envoyerNote}
                disabled={!note.trim() || pending}
                variant="secondary" className="shrink-0"
              >
                Noter
              </Button>
            </div>
            {dossier.journal.length === 0 ? (
              <p className="px-4 py-6 text-body text-ink-3 text-center">Aucune entrée pour le moment.</p>
            ) : (
              <ul className="divide-y divide-line">
                {[...dossier.journal].reverse().map((ev, idx) => {
                  const Icon = KIND_ICON[ev.kind] ?? MessageSquare;
                  const maNote = ev.kind === "note" && ev.par === monInitiales;
                  return (
                    <li key={idx} className="group flex items-start gap-2.5 px-4 py-2.5">
                      <Icon strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-3 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-body text-ink">{ev.texte}</p>
                        <p className="text-meta text-ink-3 mt-0.5">{ev.par} · {formatDateLongue(ev.le.slice(0, 10))}</p>
                      </div>
                      {maNote && (
                        <Button
                          onClick={() => supprimerNote(ev.le)}
                          disabled={pending}
                          aria-label="Supprimer ma note"
                          title="Supprimer ma note"
                          variant="danger" iconOnly className="shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      ) : (
        <Card>
          <div className="px-4 py-12 text-center">
            <Inbox strokeWidth={1.5} className="w-6 h-6 text-ink-3 mx-auto mb-2" />
            <p className="text-body text-ink-3">Aucun échange rattaché à ce dossier.</p>
            <p className="text-body text-ink-3 mt-1">
              Les emails (et bientôt les appels) rattachés à ce dossier apparaîtront ici.
            </p>
          </div>
        </Card>
      )}

      <ZoneSuppression dossierId={dossier.id} dossierTitre={dossier.titre} />
    </div>
  );
}

// Edition inline des metadonnees (titre, type, portee, cible). Reutilise le bloc
// d'en-tete : on bascule en formulaire, "Enregistrer" appelle modifierDossierAction.
function EditionMetadonnees({ dossier, onFerme }: { dossier: Dossier; onFerme: () => void }) {
  const [titre, setTitre] = useState(dossier.titre);
  const [type, setType] = useState<TypeDossier>(dossier.type);
  const [portee, setPortee] = useState<PorteeDossier>(dossier.portee);
  const [cible, setCible] = useState(dossier.cible ?? "");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const enregistrer = () => {
    const t = titre.trim();
    if (!t) return;
    startTransition(async () => {
      await modifierDossierAction(dossier.id, {
        titre: t,
        type,
        portee,
        ...(cible.trim() ? { cible: cible.trim() } : {}),
      });
      onFerme();
      toast.ok("Dossier modifié.");
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={titre}
        onChange={(e) => setTitre(e.target.value)}
        placeholder="Titre du dossier"
       
      />
      <div className="flex items-center gap-2 flex-wrap">
        <label className="flex flex-col gap-0.5 text-meta text-ink-3">
          Type
          <Select
            value={type}
            onChange={(e) => setType(e.target.value as TypeDossier)}
            largeur="auto"
          >
            {TYPE_DOSSIER_ORDRE.map((t) => (
              <option key={t} value={t}>{TYPE_DOSSIER_LABEL[t]}</option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-0.5 text-meta text-ink-3">
          Portée
          <Select
            value={portee}
            onChange={(e) => setPortee(e.target.value as PorteeDossier)}
            largeur="auto"
          >
            {PORTEE_ORDRE.map((pp) => (
              <option key={pp} value={pp}>{PORTEE_LABEL[pp]}</option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-0.5 text-meta text-ink-3 flex-1 min-w-[140px]">
          Cible (optionnel)
          <Input
            value={cible}
            onChange={(e) => setCible(e.target.value)}
            placeholder="Copropriétaire / lot concerné"
            largeur="auto"
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button
          onClick={enregistrer}
          disabled={pending || !titre.trim()}
          variant="secondary"
        >
          Enregistrer
        </Button>
        <Button
          onClick={onFerme}
          variant="secondary"
        >
          Annuler
        </Button>
      </div>
    </div>
  );
}

// Suppression DISCRETE (bas de fiche) avec confirmation explicite en deux temps :
// un lien sobre ouvre la confirmation, puis "Supprimer définitivement" agit.
// L'action serveur redirige vers /dossiers.
function ZoneSuppression({ dossierId, dossierTitre }: { dossierId: string; dossierTitre: string }) {
  const [confirme, setConfirme] = useState(false);
  const [pending, startTransition] = useTransition();

  const supprimer = () => startTransition(() => supprimerDossierAction(dossierId));

  if (!confirme) {
    return (
      <div className="pt-2">
        <Button
          onClick={() => setConfirme(true)}
          variant="danger"
        >
          <Trash2 strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0" />
          Supprimer définitivement le dossier
        </Button>
      </div>
    );
  }

  return (
    <div className="pt-2 flex items-center gap-3 flex-wrap rounded-md border border-err-700/40 bg-err-50 px-3 py-2.5">
      <p className="text-body text-ink-2">
        Supprimer définitivement « {dossierTitre} » ? Cette action est irréversible.
      </p>
      <div className="flex items-center gap-2 ml-auto">
        <Button
          onClick={supprimer}
          disabled={pending}
          variant="destructive" className="shrink-0"
        >
          Supprimer définitivement
        </Button>
        <Button
          onClick={() => setConfirme(false)}
          disabled={pending}
          variant="secondary" className="shrink-0"
        >
          Annuler
        </Button>
      </div>
    </div>
  );
}

// Rattachement structure a une AG + resolution (C5). Affiche un resume cliquable ;
// l'edition propose une date d'AG + un numero de resolution. Vide = effacer.
function RattachementAg({
  dossierId,
  agDate,
  numeroResolution,
}: {
  dossierId: string;
  agDate?: string;
  numeroResolution?: string;
}) {
  const [edit, setEdit] = useState(false);
  const [date, setDate] = useState(agDate ?? "");
  const [reso, setReso] = useState(numeroResolution ?? "");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const enregistrer = () => {
    // Annee incomplete pendant la frappe : on attend (evite de sauver "0002").
    if (date && Number(date.slice(0, 4)) < 1000) return;
    startTransition(async () => {
      await rattacherAgAction(dossierId, date, reso);
      setEdit(false);
      toast.ok("Rattachement enregistré.");
    });
  };

  if (!edit) {
    const vide = !agDate && !numeroResolution;
    return (
      <Button
        onClick={() => setEdit(true)}
        variant="ghost"
      >
        <Gavel strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0" />
        {vide ? (
          <span className="text-ink-3">Rattacher à une AG / résolution</span>
        ) : (
          <span>
            Rattaché à : AG{agDate ? ` du ${formatDateLongue(agDate)}` : ""}
            {numeroResolution ? ` · résolution n° ${numeroResolution}` : ""}
          </span>
        )}
        <Pencil strokeWidth={1.5} className="w-3 h-3 text-ink-3 shrink-0" />
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label className="flex items-center gap-1 text-meta text-ink-3">
        AG du
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          largeur="auto"
        />
      </label>
      <label className="flex items-center gap-1 text-meta text-ink-3">
        résolution n°
        <Input
          value={reso}
          onChange={(e) => setReso(e.target.value)}
          placeholder="ex. 7"
          largeur="auto" className="w-20"
        />
      </label>
      <Button
        onClick={enregistrer}
        disabled={pending}
        variant="secondary" size="sm"
      >
        OK
      </Button>
      <Button
        onClick={() => setEdit(false)}
        variant="secondary" size="sm"
      >
        Annuler
      </Button>
    </div>
  );
}

function OngletBouton({
  actif,
  onClick,
  children,
}: {
  actif: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={actif}
      onClick={onClick}
      className={cn(
        "px-3 py-2 text-body -mb-px border-b-2 transition-colors whitespace-nowrap",
        actif ? "border-green-500 text-ink font-medium" : "border-transparent text-ink-2 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
