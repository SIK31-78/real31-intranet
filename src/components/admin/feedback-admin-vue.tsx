"use client";

// Vue client du panneau /admin/feedback : la worklist de triage. Filtres (statut / type /
// sévérité, cote client sur la liste deja triee serveur), edition inline du titre, de la
// priorité et d'une note interne, et avancement du statut (transitions bornees par le
// domaine ; écarter exige une raison). Les gardes reelles sont serveur (actions).

import { useMemo, useState, useTransition } from "react";
import { Bug, Lightbulb, ChevronDown, ChevronRight, Plus, Archive, ArchiveRestore } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { LIBELLES_APPLICATION, decoderPageFeedback } from "@/lib/domain/feedback";
import {
  STATUTS_CREATION_ADMIN,
  transitionsPossibles,
  type Feedback,
  type SeveriteFeedback,
  type StatutCreationAdmin,
  type StatutFeedback,
  type TypeFeedback,
} from "@/lib/domain/feedback";
import {
  archiverFeedbackAction,
  changerStatutAction,
  creerEntreeAction,
  editerFeedbackAction,
} from "@/app/admin/feedback/actions";

const LABEL_STATUT: Record<StatutFeedback, string> = {
  nouveau: "Nouveau",
  prevu: "Prévu",
  en_cours: "En cours",
  livre: "Livré",
  ecarte: "Écarté",
};
const TON_STATUT: Record<StatutFeedback, "neutral" | "info" | "warn" | "ok" | "err"> = {
  nouveau: "neutral",
  prevu: "info",
  en_cours: "warn",
  livre: "ok",
  ecarte: "err",
};
const LABEL_SEVERITE: Record<SeveriteFeedback, string> = {
  bloquant: "Bloquant",
  genant: "Gênant",
  confort: "Confort",
};
const TON_SEVERITE: Record<SeveriteFeedback, "err" | "warn" | "neutral"> = {
  bloquant: "err",
  genant: "warn",
  confort: "neutral",
};

