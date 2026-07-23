"use client";

// Vue client du panneau /admin/feedback : la worklist de triage. Filtres (statut / type /
// sévérité, cote client sur la liste deja triee serveur), edition inline du titre, de la
// priorité et d'une note interne, et avancement du statut (transitions bornees par le
// domaine ; écarter exige une raison). Les gardes reelles sont serveur (actions).

import { useMemo, useState, useTransition } from "react";
import { Bug, Lightbulb, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  transitionsPossibles,
  type Feedback,
  type SeveriteFeedback,
  type StatutFeedback,
  type TypeFeedback,
} from "@/lib/domain/feedback";
import { changerStatutAction, editerFeedbackAction } from "@/app/admin/feedback/actions";

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
  const [priorite, setPriorite] = useState(f.priorite != null ? String(f.priorite) : "");
  const [note, setNote] = useState(f.noteInterne ?? "");
  const [raison, setRaison] = useState("");
  const [ecartArme, setEcartArme] = useState(false);

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
      <tr className="border-b border-line align-top">
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
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1 text-[11.5px] text-ink-3">
                {f.page && <code className="font-mono">{f.page}</code>}
                <span>{f.auteurInitiales ?? f.auteurEmail ?? "anonyme"}</span>
                <span>{jjmmaaaa(f.createdAt)}</span>
              </div>
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5">
          <Badge ton={TON_SEVERITE[f.severite]}>{LABEL_SEVERITE[f.severite]}</Badge>
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
          {cibles.length === 0 ? (
            <span className="text-[12px] text-ink-4">Terminé</span>
          ) : (
            <div className="flex flex-wrap justify-end gap-1.5">
              {cibles.map((c) => (
                <Button
                  key={c}
                  size="sm"
                  variant={c === "ecarte" ? "danger" : c === "livre" ? "primary" : "secondary"}
                  disabled={enCours}
                  onClick={() => avancer(c)}
                >
                  {c === "ecarte" && ecartArme ? "Confirmer ?" : LABEL_STATUT[c]}
                </Button>
              ))}
            </div>
          )}
        </td>
      </tr>
      {ouvert && (
        <tr className="border-b border-line bg-surface-2/40">
          <td colSpan={5} className="px-3 py-3">
            <div className="flex flex-col gap-3 pl-7">
              <div>
                <div className="mb-1 text-[11.5px] font-medium uppercase tracking-wide text-ink-3">
                  Description (interne)
                </div>
                <p className="whitespace-pre-wrap text-[13px] text-ink-2">{f.description}</p>
              </div>

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

  const filtres = useMemo(
    () =>
      feedbacks.filter(
        (f) =>
          (!fStatut || f.statut === fStatut) &&
          (!fType || f.type === fType) &&
          (!fSeverite || f.severite === fSeverite),
      ),
    [feedbacks, fStatut, fType, fSeverite],
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
        {(fStatut || fType || fSeverite) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setFStatut("");
              setFType("");
              setFSeverite("");
            }}
          >
            Réinitialiser
          </Button>
        )}
      </div>

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
