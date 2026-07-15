"use client";

// ZONE "Fiches de renseignements" de la fiche-hub reprise (cote gestionnaire). Trois usages :
//   1. GENERER les courriers en lot (une page A4 par coproprietaire, lien + code) -> ouvre un
//      onglet imprimable. Bouton RELANCE pour regenerer les non-repondants.
//   2. SUIVI : tableau des owners (courrier genere le X / repondu le Y / valide le Z / mail).
//   3. RETOURS A VALIDER : chaque soumission -> compare connu vs saisi -> bouton Valider
//      (ecrit l'email dans eStale + envoie le mail "espace client pret").
//
// Aucune PII ne quitte cette page vers un log. Le HTML des courriers (secrets en clair) est
// ouvert dans un onglet via un Blob et n'est jamais conserve.

import { useState, useTransition } from "react";
import { Mail, Printer, RefreshCw, CheckCircle2, FileText } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { formatDateLongue } from "@/lib/format-date";
import type { DonneesSoumises, FicheStatut } from "@/lib/reprise/domain/fiche-renseignements";
import { genererCourriersFicheAction, validerFicheAction } from "./actions";

export interface FicheOwnerVue {
  ownerId: string;
  nom: string;
  statut: FicheStatut | "aucune";
  courrierGenereAt?: string;
  soumisAt?: string;
  valideAt?: string;
  mailEnvoyeAt?: string;
  derniereRelanceAt?: string;
  emailConnu?: string;
  emailSoumis?: string;
  soumises?: DonneesSoumises;
  connues?: { telFixe?: string; telPortable?: string; adrVille?: string };
}

const STATUT_LABEL: Record<FicheStatut | "aucune", string> = {
  aucune: "Courrier a generer",
  courrier_genere: "Courrier genere",
  soumis: "Repondu - a valider",
  valide: "Valide",
};
const STATUT_TON: Record<FicheStatut | "aucune", "neutral" | "info" | "warn" | "ok"> = {
  aucune: "neutral",
  courrier_genere: "info",
  soumis: "warn",
  valide: "ok",
};

