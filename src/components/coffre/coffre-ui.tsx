"use client";

import type { ReactNode, ComponentType } from "react";
import { Copy, Loader2 } from "lucide-react";
import { evaluerForceMotDePasse } from "@/lib/domain/coffre";
import { Button } from "@/components/ui/button";
import { FORCE_STYLE } from "./coffre.utils";

// --- petits composants partages par les ecrans du coffre --------------------

/** Jauge de force du mot de passe MAITRE (rien tant que le champ est vide). */
export function BarreForce({ mdp }: { mdp: string }) {
  if (mdp.length === 0) return null;
  const f = evaluerForceMotDePasse(mdp);
  const st = FORCE_STYLE[f.niveau];
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-meta mb-1">
        <span className={st.texte}>Force : {st.libelle}</span>
        {!f.ok && f.raison && <span className="text-ink-3 text-right">{f.raison}</span>}
      </div>
      <div className="h-1 rounded-full bg-surface-2 overflow-hidden">
        <div className={`h-full transition-all ${st.barre} ${st.pct}`} />
      </div>
    </div>
  );
}

/** Mot de passe genere, revele UNE fois pour etre copie. Il ne quitte jamais
 *  cette page : ni log, ni requete, ni stockage. */
export function BoiteMdpGenere({ mdp, onCopie }: { mdp: string | null; onCopie: () => void }) {
  if (!mdp) return null;
  return (
    <div className="rounded-md border border-ok-500/30 bg-ok-50 px-3 py-2">
      <div className="text-body font-medium text-ok-700 mb-1">Mot de passe généré - copie-le maintenant</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 font-mono text-body text-ink break-all select-all">{mdp}</code>
        <Button
          onClick={() => {
            navigator.clipboard?.writeText(mdp);
            onCopie();
          }}
          aria-label="Copier"
          variant="ghost" iconOnly className="shrink-0"
        >
          <Copy className="w-3.5 h-3.5" />
        </Button>
      </div>
      <p className="mt-1 text-meta text-ink-3">
        Garde-le dans ton gestionnaire (Chrome te proposera de l&apos;enregistrer). Personne ne peut le
        récupérer à ta place.
      </p>
    </div>
  );
}

export function Cadre({ children }: { children: ReactNode }) {
  return <div className="border border-line rounded-lg bg-surface px-6 py-6">{children}</div>;
}

export function Bouton({
  onClick,
  busy,
  label,
  icone: Icone,
}: {
  onClick: () => void;
  busy: boolean;
  label: string;
  icone: ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <Button
      onClick={onClick}
      disabled={busy}
      variant="primary" size="lg"
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icone className="w-4 h-4" strokeWidth={2} />}
      {label}
    </Button>
  );
}
