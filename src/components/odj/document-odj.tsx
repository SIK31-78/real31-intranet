// Rendu "document" de l'ODJ (calque sur le modele REAL31), mise en forme soignee
// pour impression PDF. Partage entre la vue imprimable et l'apercu live de la page
// d'edition. Composant pur (props only). Accents verts = marque REAL31 (green-700).

import type { ChampOdj, Odj } from "@/lib/domain/odj";
import { formatChampValeur } from "@/lib/domain/odj";

function champDe(champs: ChampOdj[], id: string): ChampOdj | undefined {
  return champs.find((c) => c.id === id);
}
function valeurDe(champs: ChampOdj[], id: string): string | undefined {
  const c = champDe(champs, id);
  return c ? formatChampValeur(c) : undefined;
}

/** Valeur renseignee, ou un trait pointille a completer a la main. */
function Valeur({ v }: { v?: string }) {
  if (v) return <span className="font-medium text-neutral-900">{v}</span>;
  return (
    <span className="inline-block align-baseline min-w-[140px] border-b border-dotted border-neutral-400" />
  );
}

function Ligne({ libelle, valeur }: { libelle: string; valeur?: string }) {
  return (
    <p className="text-[12px] leading-[1.55] text-neutral-700">
      <span className="text-neutral-500">{libelle} : </span>
      <Valeur v={valeur} />
    </p>
  );
}

function TitreSection({ n, titre }: { n: number; titre: string }) {
  return (
    <h2 className="flex items-baseline gap-2 mb-2 pb-1 border-b border-neutral-300 break-after-avoid">
      <span className="text-green-700 font-bold text-[12.5px] tabular-nums">{n}.</span>
      <span className="text-[13px] font-semibold uppercase tracking-[0.04em] text-neutral-800">{titre}</span>
    </h2>
  );
}

export function DocumentOdj({ odj }: { odj: Odj }) {
  const points = odj.pointsLegaux.filter((p) => p.applicable);
  const visio = champDe(odj.enTete, "visio")?.valeur === "oui";

  return (
    <div className="text-neutral-900 [font-feature-settings:'tnum'] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
      {/* En-tete de marque */}
      <header className="flex items-start justify-between gap-6 pb-3 mb-5 border-b-2 border-green-700">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-green-700 text-white flex items-center justify-center font-mono text-[14px] font-bold shrink-0 [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
            R31
          </div>
          <div>
            <div className="text-[16px] font-bold tracking-tight text-green-900 leading-none">REAL 31</div>
            <div className="text-[9.5px] uppercase tracking-[0.12em] text-neutral-500 mt-0.5">
              Syndic de copropriété
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[14px] font-semibold text-neutral-800">Préparation d&apos;assemblée générale</div>
          <div className="text-[10px] text-neutral-500">Document issu du conseil syndical</div>
        </div>
      </header>

      {/* Copropriete */}
      <div className="mb-5">
        <h1 className="text-[19px] font-bold leading-tight">
          {odj.copro.nom} <span className="text-neutral-400 font-normal text-[14px]">({odj.copro.code})</span>
        </h1>
        <p className="text-[12px] text-neutral-600">{odj.copro.adresse}</p>
      </div>

      {/* Reunion : presents + dates */}
      <section className="mb-6 rounded-md bg-neutral-50 border border-neutral-200 px-4 py-3 [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
        <Ligne libelle="Conseil syndical du" valeur={valeurDe(odj.enTete, "date-cs")} />
        <Ligne libelle="Pour le syndic" valeur={valeurDe(odj.enTete, "presents-syndic")} />
        <Ligne libelle="Pour le conseil syndical" valeur={valeurDe(odj.enTete, "presents-cs")} />
        <div className="grid grid-cols-2 gap-x-8 mt-1.5 pt-1.5 border-t border-neutral-200">
          <Ligne libelle="Assemblée générale fixée au" valeur={valeurDe(odj.enTete, "date-ag")} />
          <Ligne libelle="Lieu" valeur={valeurDe(odj.enTete, "lieu")} />
          <p className="text-[12px] leading-[1.55] text-neutral-700">
            <span className="text-neutral-500">Modalité : </span>
            <span className="font-medium text-neutral-900">
              {visio ? "Présentiel et visio (hybride)" : "Présentiel"}
            </span>
          </p>
          <Ligne libelle="Limite d'ajout de points à l'ODJ" valeur={valeurDe(odj.enTete, "limite-odj")} />
          <Ligne libelle="Mise sous pli de la convocation" valeur={valeurDe(odj.enTete, "mise-sous-pli")} />
        </div>
      </section>

      {/* Sections numerotees */}
      {odj.sections.map((s, i) => (
        <section key={s.id} className="mb-5 break-inside-avoid-page">
          <TitreSection n={i + 1} titre={s.titre} />
          <div className="space-y-0.5">
            {s.champs.map((c) => (
              <Ligne key={c.id} libelle={c.libelle} valeur={formatChampValeur(c)} />
            ))}
          </div>
        </section>
      ))}

      {/* Points reglementaires */}
      <section className="mb-5">
        <TitreSection n={odj.sections.length + 1} titre="Points réglementaires à l'ordre du jour" />
        <div className="space-y-2.5">
          {points.map((p) => (
            <div key={p.id} className="break-inside-avoid-page">
              <p className="text-[12px] font-semibold text-neutral-800">{p.titre}</p>
              <p className="text-[11.5px] text-neutral-600 leading-[1.5]">{p.texte}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pied : signatures + mention */}
      <footer className="mt-8 pt-3 border-t border-neutral-200">
        <div className="flex justify-between gap-8 text-[12px] text-neutral-700">
          <div>
            Fin de réunion : <span className="inline-block min-w-[90px] border-b border-dotted border-neutral-400" />
          </div>
          <div>
            Visa du gestionnaire : <span className="inline-block min-w-[120px] border-b border-dotted border-neutral-400" />
          </div>
        </div>
        <p className="mt-5 text-[9px] text-neutral-400 text-center">
          REAL 31 - Fiche 450 « Couverture AG » - document de préparation d&apos;assemblée générale
        </p>
      </footer>
    </div>
  );
}
