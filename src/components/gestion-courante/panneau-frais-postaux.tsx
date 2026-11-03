"use client";

// Onglet « Frais postaux » de la gestion courante (REA-490).
//
// Pour une facture ESTALE (un mois), les envois de chaque copro au réel. La comptable
// coche ce qu'elle refacture (tout est coché d'office), décide du service ESTALE (décoché
// d'office : sa refacturation n'est pas tranchée), puis facture : facture Pennylane avec
// « *** », déposée dans ESTALE en bon à payer. Une copro déjà facturée pour cette facture
// ESTALE est grisée : le serveur refuserait de toute façon de la refacturer.

import { useEffect, useMemo, useState, useTransition } from "react";
import { CheckCircle2, Loader2, Mail, Send, TriangleAlert } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { useConfirm } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/field";
import { SkeletonTable } from "@/components/ui/skeleton";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { formatEuros } from "@/lib/domain/format-montant";
import {
  libelleAffranchissement,
  lignesFactureFraisPostaux,
  type FraisPostauxCopro,
} from "@/lib/domain/facturation/frais-postaux-reels";
import { messageEmissionFacture, type ModeEmissionFacture } from "@/lib/domain/facturation/mode-emission";
import type { ApercuFraisPostaux } from "@/lib/services/facturation/frais-postaux-reels";
import { apercuFraisPostauxAction, facturerFraisPostauxAction } from "@/app/gestion-courante/actions";

const euros = (centimes: number) => formatEuros(centimes / 100);

const MOIS = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
/** "2026-10-01" -> « octobre 2026 » : la facture ESTALE porte le mois consommé. */
function moisDe(dateISO: string): string {
  return MOIS.format(new Date(`${dateISO}T00:00:00Z`));
}
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function dateCourte(dateISO: string): string {
  const [a, m, j] = dateISO.split("-");
  return a && m && j ? `${j}/${m}/${a}` : "";
}

type Selection = Map<string, Set<string>>;

/** Tout coché, sauf les copros déjà facturées pour cette facture ESTALE. */
function selectionParDefaut(a: ApercuFraisPostaux): Selection {
  const deja = new Set(a.dejaFacturees.map((d) => d.coproCode));
  return new Map(
    a.periode.parCopro.filter((c) => !deja.has(c.coproCode)).map((c) => [c.coproCode, new Set(c.envois.map((e) => e.sourceId))]),
  );
}

/** HT à facturer pour une copro, calculé comme le serveur le fera. */
function totalHt(copro: FraisPostauxCopro, retenus: Set<string> | undefined, avecService: boolean, mois: string): number {
  if (!retenus || retenus.size === 0) return 0;
  return lignesFactureFraisPostaux(copro, retenus, avecService, mois).reduce((s, l) => s + l.prixUnitaireHtCentimes, 0);
}

