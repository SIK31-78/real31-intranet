import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { getClesRepository } from "@/lib/adapters/router";
import { LIBELLE_TYPE_ACCES, LIBELLE_TYPE_ELEMENT } from "@/lib/domain/cles/types";
import { formatDateLongue } from "@/lib/format-date";
import { coprosPourCles } from "@/lib/services/cles/copros-choix";
import { getCoproRepository } from "@/lib/adapters/router";
import { BoutonImprimer } from "@/components/odj/bouton-imprimer";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Attestation de remise de clés - REAL31 Intranet" };
export const dynamic = "force-dynamic";

// L'attestation de remise (ou de restitution) d'un trousseau : page imprimable (ADR-012),
// signee au comptoir par la personne qui emporte les cles. Sans etat, partageable par URL.

export default async function AttestationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const repo = getClesRepository();
  const pret = await repo.getPret(id);
  if (!pret) notFound();
  const [trousseau, copros] = await Promise.all([repo.getTrousseau(pret.trousseauId), coprosPourCles()]);
  if (!trousseau) notFound();
  const parCode = new Map(copros.map((c) => [c.code, c]));
  const premiereCopro = trousseau.acces.find((a) => a.bien.type === "copro")?.bien;
  const copro = premiereCopro && premiereCopro.type === "copro" ? await getCoproRepository().findByCode(premiereCopro.code).catch(() => null) : null;
  const gestionnaire = copro?.equipe.find((m) => m.role === "gestionnaire")?.nomComplet;
  const heure = (iso: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const restitue = Boolean(pret.renduLeISO);

  return (
    <div className="min-h-screen bg-surface text-ink">
      <div className="mx-auto max-w-[800px] px-6 py-6 flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3 print:hidden">
          <ButtonLink href={`/cles/trousseaux/${trousseau.id}`} variant="secondary" size="sm"><ArrowLeft strokeWidth={1.5} /> Trousseau {trousseau.numero}</ButtonLink>
          <BoutonImprimer />
        </div>

        <header className="flex flex-col gap-1 border-b border-line pb-4">
          <p className="text-meta uppercase tracking-[0.06em] text-ink-2">REAL31 · Agence {trousseau.agenceCode} · Gestion des clés{gestionnaire ? ` · Gestionnaire : ${gestionnaire}` : ""}</p>
          <h1 className="text-page font-semibold">{restitue ? "Attestation de restitution de clés" : "Attestation de remise de clés"}</h1>
        </header>

        <section className="flex flex-col gap-2 text-body">
          <p>
            Le {formatDateLongue(pret.sortiLeISO.slice(0, 10))} à {heure(pret.sortiLeISO)}, l&apos;agence REAL31 {trousseau.agenceCode} a remis le trousseau <strong className="font-mono">{trousseau.numero}</strong>{trousseau.libelle ? ` (${trousseau.libelle})` : ""} à :
          </p>
          <div className="rounded-lg border border-line p-4 flex flex-col gap-1">
            <p className="font-medium text-title">{pret.type === "interne" ? "Usage interne REAL31" : pret.type === "coproprietaire" ? `${pret.contact?.nom ?? "Copropriétaire"}, copropriétaire ou membre du conseil syndical` : pret.entrepriseNom ?? "Entreprise non renseignée"}</p>
            {pret.type !== "coproprietaire" && pret.contact?.nom && <p>Représentée par : {pret.contact.nom}{pret.contact.telephone ? ` · ${pret.contact.telephone}` : ""}{pret.contact.email ? ` · ${pret.contact.email}` : ""}</p>}
            {pret.motif && <p>Intervention : {pret.motif}</p>}
            <p>Retour prévu le <strong>{formatDateLongue(pret.retourPrevuLeISO)}</strong>.</p>
          </div>
        </section>

        <section className="flex flex-col gap-2 text-body">
          <h2 className="text-title font-semibold">Ce que le trousseau ouvre</h2>
          <ul className="list-disc pl-5">
            {trousseau.acces.map((a) => {
              const c = a.bien.type === "copro" ? parCode.get(a.bien.code) : undefined;
              return <li key={a.id}>{a.bien.type === "copro" ? `${a.bien.code} · ${c?.nom ?? ""} · ${c?.adresse ?? ""}` : a.bien.ref}{a.immeuble ? ` · ${a.immeuble}` : ""}{a.types.length > 0 ? ` : ${a.types.map((t) => LIBELLE_TYPE_ACCES[t]).join(", ")}` : ""}{a.libelle ? ` (${a.libelle})` : ""}</li>;
            })}
          </ul>
          <h2 className="text-title font-semibold mt-2">Composition remise</h2>
          {pret.composition.length === 0 ? <p className="text-ink-2">Composition non détaillée.</p> : (
            <ul className="list-disc pl-5">{pret.composition.map((e, i) => <li key={i}>{e.quantite} {LIBELLE_TYPE_ELEMENT[e.type]}{e.quantite > 1 ? "s" : ""}{e.libelle ? ` (${e.libelle})` : ""}</li>)}</ul>
          )}
        </section>

        {restitue && (
          <section className="flex flex-col gap-2 text-body">
            <h2 className="text-title font-semibold">Restitution</h2>
            <p>Rendu le {formatDateLongue(pret.renduLeISO!.slice(0, 10))} à {heure(pret.renduLeISO!)}, reçu par {pret.recuParNom ?? "l'agence"}. État : {pret.retourConforme === "incomplet" ? "incomplet" : pret.retourConforme === "endommage" ? "endommagé" : "complet"}.{pret.commentaireRetour ? ` ${pret.commentaireRetour}` : ""}</p>
          </section>
        )}

        <section className="text-body text-ink-2">
          <p>Le bénéficiaire s&apos;engage à conserver le trousseau sous sa responsabilité, à ne pas le reproduire et à le restituer à l&apos;agence à la date prévue. Toute perte ou dégradation doit être signalée sans délai.</p>
        </section>

        <section className="grid grid-cols-2 gap-8 pt-6 text-body">
          <div className="flex flex-col gap-10">
            <p>Pour l&apos;agence : <strong>{restitue ? pret.recuParNom ?? pret.sortiParNom : pret.sortiParNom}</strong></p>
            <p className="border-t border-line pt-1 text-meta text-ink-2">Signature</p>
          </div>
          <div className="flex flex-col gap-10">
            <p>Pour {pret.type === "interne" ? "l'utilisateur" : pret.type === "coproprietaire" ? "le copropriétaire" : pret.entrepriseNom ?? "l'entreprise"} : <strong>{pret.contact?.nom ?? " "}</strong></p>
            <p className="border-t border-line pt-1 text-meta text-ink-2">Signature, précédée de « reçu le … »</p>
          </div>
        </section>
      </div>
    </div>
  );
}
