import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getOdj } from "@/lib/services/odj/get-odj";
import { getGestionnaireCourant } from "@/lib/auth/session";
import type { ChampOdj } from "@/lib/domain/odj";
import { BoutonImprimer } from "@/components/odj/bouton-imprimer";

export const metadata: Metadata = { title: "ODJ (impression) - REAL31 Intranet" };
export const dynamic = "force-dynamic";

// Vue document de l'ODJ : mise en page sobre pensee pour l'impression (PDF via le
// navigateur). Les champs vides sortent en pointilles, a completer a la main ou
// apres branchement eStale. Seuls les points legaux NON retires sont inclus.

function valeurDe(champs: ChampOdj[], id: string): string | undefined {
  return champs.find((c) => c.id === id)?.valeur;
}

function Valeur({ v }: { v?: string }) {
  if (v) return <span className="font-medium">{v}</span>;
  return <span className="text-neutral-400">..................................................</span>;
}

function LigneDoc({ libelle, valeur }: { libelle: string; valeur?: string }) {
  return (
    <p className="text-[12.5px] leading-relaxed">
      {libelle} : <Valeur v={valeur} />
    </p>
  );
}

export default async function OdjImprimerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const odj = await getOdj(id, g.id);
  if (!odj) notFound();

  const points = odj.pointsLegaux.filter((p) => p.applicable);

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      {/* Barre d'actions, masquee a l'impression */}
      <div className="print:hidden border-b border-neutral-200 bg-neutral-50">
        <div className="mx-auto max-w-[800px] px-6 py-3 flex items-center justify-between">
          <Link
            href={`/odj/${id}`}
            className="inline-flex items-center gap-1.5 text-[13px] text-neutral-600 hover:text-neutral-900"
          >
            <ArrowLeft strokeWidth={1.5} className="w-3.5 h-3.5" />
            Retour a l&apos;edition
          </Link>
          <BoutonImprimer />
        </div>
      </div>

      <div className="mx-auto max-w-[800px] px-6 py-10 print:px-0 print:py-0">
        {/* En-tete document */}
        <header className="mb-6">
          <p className="text-[11px] uppercase tracking-[0.1em] text-neutral-500">
            REAL 31 - Préparation d&apos;assemblée générale
          </p>
          <h1 className="text-[20px] font-semibold mt-1">
            {odj.copro.nom} ({odj.copro.code})
          </h1>
          <p className="text-[12.5px] text-neutral-600">{odj.copro.adresse}</p>
        </header>

        <section className="mb-6">
          <LigneDoc libelle="Conseil syndical du" valeur={valeurDe(odj.enTete, "date-cs")} />
          <LigneDoc libelle="En présence de" valeur={valeurDe(odj.enTete, "presents")} />
          <LigneDoc libelle="L'assemblée générale est fixée au" valeur={valeurDe(odj.enTete, "date-ag")} />
          <LigneDoc libelle="Lieu de l'AG" valeur={valeurDe(odj.enTete, "lieu")} />
          <LigneDoc libelle="Modalité" valeur={valeurDe(odj.enTete, "modalite")} />
          <LigneDoc
            libelle="Les copropriétaires pourront ajouter des points à l'ordre du jour jusqu'au"
            valeur={valeurDe(odj.enTete, "limite-odj")}
          />
          <LigneDoc
            libelle="La convocation sera mise sous pli le"
            valeur={valeurDe(odj.enTete, "mise-sous-pli")}
          />
        </section>

        {odj.sections.map((s) => (
          <section key={s.id} className="mb-6 break-inside-avoid-page">
            <h2 className="text-[14px] font-semibold border-b border-neutral-300 pb-1 mb-2">
              {s.titre}
            </h2>
            {s.champs.map((c) => (
              <LigneDoc key={c.id} libelle={c.libelle} valeur={c.valeur} />
            ))}
          </section>
        ))}

        <section className="mb-6">
          <h2 className="text-[14px] font-semibold border-b border-neutral-300 pb-1 mb-2">
            Points réglementaires à l&apos;ordre du jour
          </h2>
          {points.map((p) => (
            <div key={p.id} className="mb-3 break-inside-avoid-page">
              <p className="text-[12.5px] font-medium">{p.titre}</p>
              <p className="text-[12px] text-neutral-700 leading-relaxed">{p.texte}</p>
            </div>
          ))}
        </section>

        <footer className="mt-10">
          <p className="text-[12.5px]">
            Fin de réunion : <span className="text-neutral-400">....................</span>
          </p>
        </footer>
      </div>
    </div>
  );
}
