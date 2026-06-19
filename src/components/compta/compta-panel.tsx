"use client";

// Panneau compta d'une AG : les 2 flags (comptes verifies / envoyer avant) + le fil de
// notes (comptable <-> gestionnaire) avec ajout et marquage "traite". Reutilise cote vue
// comptable (role "comptable") et cote fiche gestionnaire (role "gestionnaire").

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Send, CircleCheck, Circle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AuteurNote, EtatCompta } from "@/lib/domain/compta";
import { ajouterNoteAction, marquerNoteAction, setFlagAction } from "@/app/compta/actions";

function formatQuand(iso: string): string {
  const [d] = iso.split("T");
  const [y, m, j] = d.split("-");
  return `${j}/${m}/${y.slice(2)}`;
}

export function ComptaPanel({
  coproCode,
  agDateISO,
  etat,
  role,
}: {
  coproCode: string;
  agDateISO: string;
  etat: EtatCompta;
  role: AuteurNote;
}) {
  const router = useRouter();
  const [pending, demarrer] = useTransition();
  const [texte, setTexte] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  function agir(p: Promise<{ ok: boolean; erreur?: string }>) {
    setErreur(null);
    demarrer(async () => {
      const r = await p;
      if (r.ok) router.refresh();
      else setErreur(r.erreur ?? "Erreur.");
    });
  }
  function envoyer() {
    if (!texte.trim()) return;
    setErreur(null);
    demarrer(async () => {
      const r = await ajouterNoteAction(coproCode, agDateISO, role, texte);
      if (r.ok) {
        setTexte("");
        router.refresh();
      } else setErreur(r.erreur ?? "Erreur.");
    });
  }

  const ouvertes = etat.notes.filter((n) => !n.resolu).length;

  return (
    <div className="flex flex-col gap-3">
      {/* Flags */}
      <div className="flex flex-wrap items-center gap-2">
        <FlagBtn
          actif={etat.comptesVerifies}
          libelleOn="Comptes vérifiés"
          libelleOff="Marquer les comptes vérifiés"
          tonOn="ok"
          disabled={pending}
          onClick={() => agir(setFlagAction(coproCode, agDateISO, "verifies", !etat.comptesVerifies))}
        />
        <FlagBtn
          actif={etat.envoyerAvant}
          libelleOn="À envoyer au CS avant la réunion"
          libelleOff="Demander l'envoi avant la réunion"
          tonOn="warn"
          disabled={pending}
          onClick={() => agir(setFlagAction(coproCode, agDateISO, "envoyer-avant", !etat.envoyerAvant))}
        />
      </div>

      {/* Fil de notes */}
      <Card>
        <div className="px-3 py-2 border-b border-line flex items-center justify-between">
          <span className="text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-3">
            Notes comptes ({etat.notes.length})
          </span>
          {ouvertes > 0 && (
            <Badge ton="warn" dot>
              {ouvertes} à traiter
            </Badge>
          )}
        </div>
        {etat.notes.length === 0 ? (
          <p className="px-3 py-5 text-[13px] text-ink-3 text-center">
            Aucune note. {role === "comptable" ? "Pose tes questions/remarques sur les comptes." : "La comptable n'a pas encore posté de note."}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {etat.notes.map((n) => (
              <li key={n.id} className={`px-3 py-2.5 flex items-start gap-2.5 ${n.resolu ? "opacity-55" : ""}`}>
                <button
                  type="button"
                  onClick={() => agir(marquerNoteAction(coproCode, agDateISO, n.id, !n.resolu))}
                  disabled={pending}
                  aria-label={n.resolu ? "Marquer non traitée" : "Marquer traitée"}
                  title={n.resolu ? "Marquer non traitée" : "Marquer traitée"}
                  className="shrink-0 mt-px text-ink-3 hover:text-green-700"
                >
                  {n.resolu ? (
                    <CircleCheck strokeWidth={1.5} className="w-4 h-4 text-ok-700" />
                  ) : (
                    <Circle strokeWidth={1.5} className="w-4 h-4" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge ton={n.auteur === "comptable" ? "info" : "brand"}>
                      {n.auteur === "comptable" ? "Comptable" : "Gestion"}
                    </Badge>
                    <span className="text-[11px] text-ink-4">
                      {n.marquePar ? `${n.marquePar} · ` : ""}
                      {formatQuand(n.createdAt)}
                    </span>
                    {n.resolu && <span className="text-[11px] text-ok-700">traitée</span>}
                  </div>
                  <p className={`mt-0.5 text-[13px] text-ink ${n.resolu ? "line-through" : ""}`}>{n.texte}</p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Ajout */}
        <div className="px-3 py-2.5 border-t border-line flex items-end gap-2">
          <textarea
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            placeholder={role === "comptable" ? "Note / question sur les comptes..." : "Réponse à la comptable..."}
            aria-label={role === "comptable" ? "Note ou question sur les comptes" : "Reponse a la comptable"}
            rows={2}
            className="flex-1 px-2.5 py-1.5 rounded-md border border-line bg-surface text-[13px] focus:outline-none focus:border-green-700 resize-y"
          />
          <button
            type="button"
            onClick={envoyer}
            disabled={pending || !texte.trim()}
            aria-busy={pending}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-green-700 text-surface text-[13px] font-medium hover:bg-green-600 disabled:opacity-50 shrink-0"
          >
            {pending ? <Loader2 strokeWidth={2} className="w-4 h-4 animate-spin" /> : <Send strokeWidth={1.5} className="w-4 h-4" />}
            Envoyer
          </button>
        </div>
      </Card>

      {erreur && (
        <p role="alert" className="text-[12px] text-err-700">
          {erreur}
        </p>
      )}
    </div>
  );
}

function FlagBtn({
  actif,
  libelleOn,
  libelleOff,
  tonOn,
  disabled,
  onClick,
}: {
  actif: boolean;
  libelleOn: string;
  libelleOff: string;
  tonOn: "ok" | "warn";
  disabled: boolean;
  onClick: () => void;
}) {
  const couleur = actif
    ? tonOn === "ok"
      ? "bg-ok-50 text-ok-700 border-ok-500/30"
      : "bg-warn-50 text-warn-700 border-warn-500/30"
    : "bg-surface text-ink-2 border-line hover:border-line-2";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-[12.5px] font-medium transition-colors disabled:opacity-60 ${couleur}`}
    >
      {actif && <Check strokeWidth={2} className="w-3.5 h-3.5" />}
      {actif ? libelleOn : libelleOff}
    </button>
  );
}