function CarteCopro({
  copro,
  retenus,
  dejaLe,
  avecService,
  mois,
  basculer,
}: {
  copro: FraisPostauxCopro;
  retenus: Set<string> | undefined;
  /** Date de la facture intranet déjà émise pour cette facture ESTALE, sinon null. */
  dejaLe: string | null;
  avecService: boolean;
  mois: string;
  basculer: (sourceId: string | null) => void;
}) {
  const lre = copro.envois.some((e) => e.lreHtCentimes > 0);
  const toutCoche = !!retenus && retenus.size === copro.envois.length;
  const partiel = !!retenus && retenus.size > 0 && !toutCoche;
  const aFacturer = totalHt(copro, retenus, avecService, mois);
  return (
    <Card className={dejaLe ? "opacity-70" : undefined}>
      <CardHeader>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-green-700"
            checked={toutCoche}
            // Quelques envois seulement : case « en partie » (tiret), pas vide.
            ref={(el) => {
              if (el) el.indeterminate = partiel;
            }}
            disabled={!!dejaLe}
            onChange={() => basculer(null)}
            aria-label={`Facturer ${copro.coproCode}`}
          />
          <CardTitle>{copro.coproCode}</CardTitle>
        </label>
        {dejaLe ? (
          <Badge ton="ok">
            <CheckCircle2 className="h-3 w-3" strokeWidth={1.5} /> Facturée le {dateCourte(dejaLe)}
          </Badge>
        ) : (
          <span className="ml-auto text-body text-ink-2">
            À facturer : <strong className="font-medium text-ink tabular-nums">{euros(aFacturer)} HT</strong>
          </span>
        )}
      </CardHeader>
      <Table dense encadre={false} className="table-fixed">
        <colgroup>
          <col className="w-9" />
          <col className="w-24" />
          <col />
          <col className="w-44" />
          <col className="w-14" />
          <col className="w-24" />
          <col className="w-24" />
          <col className="w-24" />
        </colgroup>
        <Thead>
          <Tr>
            <Th />
            <Th>Date</Th>
            <Th>Envoi</Th>
            <Th>Affranchissement</Th>
            <Th numeric>Plis</Th>
            <Th numeric>Timbres</Th>
            <Th numeric>LRE HT</Th>
            <Th numeric>Service HT</Th>
          </Tr>
        </Thead>
        <Tbody>
          {copro.envois.map((e) => (
            <Tr key={e.sourceId}>
              <Td>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-green-700"
                  checked={!!retenus?.has(e.sourceId)}
                  disabled={!!dejaLe}
                  onChange={() => basculer(e.sourceId)}
                  aria-label={`Refacturer ${e.libelle}`}
                />
              </Td>
              <Td className="whitespace-nowrap">{dateCourte(e.dateISO)}</Td>
              <Td principal>
                {e.libelle}
                <span className="block text-meta font-normal text-ink-3">{e.scope}</span>
              </Td>
              <Td secondaire>
                {e.affranchissements.map((a) => `${a.plis} ${libelleAffranchissement(a.categorie)}`).join(", ")}
              </Td>
              <Td numeric>{e.plis}</Td>
              <Td numeric>{euros(e.timbresHtCentimes)}</Td>
              <Td numeric>{lre && e.lreHtCentimes ? euros(e.lreHtCentimes) : ""}</Td>
              <Td numeric secondaire>{euros(e.serviceHtCentimes)}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </Card>
  );
}

export function PanneauFraisPostaux({ pennylaneMode }: { pennylaneMode: ModeEmissionFacture }) {
  const [apercu, setApercu] = useState<ApercuFraisPostaux | null>(null);
  const [selection, setSelection] = useState<Selection>(new Map());
  const [avecService, setAvecService] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, demarrer] = useTransition();
  const [facturation, demarrerFacturation] = useTransition();
  const confirmer = useConfirm();
  const toast = useToast();

  function afficher(a: ApercuFraisPostaux | null) {
    setApercu(a);
    setSelection(a ? selectionParDefaut(a) : new Map());
  }

  function charger(reference?: string) {
    setErreur(null);
    demarrer(async () => {
      const res = await apercuFraisPostauxAction(reference);
      if (res.ok) afficher(res.donnees ?? null);
      else setErreur(res.erreur);
    });
  }

  // Premier affichage de l'onglet : la facture ESTALE la plus récente.
  useEffect(() => {
    let actif = true;
    void apercuFraisPostauxAction().then((res) => {
      if (!actif) return;
      if (res.ok) afficher(res.donnees ?? null);
      else setErreur(res.erreur);
    });
    return () => {
      actif = false;
    };
  }, []);

  const facture = apercu?.factures.find((f) => f.reference === apercu.reference) ?? null;
  const mois = facture ? moisDe(facture.dateISO) : "";
  const dejaLe = useMemo(
    () => new Map((apercu?.dejaFacturees ?? []).map((d) => [d.coproCode, d.dateFacture])),
    [apercu],
  );
  const choisies = (apercu?.periode.parCopro ?? []).filter(
    (c) => !dejaLe.has(c.coproCode) && (selection.get(c.coproCode)?.size ?? 0) > 0,
  );
  const total = choisies.reduce((s, c) => s + totalHt(c, selection.get(c.coproCode), avecService, mois), 0);

  function basculer(coproCode: string, sourceId: string | null) {
    const copro = apercu?.periode.parCopro.find((c) => c.coproCode === coproCode);
    if (!copro) return;
    setSelection((avant) => {
      const apres = new Map(avant);
      const actuels = new Set(avant.get(coproCode) ?? []);
      if (sourceId === null) {
        // Case de la copro : tout cocher, ou tout décocher si tout l'était.
        const toutCoche = actuels.size === copro.envois.length;
        apres.set(coproCode, toutCoche ? new Set() : new Set(copro.envois.map((e) => e.sourceId)));
      } else {
        if (actuels.has(sourceId)) actuels.delete(sourceId);
        else actuels.add(sourceId);
        apres.set(coproCode, actuels);
      }
      return apres;
    });
  }

  async function facturer() {
    if (!apercu?.reference || choisies.length === 0) return;
    const mode = messageEmissionFacture(pennylaneMode);
    const ok = await confirmer({
      titre: `Facturer les frais postaux de ${mois}`,
      message:
        `${choisies.length} facture${choisies.length > 1 ? "s" : ""} (${choisies.map((c) => c.coproCode).join(", ")}), ` +
        `${euros(total)} HT au total, ${avecService ? "service ESTALE compris" : "sans le service ESTALE"}. ` +
        "Elles partent dans Pennylane puis dans ESTALE en bon à payer.",
      confirmer: "Facturer",
      ...(mode ? { avertissement: mode } : {}),
    });
    if (!ok) return;
    const reference = apercu.reference;
    const selections = choisies.map((c) => ({ coproCode: c.coproCode, sourceIds: [...(selection.get(c.coproCode) ?? [])] }));
    demarrerFacturation(async () => {
      const res = await facturerFraisPostauxAction(reference, selections, avecService);
      if (!res.ok) {
        toast.err(res.erreur);
        return;
      }
      const r = res.donnees;
      if (r && (r.enErreur > 0 || r.estale.enErreur > 0)) {
        const premiere = r.erreurs[0]?.message ?? r.estale.erreurs[0]?.message ?? "";
        toast.err(`${r.emises} facture(s) émise(s), ${r.enErreur + r.estale.enErreur} en erreur. ${premiere}`);
      } else if (r) {
        const attente = r.estale.enAttente > 0 ? `, ${r.estale.enAttente} à valider dans Pennylane avant ESTALE` : "";
        toast.ok(`${r.emises} facture(s) émise(s)${attente}.`);
      }
      charger(reference);
    });
  }

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
          disabled={pending || facturation || !apercu || apercu.factures.length === 0}
          onChange={(ev) => charger(ev.target.value)}
        >
          {(apercu?.factures ?? []).map((f) => (
            <option key={f.reference} value={f.reference}>
              {majuscule(moisDe(f.dateISO))} · {f.reference} · {formatEuros(f.montantTtc)} TTC
            </option>
          ))}
        </Select>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-ink-3" aria-label="Chargement" />}
        <label className="ml-auto flex items-center gap-2 text-body text-ink-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-green-700"
            checked={avecService}
            onChange={(ev) => setAvecService(ev.target.checked)}
          />
          Facturer le service ESTALE (TVA 20 %)
        </label>
      </div>

      <Callout ton="info">
        Les envois de chaque copropriété au réel, tels qu&apos;ESTALE les facture à REAL31 ce mois-là. Décochez ce qui
        ne se refacture pas (une mise en demeure, par exemple, a ses frais d&apos;envoi compris). Le service ESTALE
        (impression, mise sous pli) n&apos;est facturé que si la case est cochée.
      </Callout>

      {erreur && <Callout ton="err">{erreur}</Callout>}

      {!apercu && !erreur && <SkeletonTable lignes={4} colonnes={6} />}

      {apercu && apercu.reference === null && (
        <EmptyState icone={Mail}>Aucune facture ESTALE pour l&apos;agence.</EmptyState>
      )}

      {apercu && apercu.reference !== null && apercu.periode.parCopro.length === 0 && (
        <EmptyState icone={Mail}>Aucun envoi d&apos;une copropriété au réel sur cette facture.</EmptyState>
      )}

      {apercu?.periode.parCopro.map((c) => (
        <CarteCopro
          key={c.coproCode}
          copro={c}
          retenus={selection.get(c.coproCode)}
          dejaLe={dejaLe.get(c.coproCode) ?? null}
          avecService={avecService}
          mois={mois}
          basculer={(sourceId) => basculer(c.coproCode, sourceId)}
        />
      ))}

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
        <p className="text-body text-ink-3">Au réel, sans envoi sur cette facture : {sansEnvoi.join(", ")}.</p>
      )}

      {apercu && apercu.periode.parCopro.length > 0 && (
        // Bouton a gauche : a droite, la bulle « Un bug / une idée » le recouvrait.
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Button variant="primary" onClick={facturer} disabled={facturation || pending || choisies.length === 0}>
            {facturation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" strokeWidth={1.5} />}
            Facturer {choisies.length > 0 ? `${choisies.length} copropriété${choisies.length > 1 ? "s" : ""}` : ""}
          </Button>
          <span className="text-body text-ink-2">
            <strong className="font-medium text-ink tabular-nums">{euros(total)} HT</strong>
            {avecService ? ", service ESTALE compris" : ", sans le service ESTALE"}
          </span>
          {messageEmissionFacture(pennylaneMode) && (
            <span className="text-body text-ink-3">{messageEmissionFacture(pennylaneMode)}</span>
          )}
        </div>
      )}
    </div>
  );
}
