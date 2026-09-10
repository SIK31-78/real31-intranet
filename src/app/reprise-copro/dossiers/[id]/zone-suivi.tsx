"use client";

// CHECKLIST par phase + JOURNAL de la fiche dossier (tableau de suivi d'équipe, ADR-037).
//
// Checklist : 8 groupes (ordre de PHASES), compteur fait/total par phase, groupe replié à 100 %.
// Par étape : pastille de statut (menu À faire / En cours / Bloqué / Fait / Ignoré, « Bloqué »
// exige un motif), code + libellé (une étape ad hoc porte « ajoutée » + un bouton supprimer),
// assigné (select compact), note (édition en place, rouge si bloquée), échéance (input date,
// rouge si dépassée), « modifié le … par … ». Mise à jour OPTIMISTE avec rollback sur erreur.
// En bas de chaque phase : « + Ajouter une étape » -> ajouterEtapeAdHocAction.
//
// Ouvert à tout gestionnaire connecté (les Server Actions refont la garde de session).

import { useState, useTransition, type ReactNode } from "react";
import { Check, Minus, Circle, OctagonAlert, MessageSquare, ChevronDown, Plus, Trash2, Clock } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { PHASES, PHASE_LABEL, type Phase, type StatutEtape } from "@/lib/reprise/domain/dossier";
import type { CollaborateurVue } from "@/app/reprise-copro/collaborateurs";
import {
  changerStatutEtapeAction,
  assignerEtapeAction,
  noterEtapeAction,
  fixerEcheanceAction,
  ajouterEtapeAdHocAction,
  supprimerEtapeAdHocAction,
  ajouterNoteAction,
} from "./actions";
import {
  STATUTS_ETAPE,
  STATUT_ETAPE_LABEL,
  etapeClose,
  echeanceDepassee,
  initialesDe,
  formatDateHeure,
  formatDateCourte,
  type EtapeVue,
  type EntreeJournalVue,
} from "./vues";
import { Input, Select, Textarea } from "@/components/ui/field";

const SELECT_COMPACT = "h-7 max-w-[160px] rounded-lg border border-line bg-surface shadow-1 px-1.5 text-body text-ink disabled:opacity-50";
const INPUT_COMPACT = "h-7 rounded-lg border border-line bg-surface shadow-1 px-1.5 text-body text-ink disabled:opacity-50";

// --- CHECKLIST ---------------------------------------------------------------

export function ChecklistDossier({
  dossierRef,
  etapes,
  collaborateurs,
  aujourdHui,
  moiId,
}: {
  dossierRef: string;
  etapes: EtapeVue[];
  collaborateurs: CollaborateurVue[];
  aujourdHui: string;
  moiId: string;
}) {
  // Deux filtres cumulables : « restantes » masque les étapes faites/ignorées, « mes étapes »
  // ne garde que celles assignées à l'utilisateur courant. Les compteurs restent ceux de la
  // phase complète ; une phase sans étape visible disparaît.
  const [restantesSeulement, setRestantesSeulement] = useState(false);
  const [mesEtapesSeulement, setMesEtapesSeulement] = useState(false);
  const garder = (e: EtapeVue) =>
    (!restantesSeulement || !etapeClose(e.statut)) && (!mesEtapesSeulement || e.assigneA?.id === moiId);
  const nbRestantes = etapes.filter((e) => !etapeClose(e.statut)).length;
  const nbMiennes = etapes.filter((e) => e.assigneA?.id === moiId && !etapeClose(e.statut)).length;
  const filtre = restantesSeulement || mesEtapesSeulement;
  const groupes = PHASES.map((phase) => {
    const liste = etapes.filter((e) => e.phase === phase);
    const faites = liste.filter((e) => etapeClose(e.statut)).length;
    const visibles = filtre ? liste.filter(garder) : liste;
    return { phase, etapes: visibles, faites, total: liste.length };
  }).filter((g) => g.total > 0 && (!filtre || g.etapes.length > 0));

  // Une phase à 100 % est repliée par défaut (moins de densité) ; tout se déplie au clic.
  const [ouvertes, setOuvertes] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groupes.map((g) => [g.phase, g.faites < g.total])),
  );
  const basculer = (phase: Phase) => setOuvertes((o) => ({ ...o, [phase]: !o[phase] }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Checklist de la reprise</CardTitle>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-body text-ink-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={mesEtapesSeulement}
              onChange={(e) => setMesEtapesSeulement(e.target.checked)}
              className="h-3.5 w-3.5 accent-brand"
            />
            Seulement mes étapes ({nbMiennes})
          </label>
          <label className="flex items-center gap-1.5 text-body text-ink-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={restantesSeulement}
              onChange={(e) => setRestantesSeulement(e.target.checked)}
              className="h-3.5 w-3.5 accent-brand"
            />
            Seulement les étapes restantes ({nbRestantes})
          </label>
        </div>
      </CardHeader>
      <div className="flex flex-col">
        {groupes.length === 0 && (
          <p className="px-4 py-6 text-body text-ink-3 text-center">
            {mesEtapesSeulement ? "Aucune étape ne vous est assignée ici." : "Toutes les étapes sont faites."}
          </p>
        )}
        {groupes.map((g) => (
          <GroupePhase
            key={g.phase}
            dossierRef={dossierRef}
            phase={g.phase}
            etapes={g.etapes}
            faites={g.faites}
            total={g.total}
            ouverte={ouvertes[g.phase] ?? true}
            onBasculer={() => basculer(g.phase)}
            collaborateurs={collaborateurs}
            aujourdHui={aujourdHui}
          />
        ))}
      </div>
    </Card>
  );
}