function jjmmaaaa(iso?: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function TypeIcone({ type }: { type: TypeFeedback }) {
  const Icon = type === "bug" ? Bug : Lightbulb;
  return (
    <span
      title={type === "bug" ? "Bug" : "Idée"}
      className={cn(
        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded",
        type === "bug" ? "bg-err-50 text-err-700" : "bg-info-50 text-info-700",
      )}
    >
      <Icon strokeWidth={1.5} className="h-3 w-3" />
    </span>
  );
}

function LigneFeedback({ f }: { f: Feedback }) {
  const { ok, err } = useToast();
  const [enCours, startTransition] = useTransition();
  const [ouvert, setOuvert] = useState(false);
  const [titre, setTitre] = useState(f.titre);
  const [description, setDescription] = useState(f.description);
  const [priorite, setPriorite] = useState(f.priorite != null ? String(f.priorite) : "");
  const [note, setNote] = useState(f.noteInterne ?? "");
  const [raison, setRaison] = useState("");
  const [ecartArme, setEcartArme] = useState(false);
  const archivee = Boolean(f.archiveAt);

  function editer(patch: Record<string, unknown>, libelle: string) {
    startTransition(async () => {
      const r = await editerFeedbackAction({ id: f.id, ...patch });
      if (r.ok) ok(libelle);
      else err(r.message ?? "Modification impossible.");
    });
  }

  function enregistrerTitre() {
    const t = titre.trim();
    if (!t || t === f.titre) return;
    editer({ titre: t }, "Titre mis à jour");
  }

  function enregistrerDescription() {
    if (description === f.description) return;
    editer({ description }, "Description mise à jour");
  }

  function changerType(type: TypeFeedback) {
    if (type === f.type) return;
    editer({ type }, "Type mis à jour");
  }

  function basculerArchive() {
    startTransition(async () => {
      const r = await archiverFeedbackAction({ id: f.id, archive: !archivee });
      if (r.ok) ok(archivee ? "Entrée réaffichée" : "Entrée archivée");
      else err(r.message ?? "Action impossible.");
    });
  }

  function enregistrerPriorite() {
    const brut = priorite.trim();
    const val = brut === "" ? null : Number(brut);
    if (val !== null && (!Number.isInteger(val) || val < 0)) {
      err("Priorité : un entier positif (ou vide pour effacer).");
      return;
    }
    if ((val ?? null) === (f.priorite ?? null)) return;
    editer({ priorite: val }, "Priorité mise à jour");
  }

  function enregistrerNote() {
    if (note === (f.noteInterne ?? "")) return;
    editer({ noteInterne: note }, "Note enregistrée");
  }

  function avancer(statut: StatutFeedback) {
    if (statut === "ecarte" && !ecartArme) {
      setEcartArme(true);
      setOuvert(true);
      return;
    }
    startTransition(async () => {
      const r = await changerStatutAction({
        id: f.id,
        statut,
        ...(statut === "ecarte" ? { raisonEcart: raison } : {}),
      });
      if (r.ok) {
        ok(`Statut : ${LABEL_STATUT[statut]}`);
        setEcartArme(false);
        setRaison("");
      } else {
        err(r.message ?? "Changement impossible.");
      }
    });
  }

  const cibles = transitionsPossibles(f.statut);

  return (
    <>
      <tr className={cn("border-b border-line align-top", archivee && "opacity-55")}>
        <td className="px-3 py-2.5">
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => setOuvert((v) => !v)}
              aria-label={ouvert ? "Replier" : "Déplier"}
              className="mt-0.5 text-ink-4 hover:text-ink"
            >
              {ouvert ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
            <TypeIcone type={f.type} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <input
                  value={titre}
                  onChange={(e) => setTitre(e.target.value)}
                  onBlur={enregistrerTitre}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  maxLength={120}
                  className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[13px] font-medium text-ink hover:border-line focus:border-line focus:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
                />
                {archivee && (
                  <span className="shrink-0" title="Archivée : masquée de /nouveautes et de la worklist">
                    <Badge ton="neutral">Archivée</Badge>
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1 text-[11.5px] text-ink-3">
                {/* Application concernee : decodee du champ page ("app:lien", cf. domaine).
                    Le badge n'apparait que hors real31 - inutile de tamponner la norme. */}
                {(() => {
                  const { application, lien } = decoderPageFeedback(f.page);
                  return (
                    <>
                      {application !== "real31" && <Badge ton="info">{LIBELLES_APPLICATION[application]}</Badge>}
                      {lien && <code className="font-mono">{lien}</code>}
                    </>
                  );
                })()}
                <span>{f.auteurInitiales ?? f.auteurEmail ?? "anonyme"}</span>
                <span>{jjmmaaaa(f.createdAt)}</span>
              </div>
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5">
          {f.severite ? (
            <Badge ton={TON_SEVERITE[f.severite]}>{LABEL_SEVERITE[f.severite]}</Badge>
          ) : (
            <span className="text-[12px] text-ink-4" title="Entrée « maison » (sans sévérité)">
              —
            </span>
          )}
        </td>
        <td className="px-3 py-2.5">
          <Badge ton={TON_STATUT[f.statut]} dot>
            {LABEL_STATUT[f.statut]}
          </Badge>
        </td>
        <td className="px-3 py-2.5">
          <input
            value={priorite}
            onChange={(e) => setPriorite(e.target.value)}
            onBlur={enregistrerPriorite}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            inputMode="numeric"
            placeholder="—"
            className="h-7 w-14 rounded-md border border-line bg-surface px-2 text-center text-[13px] tabular-nums text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
          />
        </td>
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {cibles.length === 0 ? (
              <span className="text-[12px] text-ink-4">Terminé</span>
            ) : (
              cibles.map((c) => (
                <Button
                  key={c}
                  size="sm"
                  variant={c === "ecarte" ? "danger" : c === "livre" ? "primary" : "secondary"}
                  disabled={enCours}
                  onClick={() => avancer(c)}
                >
                  {c === "ecarte" && ecartArme ? "Confirmer ?" : LABEL_STATUT[c]}
                </Button>
              ))
            )}
            <button
              type="button"
              onClick={basculerArchive}
              disabled={enCours}
              aria-label={archivee ? "Réafficher" : "Archiver"}
              title={archivee ? "Réafficher (désarchiver)" : "Archiver (masquer de la vitrine)"}
              className="rounded-md p-1.5 text-ink-4 hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 disabled:opacity-50"
            >
              {archivee ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
            </button>
          </div>
        </td>
      </tr>
      {ouvert && (
        <tr className="border-b border-line bg-surface-2/40">
          <td colSpan={5} className="px-3 py-3">
            <div className="flex flex-col gap-3 pl-7">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-[12px] text-ink-2">
                  Type
                  <select
                    value={f.type}
                    onChange={(e) => changerType(e.target.value as TypeFeedback)}
                    disabled={enCours}
                    className="h-8 rounded-md border border-line bg-surface px-2 text-[13px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
                  >
                    <option value="idee">Idée / nouveauté</option>
                    <option value="bug">Bug</option>
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-1 text-[12px] text-ink-2">
                Description (interne — jamais publique)
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={enregistrerDescription}
                  rows={3}
                  maxLength={2000}
                  placeholder="Le texte de l'entrée…"
                  className="w-full resize-y rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] text-ink placeholder:text-ink-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
                />
              </label>

              {ecartArme && (
                <div className="rounded-md border border-err-500/30 bg-err-50 px-3 py-2.5">
                  <label className="flex flex-col gap-1 text-[12px] text-err-700">
                    Raison de l&apos;écart (obligatoire)
                    <input
                      value={raison}
                      onChange={(e) => setRaison(e.target.value)}
                      maxLength={500}
                      autoFocus
                      placeholder="Ex. Doublon de #… / hors périmètre / déjà couvert par…"
                      className="h-8 w-full rounded-md border border-line bg-surface px-2 text-[13px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
                    />
                  </label>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="danger" disabled={enCours || !raison.trim()} onClick={() => avancer("ecarte")}>
                      Écarter
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEcartArme(false);
                        setRaison("");
                      }}
                    >
                      Annuler
                    </Button>
                  </div>
                </div>
              )}

              {f.raisonEcart && !ecartArme && (
                <div className="text-[12.5px] text-ink-3">
                  <span className="font-medium text-ink-2">Raison de l&apos;écart :</span> {f.raisonEcart}
                </div>
              )}

              <label className="flex flex-col gap-1 text-[12px] text-ink-2">
                Note interne (jamais publique)
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onBlur={enregistrerNote}
                  rows={2}
                  maxLength={2000}
                  placeholder="Note de travail, contexte, lien…"
                  className="w-full resize-y rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] text-ink placeholder:text-ink-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
                />
              </label>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Formulaire de creation d'une entree « maison » (nouveaute / roadmap) : le pendant admin
// du bouton collaborateur. Titre fourni, statut choisi (defaut `livre` = alimente le
// changelog), description interne + priorite optionnelles. Garde super-admin cote action.
function FormulaireEntreeMaison({ onFermer }: { onFermer: () => void }) {
  const { ok, err } = useToast();
  const [enCours, startTransition] = useTransition();
  const [type, setType] = useState<TypeFeedback>("idee");
  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [statut, setStatut] = useState<StatutCreationAdmin>("livre");
  const [priorite, setPriorite] = useState("");

  const champCls =
    "h-8 rounded-md border border-line bg-surface px-2 text-[13px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600";

  function soumettre() {
    const t = titre.trim();
    if (!t) {
      err("Le titre est obligatoire.");
      return;
    }
    const brut = priorite.trim();
    const prio = brut === "" ? undefined : Number(brut);
    if (prio !== undefined && (!Number.isInteger(prio) || prio < 0)) {
      err("Priorité : un entier positif (ou vide).");
      return;
    }
    startTransition(async () => {
      const r = await creerEntreeAction({
        type,
        titre: t,
        statut,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(prio !== undefined ? { priorite: prio } : {}),
      });
      if (r.ok) {
        ok("Entrée ajoutée");
        onFermer();
      } else {
        err(r.message ?? "Création impossible.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3.5 px-4 py-4">
      <p className="text-[12.5px] text-ink-3">
        Une entrée créée ici alimente directement la page <span className="font-medium">Nouveautés</span> : en «
        Livré » pour le changelog, en « Prévu » ou « En cours » pour la roadmap.
      </p>

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-[12px] text-ink-2">
          Type
          <select value={type} onChange={(e) => setType(e.target.value as TypeFeedback)} className={champCls}>
            <option value="idee">Idée / nouveauté</option>
            <option value="bug">Bug</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-2">
          Statut
          <select
            value={statut}
            onChange={(e) => setStatut(e.target.value as StatutCreationAdmin)}
            className={champCls}
          >
            {STATUTS_CREATION_ADMIN.map((s) => (
              <option key={s} value={s}>
                {LABEL_STATUT[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-2">
          Priorité (facultatif)
          <input
            value={priorite}
            onChange={(e) => setPriorite(e.target.value)}
            inputMode="numeric"
            placeholder="—"
            className={cn(champCls, "w-24 tabular-nums")}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-[12px] text-ink-2">
        Titre (obligatoire)
        <input
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          maxLength={120}
          autoFocus
          placeholder="Ex. Nouvel accueil"
          className="h-8 w-full rounded-md border border-line bg-surface px-2 text-[13px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
        />
      </label>

      <label className="flex flex-col gap-1 text-[12px] text-ink-2">
        Description publique / interne (facultatif)
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Le texte qui accompagne l'entrée…"
          className="w-full resize-y rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] text-ink placeholder:text-ink-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
        />
      </label>

      <div className="mt-1 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onFermer} disabled={enCours}>
          Annuler
        </Button>
        <Button size="sm" variant="primary" onClick={soumettre} disabled={enCours || !titre.trim()}>
          Ajouter l&apos;entrée
        </Button>
      </div>
    </div>
  );
}

export function FeedbackAdminVue({
  feedbacks,
  feedbackNonConfigure,
}: {
  feedbacks: Feedback[];
  feedbackNonConfigure: boolean;
}) {
  const [fStatut, setFStatut] = useState<StatutFeedback | "">("");
  const [fType, setFType] = useState<TypeFeedback | "">("");
  const [fSeverite, setFSeverite] = useState<SeveriteFeedback | "">("");
  const [fArchive, setFArchive] = useState<"actives" | "archivees" | "toutes">("actives");
  const [ajoutOuvert, setAjoutOuvert] = useState(false);

  const filtres = useMemo(
    () =>
      feedbacks.filter((f) => {
        const arch = Boolean(f.archiveAt);
        if (fArchive === "actives" && arch) return false;
        if (fArchive === "archivees" && !arch) return false;
        return (
          (!fStatut || f.statut === fStatut) &&
          (!fType || f.type === fType) &&
          (!fSeverite || f.severite === fSeverite)
        );
      }),
    [feedbacks, fStatut, fType, fSeverite, fArchive],
  );

  const selectCls =
    "h-8 rounded-md border border-line bg-surface px-2 text-[13px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600";

  return (
    <div className="flex flex-col gap-4">
      {feedbackNonConfigure && (
        <div className="rounded-md border border-warn-500/40 bg-warn-50 px-4 py-3 text-[13px] text-warn-700">
          La table <code className="font-mono">intranet_feedback</code> n&apos;existe pas encore : passe le script{" "}
          <code className="font-mono">supabase/sql/intranet_feedback.sql</code> dans le SQL editor Supabase. En
          attendant, les remontées ne sont pas enregistrées.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select value={fStatut} onChange={(e) => setFStatut(e.target.value as StatutFeedback | "")} className={selectCls}>
          <option value="">Tous les statuts</option>
          {(Object.keys(LABEL_STATUT) as StatutFeedback[]).map((s) => (
            <option key={s} value={s}>
              {LABEL_STATUT[s]}
            </option>
          ))}
        </select>
        <select value={fType} onChange={(e) => setFType(e.target.value as TypeFeedback | "")} className={selectCls}>
          <option value="">Bugs + idées</option>
          <option value="bug">Bugs</option>
          <option value="idee">Idées</option>
        </select>
        <select
          value={fSeverite}
          onChange={(e) => setFSeverite(e.target.value as SeveriteFeedback | "")}
          className={selectCls}
        >
          <option value="">Toutes sévérités</option>
          {(Object.keys(LABEL_SEVERITE) as SeveriteFeedback[]).map((s) => (
            <option key={s} value={s}>
              {LABEL_SEVERITE[s]}
            </option>
          ))}
        </select>
        <select
          value={fArchive}
          onChange={(e) => setFArchive(e.target.value as "actives" | "archivees" | "toutes")}
          className={selectCls}
        >
          <option value="actives">Actives</option>
          <option value="archivees">Archivées</option>
          <option value="toutes">Toutes (+ archivées)</option>
        </select>
        {(fStatut || fType || fSeverite || fArchive !== "actives") && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setFStatut("");
              setFType("");
              setFSeverite("");
              setFArchive("actives");
            }}
          >
            Réinitialiser
          </Button>
        )}
        <div className="ml-auto">
          <Button size="sm" variant="primary" onClick={() => setAjoutOuvert(true)} disabled={feedbackNonConfigure}>
            <Plus strokeWidth={1.5} className="h-3.5 w-3.5" />
            Ajouter une entrée
          </Button>
        </div>
      </div>

      {ajoutOuvert && (
        <Modal titre="Ajouter une entrée" onFermer={() => setAjoutOuvert(false)}>
          <FormulaireEntreeMaison onFermer={() => setAjoutOuvert(false)} />
        </Modal>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            Remontées ({filtres.length}
            {filtres.length !== feedbacks.length ? ` / ${feedbacks.length}` : ""})
          </CardTitle>
        </CardHeader>
        {filtres.length === 0 ? (
          <div className="px-4 py-6 text-[13px] text-ink-3">
            {feedbacks.length === 0 ? "Aucune remontée pour l'instant." : "Aucune remontée ne correspond aux filtres."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11.5px] uppercase tracking-wide text-ink-3">
                  <th className="px-3 py-2 font-medium">Remontée</th>
                  <th className="px-3 py-2 font-medium">Sévérité</th>
                  <th className="px-3 py-2 font-medium">Statut</th>
                  <th className="px-3 py-2 font-medium">Priorité</th>
                  <th className="px-3 py-2 text-right font-medium">Faire avancer</th>
                </tr>
              </thead>
              <tbody>
                {filtres.map((f) => (
                  <LigneFeedback key={f.id} f={f} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