export function FicheRenseignementsBloc({
  dossierRef,
  aDesOwners,
  fiches,
  mailActif,
  ecritureReelle,
}: {
  dossierRef: string;
  aDesOwners: boolean;
  fiches: FicheOwnerVue[];
  mailActif: boolean;
  ecritureReelle: boolean;
}) {
  const toast = useToast();
  const [genPending, startGen] = useTransition();

  const ouvrirDocument = (html: string) => {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    // Libere l'URL apres un delai (le temps que l'onglet charge).
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const generer = (relance: boolean) => {
    startGen(async () => {
      const r = await genererCourriersFicheAction(dossierRef, relance ? { relance: true } : undefined);
      if (r.ok) {
        ouvrirDocument(r.html);
        toast.ok(
          `${r.nbCourriers} courrier(s) genere(s)${r.ignores > 0 ? ` (${r.ignores} deja repondu ignore(s))` : ""}. Onglet d'impression ouvert.`,
        );
      } else {
        toast.err(r.message);
      }
    });
  };

  const aValider = fiches.filter((f) => f.statut === "soumis");
  const nonRepondants = fiches.filter((f) => f.statut === "courrier_genere").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fiches de renseignements</CardTitle>
        <span className="text-[11px] text-ink-4">Courriers coproprietaires -&gt; formulaire en ligne -&gt; validation</span>
      </CardHeader>

      <div className="p-4 flex flex-col gap-4">
        <p className="text-[12.5px] text-ink-3">
          Genere un courrier pre-rempli par coproprietaire (adresse postale connue), avec un lien et un code personnel
          vers le formulaire en ligne. A la reponse, valide pour ecrire l&apos;email dans eStale et envoyer le mail
          &laquo; espace client pret &raquo;.
        </p>

        {!aDesOwners ? (
          <div className="rounded-md border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-ink-3">
            Aucun coproprietaire dans le jeu. Lance d&apos;abord l&apos;analyse des documents (zone Patrimoine) : les
            courriers utilisent les noms + adresses extraits.
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <Button type="button" variant="primary" onClick={() => generer(false)} disabled={genPending}>
              <Printer strokeWidth={1.5} /> {genPending ? "Generation..." : "Generer les courriers"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => generer(true)}
              disabled={genPending || nonRepondants === 0}
              title={nonRepondants === 0 ? "Aucun non-repondant" : `${nonRepondants} non-repondant(s)`}
            >
              <RefreshCw strokeWidth={1.5} /> Relance des non-repondants
            </Button>
          </div>
        )}

        {/* Notes de gate : mail + ecriture eStale. */}
        <div className="flex flex-col gap-1.5">
          <div
            className={
              "rounded-md border px-3 py-1.5 text-[11.5px] " +
              (mailActif ? "border-line bg-surface-2 text-ink-2" : "border-warn-500/40 bg-warn-50 text-warn-700")
            }
          >
            {mailActif
              ? "Mail actif : la validation enverra le mail « espace client pret »."
              : "Mail inactif (MAIL_SOURCE / MAIL_PILOTES) : la validation n'enverra PAS de mail (statut le refletera)."}
          </div>
          <div
            className={
              "rounded-md border px-3 py-1.5 text-[11.5px] " +
              (ecritureReelle ? "border-err-500/40 bg-err-50 text-err-700" : "border-line bg-surface-2 text-ink-2")
            }
          >
            {ecritureReelle
              ? "Ecriture eStale REELLE (ESTALE_ECRITURE=reel) : la validation ECRIT l'email en PRODUCTION."
              : "Ecriture eStale en DRY-RUN : la validation ne modifie pas eStale (note seulement)."}
          </div>
        </div>

        {/* RETOURS A VALIDER */}
        {aValider.length > 0 && (
          <section>
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">
              Retours a valider ({aValider.length})
            </h3>
            <ul className="mt-2 flex flex-col gap-2">
              {aValider.map((f) => (
                <LigneAValider key={f.ownerId} dossierRef={dossierRef} fiche={f} />
              ))}
            </ul>
          </section>
        )}

        {/* SUIVI : tableau des owners */}
        {fiches.length > 0 && (
          <section>
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Suivi ({fiches.length})</h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead className="text-left text-[11px] uppercase text-ink-4">
                  <tr>
                    <th className="py-1 font-medium">Coproprietaire</th>
                    <th className="font-medium">Statut</th>
                    <th className="font-medium">Courrier</th>
                    <th className="font-medium">Repondu</th>
                    <th className="font-medium">Valide</th>
                    <th className="font-medium">Mail</th>
                  </tr>
                </thead>
                <tbody>
                  {fiches.map((f) => (
                    <tr key={f.ownerId} className="border-t border-line">
                      <td className="py-1.5 text-ink truncate max-w-[220px]">{f.nom}</td>
                      <td>
                        <Badge ton={STATUT_TON[f.statut]} dot>
                          {STATUT_LABEL[f.statut]}
                        </Badge>
                      </td>
                      <td className="text-ink-3">{f.courrierGenereAt ? formatDateLongue(f.courrierGenereAt.slice(0, 10)) : "-"}</td>
                      <td className="text-ink-3">{f.soumisAt ? formatDateLongue(f.soumisAt.slice(0, 10)) : "-"}</td>
                      <td className="text-ink-3">{f.valideAt ? formatDateLongue(f.valideAt.slice(0, 10)) : "-"}</td>
                      <td className="text-ink-3">
                        {f.mailEnvoyeAt ? (
                          <span className="inline-flex items-center gap-1 text-ok-700">
                            <Mail strokeWidth={1.5} className="w-3 h-3" /> envoye
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </Card>
  );
}

function LigneAValider({ dossierRef, fiche }: { dossierRef: string; fiche: FicheOwnerVue }) {
  const [pending, startTransition] = useTransition();
  const [valide, setValide] = useState(false);
  const toast = useToast();
  const confirmer = useConfirm();
  const s = fiche.soumises;

  const valider = async () => {
    const ok = await confirmer({
      titre: "Valider cette fiche",
      message: `Ecrire l'email de "${fiche.nom}" dans eStale et envoyer le mail d'activation de l'extranet. Confirmer ?`,
      confirmer: "Valider",
      annuler: "Annuler",
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await validerFicheAction(dossierRef, fiche.ownerId);
      if (r.ok) {
        setValide(true);
        toast.ok(
          `${r.message}${r.mailEnvoye ? " Mail envoye." : r.mailNote ? ` ${r.mailNote}` : ""}`,
        );
      } else {
        toast.err(r.message);
      }
    });
  };

  return (
    <li className="rounded-md border border-line bg-surface p-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink flex items-center gap-1.5">
            <FileText strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-4" /> {fiche.nom}
          </p>
          <div className="mt-1.5 grid gap-x-4 gap-y-0.5 text-[12px] sm:grid-cols-2">
            <Comparaison label="Email" connu={fiche.emailConnu} saisi={s?.email} />
            <Comparaison label="Tel. portable" connu={fiche.connues?.telPortable} saisi={s?.telPortable} />
            <Comparaison label="Tel. fixe" connu={fiche.connues?.telFixe} saisi={s?.telFixe} />
            <Comparaison
              label="Occupation"
              saisi={
                s?.occupation === "principale"
                  ? "Residence principale"
                  : s?.occupation === "secondaire"
                    ? "Residence secondaire"
                    : s?.occupation === "loue"
                      ? "Loue / occupe"
                      : undefined
              }
            />
          </div>
        </div>
        <Button type="button" variant="primary" onClick={valider} disabled={pending || valide}>
          <CheckCircle2 strokeWidth={1.5} /> {valide ? "Validee" : pending ? "..." : "Valider"}
        </Button>
      </div>
    </li>
  );
}

function Comparaison({ label, connu, saisi }: { label: string; connu?: string; saisi?: string }) {
  const change = connu !== undefined && saisi !== undefined && connu.trim() !== saisi.trim();
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-ink-4 shrink-0">{label} :</span>
      {saisi ? (
        <span className={change ? "text-green-700 font-medium" : "text-ink-2"}>
          {saisi}
          {change && connu ? <span className="text-ink-4"> (etait : {connu})</span> : null}
        </span>
      ) : (
        <span className="text-ink-4">{connu ?? "-"}</span>
      )}
    </div>
  );
}
