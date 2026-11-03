"use client";

// Onglet « Frais postaux » de la gestion courante (REA-490), premier incrément : LIRE.
// Pour une facture ESTALE (un mois), les envois de chaque copro au réel, timbres, LRE et
// service à part. Rien n'est émis d'ici : la comptable compare avec ses factures, et la
// refacturation du service attend sa réponse.

import { useEffect, useState, useTransition } from "react";
import { Loader2, Mail, TriangleAlert } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/field";
import { SkeletonTable } from "@/components/ui/skeleton";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { formatEuros } from "@/lib/domain/format-montant";
import type { FraisPostauxCopro } from "@/lib/domain/facturation/frais-postaux-reels";
import type { ApercuFraisPostaux } from "@/lib/services/facturation/frais-postaux-reels";
import { apercuFraisPostauxAction } from "@/app/gestion-courante/actions";

const euros = (centimes: number) => formatEuros(centimes / 100);

const MOIS = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
/** "2026-10-01" -> « Octobre 2026 » : la facture ESTALE porte le mois consommé. */
function moisDe(dateISO: string): string {
  const m = MOIS.format(new Date(`${dateISO}T00:00:00Z`));
  return m.charAt(0).toUpperCase() + m.slice(1);
}

function dateCourte(dateISO: string): string {
  const [a, m, j] = dateISO.split("-");
  return a && m && j ? `${j}/${m}/${a}` : "";
}

function TableCopro({ copro }: { copro: FraisPostauxCopro }) {
  const lre = copro.envois.some((e) => e.lreHtCentimes > 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{copro.coproCode}</CardTitle>
        <span className="ml-auto text-body text-ink-2">
          Timbres{lre ? " et LRE" : ""} : <strong className="font-medium text-ink tabular-nums">{euros(copro.timbresEtLreHtCentimes)}</strong>
          <span className="text-ink-3"> · service {euros(copro.serviceHtCentimes)} HT</span>
        </span>
      </CardHeader>
      <Table dense encadre={false}>
        <Thead>
          <Tr>
            <Th>Date</Th>
            <Th>Envoi</Th>
            <Th>Affranchissement</Th>
            <Th numeric>Plis</Th>
            <Th numeric>Timbres</Th>
            {lre && <Th numeric>LRE HT</Th>}
            <Th numeric>Service HT</Th>
          </Tr>
        </Thead>
        <Tbody>
          {copro.envois.map((e) => (
            <Tr key={e.sourceId}>
              <Td className="whitespace-nowrap">{dateCourte(e.dateISO)}</Td>
              <Td principal>
                {e.libelle}
                <span className="block text-meta text-ink-3">{e.scope}</span>
              </Td>
              <Td secondaire>{e.categories.join(", ")}</Td>
              <Td numeric>{e.plis}</Td>
              <Td numeric>{euros(e.timbresHtCentimes)}</Td>
              {lre && <Td numeric>{e.lreHtCentimes ? euros(e.lreHtCentimes) : ""}</Td>}
              <Td numeric secondaire>{euros(e.serviceHtCentimes)}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </Card>
  );
}

export function PanneauFraisPostaux() {
  const [apercu, setApercu] = useState<ApercuFraisPostaux | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, demarrer] = useTransition();

  function charger(reference?: string) {
    setErreur(null);
    demarrer(async () => {
      const res = await apercuFraisPostauxAction(reference);
      if (res.ok) setApercu(res.donnees ?? null);
      else setErreur(res.erreur);
    });
  }

  // Premier affichage de l'onglet : la facture ESTALE la plus récente.
  useEffect(() => {
    let actif = true;
    void apercuFraisPostauxAction().then((res) => {
      if (!actif) return;
      if (res.ok) setApercu(res.donnees ?? null);
      else setErreur(res.erreur);
    });
    return () => {
      actif = false;
    };
  }, []);

  const sansEnvoi = apercu
    ? apercu.coprosAuReel.filter((c) => !apercu.periode.parCopro.some((p) => p.coproCode === c))
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="facture-estale" className="text-body text-ink-2">
          Facture ESTALE
        </label>
        <Select
          id="facture-estale"
          largeur="auto"
          value={apercu?.reference ?? ""}
          disabled={pending || !apercu || apercu.factures.length === 0}
          onChange={(ev) => charger(ev.target.value)}
        >
          {(apercu?.factures ?? []).map((f) => (
            <option key={f.reference} value={f.reference}>
              {moisDe(f.dateISO)} · {f.reference} · {formatEuros(f.montantTtc)} TTC
            </option>
          ))}
        </Select>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-ink-3" aria-label="Chargement" />}
      </div>

      <Callout ton="info" titre="Lecture seule">
        Les envois de chaque copropriété au réel, tels qu&apos;ESTALE les facture à REAL31 ce mois-là. Timbres et
        LRE correspondent à ce qui a été refacturé le 23/10 ; le service ESTALE (impression, mise sous pli) est
        montré à part, sa refacturation n&apos;est pas tranchée. Rien n&apos;est émis depuis cet onglet.
      </Callout>

      {erreur && <Callout ton="err">{erreur}</Callout>}

      {!apercu && !erreur && <SkeletonTable lignes={4} colonnes={6} />}

      {apercu && apercu.reference === null && (
        <EmptyState icone={Mail}>Aucune facture ESTALE pour l&apos;agence.</EmptyState>
      )}

      {apercu && apercu.reference !== null && apercu.periode.parCopro.length === 0 && (
        <EmptyState icone={Mail}>Aucun envoi d&apos;une copropriété au réel sur cette facture.</EmptyState>
      )}

      {apercu?.periode.parCopro.map((c) => <TableCopro key={c.coproCode} copro={c} />)}

      {apercu && apercu.periode.nonRattaches.length > 0 && (
        <Callout ton="warn" titre="Envois sans copropriété identifiée">
          <ul className="mt-1 space-y-0.5">
            {apercu.periode.nonRattaches.map((n) => (
              <li key={n.sourceId}>
                <TriangleAlert className="mr-1 inline h-3.5 w-3.5" strokeWidth={1.5} />
                {n.libelle} : {n.quantite} ligne{n.quantite > 1 ? "s" : ""}, {euros(n.montantTtcCentimes)} TTC
                {n.coprosPossibles.length > 1 && ` (envoi commun à ${n.coprosPossibles.join(" et ")})`}
              </li>
            ))}
          </ul>
        </Callout>
      )}

      {sansEnvoi.length > 0 && (
        <p className="text-body text-ink-3">
          Au réel, sans envoi sur cette facture : {sansEnvoi.join(", ")}.
        </p>
      )}
    </div>
  );
}
