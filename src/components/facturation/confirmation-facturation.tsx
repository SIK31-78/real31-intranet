"use client";

// Fenetre de validation avant envoi en facturation, commune aux 5 prestations.
// Elle recapitule les criteres retenus, ce qui est deja couvert par le contrat,
// et le montant qui partira. C'est le dernier point de controle humain avant
// qu'une facture parte chez le client.

import { ClipboardCheck, Loader2, Send, TriangleAlert, X } from "lucide-react";
import type { ApercuFacturation } from "@/lib/services/facturation/apercu";

function euros(n: number): string {
  return `${n.toFixed(2).replace(".", ",")} €`;
}

export function ConfirmationFacturation({
  apercu,
  pennylaneActif,
  pending,
  onConfirmer,
  onAnnuler,
}: {
  apercu: ApercuFacturation;
  pennylaneActif: boolean;
  pending: boolean;
  onConfirmer: () => void;
  onAnnuler: () => void;
}) {
  const { rienAFacturer, actionSansFacture } = apercu;
  // Rien a facturer n'est pas rien a faire : une prestation peut n'avoir aucune
  // facture a emettre et rester a enregistrer (le recap AG). Dans ce cas seul le
  // libelle du bouton change, l'action de confirmation reste la meme.
  const aConfirmer = !rienAFacturer || Boolean(actionSansFacture);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-[540px] overflow-y-auto rounded-lg bg-white shadow-xl">
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-line bg-white px-4 py-3">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">
              {!rienAFacturer
                ? "Confirmer l'envoi en facturation"
                : actionSansFacture
                  ? "Enregistrer sans facturer"
                  : "Rien à facturer"}
            </h2>
            <p className="text-[12px] text-ink-3">
              {apercu.titre} · {apercu.coproCode}
            </p>
          </div>
          <button type="button" onClick={onAnnuler} aria-label="Fermer" className="text-ink-3 hover:text-ink">
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-4 py-4">
          <dl className="text-[13px]">
            {apercu.details.map((d, i) => (
              <div key={i} className="flex justify-between gap-4 border-b border-line py-1.5">
                <dt
                  className={
                    d.accent === "fort" ? "font-medium text-ink" : "whitespace-pre text-ink-3"
                  }
                >
                  {d.libelle}
                </dt>
                <dd
                  className={
                    d.accent === "fort"
                      ? "text-right font-semibold text-ink"
                      : d.accent === "contrat"
                        ? "text-right text-green-800"
                        : "text-right text-ink"
                  }
                >
                  {d.valeur}
                </dd>
              </div>
            ))}

            {!rienAFacturer && (
              <div className="flex justify-between gap-4 py-2">
                <dt className="font-semibold text-ink">Montant facturé</dt>
                <dd className="text-right">
                  <span className="text-[15px] font-semibold text-ink">
                    {euros(apercu.montantHt)} HT
                  </span>
                  <span className="block text-[12px] text-ink-3">
                    {euros(apercu.montantTtc)} TTC
                  </span>
                </dd>
              </div>
            )}
          </dl>

          {/* Alertes non bloquantes : visibles, mais la validation reste possible. */}
          {(apercu.avertissements ?? []).map((a, i) => (
            <p
              key={i}
              className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900"
            >
              <TriangleAlert className="mt-px h-4 w-4 shrink-0" strokeWidth={1.5} />
              <span>{a}</span>
            </p>
          ))}

          {rienAFacturer ? (
            <p className="rounded bg-black/[0.03] px-3 py-2 text-[12px] text-ink-3">
              {apercu.motifRienAFacturer ?? "Aucune facture ne sera créée."}
            </p>
          ) : (
            <p className="rounded bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              {pennylaneActif
                ? "En confirmant, un brouillon de facture est créé dans Pennylane. Il restera à valider par la comptabilité."
                : "Mode simulation : PENNYLANE_API_KEY absente, aucun brouillon ne partira réellement."}
            </p>
          )}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-white px-4 py-3">
          <button
            type="button"
            onClick={onAnnuler}
            disabled={pending}
            className="rounded border border-line px-3 py-2 text-[13px] text-ink hover:bg-black/[0.03] disabled:opacity-50"
          >
            {aConfirmer ? "Annuler" : "Fermer"}
          </button>
          {aConfirmer && (
            <button
              type="button"
              onClick={onConfirmer}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded bg-green-700 px-3 py-2 text-[13px] font-medium text-white hover:bg-green-800 disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : rienAFacturer ? (
                <ClipboardCheck className="w-4 h-4" strokeWidth={1.5} />
              ) : (
                <Send className="w-4 h-4" strokeWidth={1.5} />
              )}
              {rienAFacturer ? actionSansFacture : "Confirmer et envoyer"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
