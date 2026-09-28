"use client";

// Historique des facturations : ce qui est parti, ce qui a echoue, et de quoi
// rejouer un echec. Remplace l'ancienne file d'attente, devenue sans objet
// depuis que l'emission est enchainee a la confirmation.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, CheckCircle2, TriangleAlert, Clock, Search } from "lucide-react";
import { Card, CardFooter } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { rejouerFactureAction } from "@/app/facturation/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/segmented";
import {
  filtrerHistorique,
  PERIODES_HISTORIQUE,
  type PeriodeHistorique,
} from "@/lib/domain/facturation/filtre-historique";

import { formatEuros } from "@/lib/domain/format-montant";
/** Ce qu'on vient d'emettre tient en quelques lignes : on montre les 5 dernieres, le
 *  reste se deplie a la demande. Au-dela, l'historique noyait le formulaire. */
const CAP_AFFICHAGE = 5;

export interface FactureAffichee {
  id: string;
  coproCode: string;
  /** Nom de la copro, pour la recherche (absent si hors portefeuille connu). */
  coproNom?: string;
  typePrestation: string;
  libelle: string;
  dateFacture: string;
  statut: "a_facturer" | "facturee" | "erreur";
  montantHt: number;
  factureExterneId?: string;
  erreur?: string;
  par?: string;
  /** Horodatage ISO de creation (affiche date + heure). */
  creeLe: string;
}

const LIBELLE_TYPE: Record<string, string> = {
  depassement_cs: "Dépassement CS",
  depassement_ag: "Dépassement AG",
  suivi_travaux: "Suivi de travaux",
  suivi_sinistre: "Suivi de sinistre",
  pre_etat_date: "Pré-état daté",
  etat_date: "État daté",
  gestion_courante: "Gestion courante",
  prestation_contrat: "Prestation du contrat",
};

const euros = formatEuros;
/** Date + heure locale de creation, ex "20/07/2026 a 16:35". */
function quand(iso: string): string {
  const d = new Date(iso);
  const deuxChiffres = (n: number) => String(n).padStart(2, "0");
  return `${deuxChiffres(d.getDate())}/${deuxChiffres(d.getMonth() + 1)}/${d.getFullYear()} à ${deuxChiffres(d.getHours())}:${deuxChiffres(d.getMinutes())}`;
}

function Statut({ statut }: { statut: FactureAffichee["statut"] }) {
  if (statut === "facturee") {
    return (
      <span className="inline-flex items-center gap-1 text-body text-green-700">
        <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} /> Envoyée
      </span>
    );
  }
  if (statut === "erreur") {
    return (
      <span className="inline-flex items-center gap-1 text-body text-err-700">
        <TriangleAlert className="w-3.5 h-3.5" strokeWidth={1.5} /> Échec
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-body text-ink-3">
      <Clock className="w-3.5 h-3.5" strokeWidth={1.5} /> En attente
    </span>
  );
}

/** Ce sur quoi porte la barre de recherche. */
function corpus(f: FactureAffichee): string {
  return [f.coproCode, f.coproNom, LIBELLE_TYPE[f.typePrestation] ?? f.typePrestation, f.par, f.libelle]
    .filter(Boolean)
    .join(" ");
}

export function HistoriqueFacturations({
  factures,
  tronque = false,
}: {
  factures: FactureAffichee[];
  /** true = la page a atteint sa limite de lecture : la recherche ne voit pas les plus anciennes. */
  tronque?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [enCours, setEnCours] = useState<string | null>(null);
  const [deplie, setDeplie] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [periode, setPeriode] = useState<PeriodeHistorique>("tout");

  const filtreActif = recherche.trim() !== "" || periode !== "tout";
  const filtrees = useMemo(
    () => filtrerHistorique(factures, corpus, { recherche, periode }, new Date()),
    [factures, recherche, periode],
  );
  // Un filtre actif montre tous ses resultats : on a cherche, on ne replie pas la reponse.
  const affichees = deplie || filtreActif ? filtrees : filtrees.slice(0, CAP_AFFICHAGE);
  const reste = filtrees.length - affichees.length;

  function rejouer(id: string) {
    setEnCours(id);
    demarrer(async () => {
      const res = await rejouerFactureAction(id);
      setEnCours(null);
      if (!res.ok) return toast.err(res.erreur);
      const r = res.donnees;
      if (r && r.enErreur > 0) toast.err(r.erreurs[0]?.message ?? "Échec de l'envoi.");
      else toast.ok("Facture renvoyée.");
      router.refresh();
    });
  }

  return (
    <Card>
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-body font-semibold text-ink">
          Historique des facturations{" "}
          <span className="font-normal text-ink-3">
            ({filtreActif ? `${filtrees.length} sur ${factures.length}` : factures.length})
          </span>
        </h2>
      </div>

      {factures.length > 0 && (
        <div className="flex flex-col gap-1.5 border-b border-line px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-52 flex-1">
              <Search
                strokeWidth={1.5}
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
                aria-hidden
              />
              <Input
                type="search"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Rechercher (copropriété, type, auteur, libellé)…"
                aria-label="Rechercher dans l'historique des facturations"
                className="pl-8"
              />
            </div>
            <SegmentedControl
              label="Période"
              size="sm"
              options={PERIODES_HISTORIQUE}
              value={periode}
              onChange={(v) => setPeriode(v ?? "tout")}
            />
          </div>
          {tronque && (
            <p className="text-meta text-ink-3">
              Recherche limitée aux {factures.length} facturations les plus récentes.
            </p>
          )}
        </div>
      )}

      {factures.length === 0 ? (
        <p className="px-4 py-8 text-center text-body text-ink-3">
          Aucune facturation pour l&apos;instant.
        </p>
      ) : filtrees.length === 0 ? (
        <p className="px-4 py-8 text-center text-body text-ink-3">
          Aucune facturation ne correspond à cette recherche.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {affichees.map((f) => (
              <li key={f.id} className="px-4 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-body text-ink">
                      <span className="font-medium">{f.coproCode}</span>
                      <span className="text-ink-3"> · </span>
                      {LIBELLE_TYPE[f.typePrestation] ?? f.typePrestation}
                    </p>
                    <p className="truncate text-body text-ink-3">
                      {quand(f.creeLe)}
                      {f.par ? ` · ${f.par}` : ""}
                      {f.factureExterneId ? ` · Pennylane ${f.factureExterneId}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-body font-medium text-ink">{euros(f.montantHt)} HT</span>
                    <Statut statut={f.statut} />
                    {f.statut === "erreur" && (
                      <Button
                        onClick={() => rejouer(f.id)}
                        disabled={pending}
                        title="Renvoyer vers Pennylane"
                        variant="secondary"
                      >
                        {pending && enCours === f.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
                        )}
                        Réessayer
                      </Button>
                    )}
                  </div>
                </div>
                {f.statut === "erreur" && f.erreur && (
                  <p className="mt-1 rounded-sm bg-err-50 px-2 py-1 text-meta leading-snug text-err-700">
                    {f.erreur.slice(0, 300)}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {reste > 0 && (
            <CardFooter>
              <Button variant="ghost" size="sm" onClick={() => setDeplie(true)}>
                Afficher plus
              </Button>
            </CardFooter>
          )}
        </>
      )}
    </Card>
  );
}
