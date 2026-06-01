"use client";

import {
  useOptimistic,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icon";
import type { ItemChecklist, StatutItem } from "@/lib/domain/supervision-ag";
import { STATUT_LIBELLES } from "./statut-pill";
import { formatAuditeRelatif } from "@/lib/format-date";

const ORDRE_STATUT: StatutItem[] = [
  "ok",
  "probleme",
  "non_applicable",
  "non_verifie",
];

const BTN_STYLES: Record<StatutItem, { actif: string; inactif: string }> = {
  ok: {
    actif: "bg-ok-50 text-ok-700 border-ok-500/30",
    inactif:
      "bg-surface text-ink-3 border-line hover:border-line-2 hover:text-ok-700",
  },
  probleme: {
    actif: "bg-err-50 text-err-700 border-err-500/30",
    inactif:
      "bg-surface text-ink-3 border-line hover:border-line-2 hover:text-err-700",
  },
  non_applicable: {
    actif: "bg-surface-2 text-ink-2 border-line-2",
    inactif: "bg-surface text-ink-3 border-line hover:border-line-2",
  },
  non_verifie: {
    actif: "bg-transparent text-ink-3 border-line-2 border-dashed",
    inactif:
      "bg-transparent text-ink-4 border-line border-dashed hover:text-ink-3 hover:border-line-2",
  },
};

type ChecklistItemProps = {
  item: ItemChecklist;
  aujourdhuiISO: string;
  lectureSeule?: boolean;
  onCocher: (itemId: string, statut: StatutItem) => Promise<void>;
  onCommenter: (itemId: string, commentaire: string) => Promise<void>;
};

export function ChecklistItem({
  item,
  aujourdhuiISO,
  lectureSeule = false,
  onCocher,
  onCommenter,
}: ChecklistItemProps) {
  const [isPending, startTransition] = useTransition();
  const [statutOpt, setStatutOpt] = useOptimistic(item.statut);
  const [commentaireOpt, setCommentaireOpt] = useOptimistic(item.commentaire);
  const [editComment, setEditComment] = useState(false);
  const [draft, setDraft] = useState(item.commentaire ?? "");

  const handleCocher = (statut: StatutItem) => {
    if (lectureSeule || statut === statutOpt) return;
    startTransition(async () => {
      setStatutOpt(statut);
      await onCocher(item.id, statut);
    });
  };

  const handleSubmitCommentaire = (e: FormEvent) => {
    e.preventDefault();
    const valeur = draft.trim();
    startTransition(async () => {
      setCommentaireOpt(valeur === "" ? undefined : valeur);
      setEditComment(false);
      await onCommenter(item.id, valeur);
    });
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 py-2.5 px-4 border-b border-line last:border-b-0 transition-opacity",
        isPending && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 text-[13px] text-ink leading-snug pt-1">
          {item.libelle}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {ORDRE_STATUT.map((s) => {
            const actif = statutOpt === s;
            return (
              <button
                key={s}
                type="button"
                disabled={lectureSeule}
                onClick={() => handleCocher(s)}
                aria-pressed={actif}
                className={cn(
                  "h-7 px-2 rounded-sm border text-[11px] font-medium transition-colors duration-75 disabled:cursor-not-allowed",
                  actif ? BTN_STYLES[s].actif : BTN_STYLES[s].inactif,
                )}
              >
                {STATUT_LIBELLES[s]}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0 text-[11.5px] text-ink-3">
          {item.audite && (
            <>
              <span className="font-medium text-ink-2">
                {item.audite.initiales}
              </span>{" "}
              · {formatAuditeRelatif(item.audite.le, aujourdhuiISO)}
            </>
          )}
        </div>
        {!lectureSeule && !editComment && (
          <button
            type="button"
            onClick={() => {
              setEditComment(true);
              setDraft(item.commentaire ?? "");
            }}
            className="text-[11.5px] text-ink-3 hover:text-ink-2 inline-flex items-center gap-1"
          >
            <Icon name="message-square" className="w-3 h-3" />
            {commentaireOpt ? "Modifier" : "Commenter"}
          </button>
        )}
      </div>
      {commentaireOpt && !editComment && (
        <div className="text-[12px] text-ink-2 bg-surface-2 border border-line rounded-sm px-2.5 py-1.5">
          {commentaireOpt}
        </div>
      )}
      {editComment && !lectureSeule && (
        <form onSubmit={handleSubmitCommentaire} className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Commentaire court..."
            autoFocus
            maxLength={140}
            className="flex-1 h-8 px-2.5 rounded-sm border border-line bg-surface text-[12px] focus:outline-none focus:border-line-2"
          />
          <button
            type="submit"
            disabled={isPending}
            className="h-8 px-3 rounded-sm bg-green-700 text-surface text-[12px] font-medium hover:bg-green-600 disabled:opacity-50"
          >
            OK
          </button>
          <button
            type="button"
            onClick={() => setEditComment(false)}
            className="h-8 px-2.5 rounded-sm border border-line bg-surface text-[12px] text-ink-2 hover:border-line-2"
          >
            Annuler
          </button>
        </form>
      )}
    </div>
  );
}