function GroupePhase({
  dossierRef,
  phase,
  etapes,
  faites,
  total,
  ouverte,
  onBasculer,
  collaborateurs,
  aujourdHui,
}: {
  dossierRef: string;
  phase: Phase;
  etapes: EtapeVue[];
  faites: number;
  total: number;
  ouverte: boolean;
  onBasculer: () => void;
  collaborateurs: CollaborateurVue[];
  aujourdHui: string;
}) {
  const complet = faites === total;
  const nbBloquees = etapes.filter((e) => e.statut === "bloque").length;
  return (
    <div className="border-b border-line last:border-b-0">
      <Button
        onClick={onBasculer}
        aria-expanded={ouverte}
        variant="secondary" size="lg" className="w-full text-left"
      >
        <ChevronDown strokeWidth={2} className={cn("w-4 h-4 text-ink-3 transition-transform shrink-0", ouverte ? "" : "-rotate-90")} />
        <span className="text-body font-semibold uppercase tracking-wide text-ink-2">{PHASE_LABEL[phase]}</span>
        <span className={cn("font-mono text-meta", complet ? "text-green-700" : "text-ink-3")}>
          {faites}/{total}
        </span>
        {nbBloquees > 0 && (
          <Badge ton="err" dot>
            {nbBloquees} bloquée{nbBloquees > 1 ? "s" : ""}
          </Badge>
        )}
        {complet && (
          <Badge ton="ok" className="ml-auto">
            Terminée
          </Badge>
        )}
      </Button>
      {ouverte && (
        <div className="pb-2">
          <ul className="divide-y divide-line/60">
            {etapes.map((e) => (
              <LigneEtape
                // La clé porte la dernière modif : une mise à jour serveur (équipe, ad hoc) remonte
                // l'état local sans état fantôme.
                key={`${e.code}:${e.majLe ?? ""}:${e.assigneA?.id ?? ""}`}
                dossierRef={dossierRef}
                etape={e}
                collaborateurs={collaborateurs}
                aujourdHui={aujourdHui}
              />
            ))}
          </ul>
          <FormAjoutAdHoc dossierRef={dossierRef} phase={phase} etapesPhase={etapes} collaborateurs={collaborateurs} />
        </div>
      )}
    </div>
  );
}

// --- LIGNE D'ÉTAPE (optimiste + rollback) --------------------------------------

