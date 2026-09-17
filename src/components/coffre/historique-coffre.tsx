"use client";

import type { EntreeAuditAffichee } from "@/app/coffre/actions";
import { LIBELLE_ACTION } from "./coffre.utils";

// Historique (audit) d'un coffre : qui a ajoute / modifie / supprime / importe, et quand.
export function HistoriqueCoffre({ entrees }: { entrees: EntreeAuditAffichee[] | null }) {
  return (
    <div className="px-4 py-3 border-b border-line bg-surface-2/40 flex flex-col gap-1.5">
      <div className="text-body font-medium text-ink-2">Historique</div>
      {entrees === null ? (
        <div className="text-body text-ink-3">Chargement...</div>
      ) : entrees.length === 0 ? (
        <div className="text-body text-ink-3">Aucune action enregistree.</div>
      ) : (
        <ul className="flex flex-col gap-0.5 max-h-48 overflow-auto">
          {entrees.map((e) => (
            <li key={e.id} className="text-body text-ink-3 flex gap-2">
              <span className="text-ink">{LIBELLE_ACTION[e.action] ?? e.action}</span>
              {e.action === "import" && typeof e.details?.count === "number" && <span>({e.details.count})</span>}
              <span>par {e.nom}</span>
              <span className="text-ink-3 ml-auto whitespace-nowrap">{new Date(e.createdAt).toLocaleString("fr-FR")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
