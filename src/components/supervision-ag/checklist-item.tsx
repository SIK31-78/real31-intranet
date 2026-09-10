"use client";

import { useOptimistic, useState, useTransition, type FormEvent } from "react";
import { ExternalLink, MessageSquare } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Badge, tonDeSeverite } from "@/components/ui/badge";
import { Input } from "@/components/ui/field";
import { SegmentedControl, type OptionSegment } from "@/components/ui/segmented";
import type { ItemChecklist, StatutItem } from "@/lib/domain/supervision-ag";
import { echeanceItem } from "@/lib/domain/supervision-echeances";
import { STATUT_LIBELLES } from "./statut-pill";
import { formatAuditeRelatif } from "@/lib/format-date";

// UN item = UNE ligne de 36 px : libelle, echeance, statut (segmente), meta, commentaire.
// La seconde ligne n'existe que s'il y a un commentaire (ou qu'on en ecrit un).
//
// Statuts proposes : OK / Probleme / N/A pour un item normal ; juste Probleme pour un
// item "date" (la date renseignee vaut deja validation). Pas de bouton "A verifier" :
// c'est l'etat par defaut, et recliquer le statut actif le remet a "non_verifie" (RAZ).
type StatutCochable = Exclude<StatutItem, "non_verifie">;
const STATUTS_CHECK: OptionSegment<StatutCochable>[] = [
  { value: "ok", label: STATUT_LIBELLES.ok, ton: "ok" },
  { value: "probleme", label: STATUT_LIBELLES.probleme, ton: "err" },
  { value: "non_applicable", label: STATUT_LIBELLES.non_applicable },
];
const STATUTS_DATE: OptionSegment<StatutCochable>[] = [STATUTS_CHECK[1]];

type ChecklistItemProps = {
  item: ItemChecklist;
  /** Date ISO de l'AG, pour l'echeance reglementaire de l'item (null si AG sans date). */
  agDateISO: string | null;
  aujourdhuiISO: string;
  lectureSeule?: boolean;
  onCocher: (itemId: string, statut: StatutItem) => Promise<void>;
  onCommenter: (itemId: string, commentaire: string) => Promise<void>;
  /** Item lie a un module interne (item.module) : ouvre une modale au lieu d'un lien. */
  onOuvrirModule?: (item: ItemChecklist) => void;
};

export function ChecklistItem({
  item,
  agDateISO,
  aujourdhuiISO,
  lectureSeule = false,
  onCocher,
  onCommenter,
  onOuvrirModule,
}: ChecklistItemProps) {
  const echeance = echeanceItem(item.id, agDateISO, aujourdhuiISO);
  const [isPending, startTransition] = useTransition();
  const [statutOpt, setStatutOpt] = useOptimistic(item.statut);
  const [commentaireOpt, setCommentaireOpt] = useOptimistic(item.commentaire);
  const [editComment, setEditComment] = useState(false);
  const [draft, setDraft] = useState(item.commentaire ?? "");

  const handleCocher = (statut: StatutItem) => {
    if (lectureSeule) return;
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

  // Item "date" : la valeur (ISO) est stockee dans le commentaire.
  const estDate = item.type === "date";
  const handleDateChange = (val: string) => {
    // Annee incomplete (< 4 chiffres) pendant la frappe : on attend, sinon on sauverait
    // "0002" avant "2026" (et le champ controle se bloquerait sur l'annee).
    if (val && Number(val.slice(0, 4)) < 1000) return;
    startTransition(async () => {
      setCommentaireOpt(val === "" ? undefined : val);
      await onCommenter(item.id, val);
    });
  };

  const statutSegment: StatutCochable | null = statutOpt === "non_verifie" ? null : statutOpt;

  return (
    <li className={cn("px-4 py-1.5 transition-opacity duration-120", isPending && "opacity-60")}>
      <div className="flex items-center gap-3 min-h-6">
        <div className="flex-1 min-w-0 text-body text-ink flex items-center gap-1.5 flex-wrap">
          <span>{item.libelle}</span>
          {item.module && onOuvrirModule ? (
            <Button variant="ghost" size="sm" onClick={() => onOuvrirModule(item)} title="Ouvrir le module dans une fenêtre">
              <ExternalLink strokeWidth={1.5} /> ouvrir
            </Button>
          ) : (
            item.lien && (
              <a
                href={item.lien}
                target="_blank"
                rel="noreferrer"
                title="Ouvrir l'application"
                className="inline-flex items-center gap-1 text-ink-2 hover:text-ink underline-offset-2 hover:underline rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
              >
                <ExternalLink strokeWidth={1.5} className="w-3 h-3" aria-hidden /> ouvrir
              </a>
            )
          )}
        </div>
        {echeance && (
          <Badge
            ton={tonDeSeverite(echeance.severite)}
            title={`Échéance réglementaire : ${echeance.dateISO.slice(8, 10)}/${echeance.dateISO.slice(5, 7)}/${echeance.dateISO.slice(0, 4)}`}
          >
            {echeance.label} · {echeance.dateISO.slice(8, 10)}/{echeance.dateISO.slice(5, 7)}
          </Badge>
        )}
        {item.audite && (
          <span className="hidden md:inline text-meta text-ink-3 whitespace-nowrap">
            {item.audite.initiales} · {formatAuditeRelatif(item.audite.le, aujourdhuiISO)}
          </span>
        )}
        {estDate && (
          <Input
            type="date"
            largeur="auto"
            value={commentaireOpt ?? ""}
            disabled={lectureSeule}
            aria-label={`Date : ${item.libelle}`}
            onChange={(e) => handleDateChange(e.target.value)}
            className="h-7"
          />
        )}
        <SegmentedControl<StatutCochable>
          label={`Statut : ${item.libelle}`}
          size="sm"
          options={estDate ? STATUTS_DATE : STATUTS_CHECK}
          value={statutSegment}
          disabled={lectureSeule}
          desactivable
          onChange={(v) => handleCocher(v ?? "non_verifie")}
        />
        {!estDate && !lectureSeule && (
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={commentaireOpt ? "Modifier le commentaire" : "Commenter"}
            title={commentaireOpt ? "Modifier le commentaire" : "Commenter"}
            onClick={() => {
              setEditComment((v) => !v);
              setDraft(item.commentaire ?? "");
            }}
          >
            <MessageSquare strokeWidth={1.5} className={commentaireOpt ? "text-ink" : undefined} />
          </Button>
        )}
      </div>
      {!estDate && commentaireOpt && !editComment && (
        <p className="mt-1 text-body text-ink-2 bg-surface-2 border border-line rounded-sm px-2.5 py-1">{commentaireOpt}</p>
      )}
      {!estDate && editComment && !lectureSeule && (
        <form onSubmit={handleSubmitCommentaire} className="mt-1 flex items-center gap-2">
          <Input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Commentaire court…"
            aria-label="Commentaire"
            autoFocus
            maxLength={140}
          />
          <Button type="submit" variant="secondary" size="sm" disabled={isPending}>
            OK
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditComment(false)}>
            Annuler
          </Button>
        </form>
      )}
    </li>
  );
}