function LigneEtape({
  dossierRef,
  etape: initiale,
  collaborateurs,
  aujourdHui,
}: {
  dossierRef: string;
  etape: EtapeVue;
  collaborateurs: CollaborateurVue[];
  aujourdHui: string;
}) {
  const [etape, setEtape] = useState<EtapeVue>(initiale);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const confirmer = useConfirm();

  /** Applique une mutation optimiste, rollback + toast si l'action échoue. */
  const muter = (prochaine: Partial<EtapeVue>, action: () => Promise<{ ok: true } | { ok: false; message: string }>, messageOk?: string) => {
    const precedente = etape;
    setEtape({ ...etape, ...prochaine });
    startTransition(async () => {
      const r = await action();
      if (r.ok) {
        if (messageOk) toast.ok(messageOk);
      } else {
        setEtape(precedente);
        toast.err(r.message);
      }
    });
  };

  const changerStatut = (statut: StatutEtape, motif?: string) => {
    muter(
      { statut, ...(motif !== undefined ? { note: motif } : {}) },
      () => changerStatutEtapeAction(dossierRef, etape.code, statut, motif),
      `${etape.code} : ${STATUT_ETAPE_LABEL[statut]}.`,
    );
  };

  const assigner = (id: string) => {
    const c = collaborateurs.find((x) => x.id === id);
    muter({ assigneA: c ? { id: c.id, nom: c.nom } : undefined }, () => assignerEtapeAction(dossierRef, etape.code, id || null));
  };

  const noter = (note: string) => {
    if ((etape.note ?? "") === note) return;
    muter({ note: note || undefined }, () => noterEtapeAction(dossierRef, etape.code, note));
  };

  const fixerEcheance = (echeance: string) => {
    if ((etape.echeance ?? "") === echeance) return;
    muter({ echeance: echeance || undefined }, () => fixerEcheanceAction(dossierRef, etape.code, echeance || null));
  };

  const supprimer = async () => {
    const ok = await confirmer({
      titre: "Supprimer cette étape ?",
      message: `« ${etape.libelle} » est une étape ajoutée pour ce dossier. Elle disparaît du suivi.`,
      confirmer: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await supprimerEtapeAdHocAction(dossierRef, etape.code);
      if (r.ok) toast.ok("Étape supprimée.");
      else toast.err(r.message);
    });
  };

  const bloquee = etape.statut === "bloque";
  const enRetard = echeanceDepassee(etape, aujourdHui);
  const close = etapeClose(etape.statut);

  return (
    <li
      id={`etape-${etape.code}`}
      className={cn("scroll-mt-24 px-4 py-2 flex flex-col gap-1.5", bloquee && "bg-err-50/40", pending && "opacity-70")}
    >
      <div className="flex items-start gap-2.5">
        <MenuStatut statut={etape.statut} disabled={pending} onChoisir={changerStatut} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <span className="font-mono text-meta text-ink-3 w-9 shrink-0 pt-0.5">{etape.code}</span>
            <span
              className={cn(
                "flex-1 min-w-[200px] text-body leading-snug",
                etape.statut === "fait" && "text-ink-2",
                etape.statut === "en_cours" && "text-info-700 font-medium",
                etape.statut === "bloque" && "text-err-700 font-medium",
                etape.statut === "a_faire" && "text-ink",
                etape.statut === "ignore" && "text-ink-3 line-through",
              )}
            >
              {etape.libelle}
            </span>
            {etape.adHoc && (
              <span className="inline-flex items-center gap-1 shrink-0">
                <Badge ton="outline">ajoutée</Badge>
                <Button
                  onClick={supprimer}
                  disabled={pending}
                  aria-label="Supprimer cette étape ajoutée"
                  title="Supprimer cette étape ajoutée"
                  variant="danger"
                >
                  <Trash2 strokeWidth={1.5} className="w-3.5 h-3.5" />
                </Button>
              </span>
            )}
          </div>

          {/* Ligne des attributs : assigné · échéance · note · modifié */}
          <div className="mt-1 flex items-center gap-x-3 gap-y-1.5 flex-wrap pl-11 text-body">
            <span className="inline-flex items-center gap-1.5">
              {etape.assigneA ? (
                <Avatar initiales={initialesDe(etape.assigneA.nom)} title={etape.assigneA.nom} />
              ) : (
                <span className="w-6 h-6 rounded-full border border-dashed border-line-2 shrink-0" aria-hidden />
              )}
              <Select
                value={etape.assigneA?.id ?? ""}
                onChange={(e) => assigner(e.target.value)}
                disabled={pending}
                aria-label={`Assigner l'étape ${etape.code}`}
                largeur="auto" className="max-w-[160px]"
              >
                <option value="">-</option>
                {collaborateurs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </Select>
            </span>

            <span className={cn("inline-flex items-center gap-1", enRetard ? "text-err-700" : "text-ink-3")}>
              <Clock strokeWidth={1.5} className={cn("w-3.5 h-3.5", enRetard ? "text-err-700" : "text-ink-3")} />
              <input
                type="date"
                value={etape.echeance ?? ""}
                onChange={(e) => fixerEcheance(e.target.value)}
                disabled={pending}
                aria-label={`Échéance de l'étape ${etape.code}`}
                className={cn(INPUT_COMPACT, enRetard && "border-err-500/50 text-err-700")}
              />
              {enRetard && <span className="text-meta">dépassée</span>}
            </span>

            <NoteInline valeur={etape.note ?? ""} bloquee={bloquee} disabled={pending} onValider={noter} />

            {etape.majLe && (
              <span className="ml-auto text-meta text-ink-3 whitespace-nowrap">
                modifié le {formatDateHeure(etape.majLe)}
                {etape.majPar ? ` par ${etape.majPar}` : ""}
              </span>
            )}
          </div>
        </div>
        {!close && enRetard && (
          <Badge ton="warn" className="shrink-0 mt-0.5">
            En retard
          </Badge>
        )}
        {bloquee && (
          <Badge ton="err" dot className="shrink-0 mt-0.5">
            Bloqué
          </Badge>
        )}
      </div>
    </li>
  );
}

// --- MENU DE STATUT (pastille cliquable) --------------------------------------
// « Bloqué » ne se valide qu'avec un motif : le champ apparaît dans le menu avant validation.
function MenuStatut({
  statut,
  disabled,
  onChoisir,
}: {
  statut: StatutEtape;
  disabled: boolean;
  onChoisir: (statut: StatutEtape, motif?: string) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [saisieMotif, setSaisieMotif] = useState(false);
  const [motif, setMotif] = useState("");

  const fermer = () => {
    setOuvert(false);
    setSaisieMotif(false);
    setMotif("");
  };

  const choisir = (s: StatutEtape) => {
    if (s === "bloque") {
      setSaisieMotif(true);
      return;
    }
    onChoisir(s);
    fermer();
  };

  const bloquer = () => {
    const m = motif.trim();
    if (!m) return;
    onChoisir("bloque", m);
    fermer();
  };

  return (
    <div className="relative shrink-0 mt-0.5">
      <Button
        onClick={() => (ouvert ? fermer() : setOuvert(true))}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-label={`Statut : ${STATUT_ETAPE_LABEL[statut]} (cliquer pour changer)`}
        title={`${STATUT_ETAPE_LABEL[statut]} (cliquer pour changer)`}
        variant="ghost"
      >
        <PastilleEtape statut={statut} />
      </Button>
      {ouvert && (
        <>
          {/* Voile transparent : un clic hors du menu le ferme. */}
          <div className="fixed inset-0 z-30" onClick={fermer} aria-hidden />
          <div
            role="menu"
            className="absolute z-40 left-0 top-7 w-[240px] rounded-lg border border-line bg-surface shadow-1 shadow-2 p-1"
            onKeyDown={(e) => e.key === "Escape" && fermer()}
          >
            {!saisieMotif ? (
              STATUTS_ETAPE.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="menuitemradio"
                  aria-checked={s === statut}
                  onClick={() => choisir(s)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-left text-body hover:bg-surface-2",
                    s === statut ? "text-ink font-medium" : "text-ink-2",
                  )}
                >
                  <PastilleEtape statut={s} petite />
                  {STATUT_ETAPE_LABEL[s]}
                  {s === statut && <Check strokeWidth={2} className="w-3.5 h-3.5 ml-auto text-green-700" />}
                </button>
              ))
            ) : (
              <div className="p-1.5 flex flex-col gap-1.5">
                <label className="text-meta font-medium text-err-700">Motif du blocage</label>
                <Textarea
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      bloquer();
                    }
                  }}
                  autoFocus
                  rows={3}
                  maxLength={500}
                  placeholder="ex. RIB du sortant non reçu, relancé le 3/9"
                 
                />
                <div className="flex items-center gap-1.5">
                  <Button type="button" variant="danger" size="sm" onClick={bloquer} disabled={!motif.trim()}>
                    Bloquer
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={fermer}>
                    Annuler
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Pastille, un rendu par statut.
function PastilleEtape({ statut, petite }: { statut: StatutEtape; petite?: boolean }) {
  const base = cn("rounded-full flex items-center justify-center shrink-0 transition-colors", petite ? "w-4 h-4" : "w-5 h-5");
  const ico = petite ? "w-2.5 h-2.5" : "w-3 h-3";
  if (statut === "fait") {
    return (
      <span className={cn(base, "bg-ok-500 text-white")} aria-hidden>
        <Check strokeWidth={3} className={ico} />
      </span>
    );
  }
  if (statut === "en_cours") {
    return (
      <span className={cn(base, "bg-surface border-2 border-info-500 text-info-700")} aria-hidden>
        <Circle strokeWidth={0} className={cn(petite ? "w-1.5 h-1.5" : "w-2 h-2", "fill-info-500")} />
      </span>
    );
  }
  if (statut === "bloque") {
    return (
      <span className={cn(base, "bg-err-500 text-white")} aria-hidden>
        <OctagonAlert strokeWidth={2.5} className={ico} />
      </span>
    );
  }
  if (statut === "ignore") {
    return (
      <span className={cn(base, "bg-surface-2 border border-line text-ink-3")} aria-hidden>
        <Minus strokeWidth={2} className={ico} />
      </span>
    );
  }
  return <span className={cn(base, "bg-surface border border-line-2")} aria-hidden />;
}

// --- NOTE EN PLACE ---------------------------------------------------------------
// Clic sur le texte -> champ ; Entrée ou perte de focus valide, Échap annule.
function NoteInline({
  valeur,
  bloquee,
  disabled,
  onValider,
}: {
  valeur: string;
  bloquee: boolean;
  disabled: boolean;
  onValider: (note: string) => void;
}) {
  const [edition, setEdition] = useState(false);
  const [brouillon, setBrouillon] = useState(valeur);

  const ouvrir = () => {
    setBrouillon(valeur);
    setEdition(true);
  };
  const valider = () => {
    setEdition(false);
    onValider(brouillon.trim());
  };

  if (edition) {
    return (
      <input
        value={brouillon}
        onChange={(e) => setBrouillon(e.target.value)}
        onBlur={valider}
        onKeyDown={(e) => {
          if (e.key === "Enter") valider();
          if (e.key === "Escape") setEdition(false);
        }}
        autoFocus
        maxLength={500}
        placeholder={bloquee ? "Motif du blocage" : "Note"}
        aria-label="Note de l'étape"
        className={cn(INPUT_COMPACT, "flex-1 min-w-[180px]", bloquee && "border-err-500/50")}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={ouvrir}
      disabled={disabled}
      title="Modifier la note"
      className={cn(
        "inline-flex items-center gap-1 text-left max-w-[420px] truncate hover:underline decoration-dotted underline-offset-2 disabled:opacity-50",
        valeur ? (bloquee ? "text-err-700" : "text-ink-2") : "text-ink-3",
      )}
    >
      <MessageSquare strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">{valeur || (bloquee ? "Motif à préciser" : "Ajouter une note")}</span>
    </button>
  );
}

// --- AJOUT D'UNE ÉTAPE AD HOC (bas de phase) --------------------------------------
function FormAjoutAdHoc({
  dossierRef,
  phase,
  etapesPhase,
  collaborateurs,
}: {
  dossierRef: string;
  phase: Phase;
  etapesPhase: EtapeVue[];
  collaborateurs: CollaborateurVue[];
}) {
  const [ouvert, setOuvert] = useState(false);
  const [libelle, setLibelle] = useState("");
  const [assigneA, setAssigneA] = useState("");
  const [echeance, setEcheance] = useState("");
  // Position = après une étape de la phase ; "" = fin de phase (défaut).
  const [apresCode, setApresCode] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const reinitialiser = () => {
    setLibelle("");
    setAssigneA("");
    setEcheance("");
    setApresCode("");
    setOuvert(false);
  };

  const ajouter = () => {
    if (!libelle.trim()) return;
    startTransition(async () => {
      const r = await ajouterEtapeAdHocAction(dossierRef, {
        phase,
        libelle: libelle.trim(),
        ...(apresCode ? { apresCode } : {}),
        assigneA: assigneA || null,
        echeance: echeance || null,
      });
      if (r.ok) {
        toast.ok("Étape ajoutée.");
        reinitialiser();
      } else {
        toast.err(r.message);
      }
    });
  };

  if (!ouvert) {
    return (
      <div className="px-4 pt-1.5">
        <Button
          onClick={() => setOuvert(true)}
          variant="ghost"
        >
          <Plus strokeWidth={2} className="w-3.5 h-3.5" /> Ajouter une étape
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-4 mt-2 rounded-md border border-line bg-surface-2 p-3 flex flex-col gap-2">
      <Input
        value={libelle}
        onChange={(e) => setLibelle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && ajouter()}
        autoFocus
        maxLength={300}
        placeholder={`Nouvelle étape pour la phase ${PHASE_LABEL[phase]}`}
       
      />
      <div className="flex items-center gap-2 flex-wrap text-body text-ink-3">
        <Champ libelle="Assigné à">
          <Select value={assigneA} onChange={(e) => setAssigneA(e.target.value)} largeur="auto" className="max-w-[160px]">
            <option value="">-</option>
            {collaborateurs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </Select>
        </Champ>
        <Champ libelle="Échéance">
          <Input type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} largeur="auto" />
        </Champ>
        <Champ libelle="Position">
          <select value={apresCode} onChange={(e) => setApresCode(e.target.value)} className={cn(SELECT_COMPACT, "max-w-[220px]")}>
            <option value="">En fin de phase</option>
            {etapesPhase.map((e) => (
              <option key={e.code} value={e.code}>
                Après {e.code} · {e.libelle.slice(0, 40)}
                {e.libelle.length > 40 ? "…" : ""}
              </option>
            ))}
          </select>
        </Champ>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={ajouter} disabled={pending || !libelle.trim()}>
          {pending ? "Ajout…" : "Ajouter"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={reinitialiser} disabled={pending}>
          Annuler
        </Button>
      </div>
    </div>
  );
}

function Champ({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="text-ink-3">{libelle}</span>
      {children}
    </label>
  );
}

// --- JOURNAL -----------------------------------------------------------------------

export function JournalDossier({ dossierRef, journal }: { dossierRef: string; journal: EntreeJournalVue[] }) {
  // Replie par defaut : le journal s'allonge a chaque geste, la page ne doit pas s'etirer avec lui.
  const [ouvert, setOuvert] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const envoyer = () => {
    const t = note.trim();
    if (!t) return;
    startTransition(async () => {
      const r = await ajouterNoteAction(dossierRef, t);
      if (r.ok) {
        toast.ok("Note ajoutée.");
        setNote("");
      } else {
        toast.err(r.message);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <Button
          onClick={() => setOuvert((o) => !o)}
          aria-expanded={ouvert}
          variant="ghost" className="text-left"
        >
          <ChevronDown
            strokeWidth={1.5}
            className={`w-4 h-4 text-ink-3 transition-transform ${ouvert ? "" : "-rotate-90"}`}
          />
          <CardTitle>Journal du dossier</CardTitle>
        </Button>
        <span className="text-meta text-ink-3">
          {journal.length} entrée{journal.length > 1 ? "s" : ""}
        </span>
      </CardHeader>
      {ouvert && (
      <>
      <div className="px-4 py-3 border-b border-line flex items-center gap-2">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && envoyer()}
          maxLength={500}
          placeholder="Ajouter une note…"
          className="flex-1"
        />
        <Button type="button" variant="secondary" onClick={envoyer} disabled={!note.trim() || pending}>
          Noter
        </Button>
      </div>
      {journal.length === 0 ? (
        <p className="px-4 py-6 text-body text-ink-3 text-center">Aucune entrée pour le moment.</p>
      ) : (
        <ul className="divide-y divide-line">
          {[...journal].reverse().map((ev, idx) => (
            <li key={`${ev.date}-${idx}`} className="flex items-start gap-2.5 px-4 py-2.5">
              {ev.auteur ? (
                <Avatar initiales={initialesDe(ev.auteur)} title={ev.auteur} className="mt-0.5" />
              ) : (
                <MessageSquare strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-3 mt-1 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-body text-ink">{ev.texte}</p>
                <p className="text-meta text-ink-3 mt-0.5">
                  {formatDateCourte(ev.date)}
                  {ev.date.length > 10 ? ` ${formatDateHeure(ev.date).slice(11)}` : ""}
                  {ev.auteur ? ` · ${ev.auteur}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      </>
      )}
    </Card>
  );
}
