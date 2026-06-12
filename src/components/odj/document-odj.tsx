// Rendu "document" de l'ODJ (calque sur le modele REAL31). Partage entre la vue
// imprimable et l'apercu live de la page d'edition. Composant pur (props only).

import type { ChampOdj, Odj } from "@/lib/domain/odj";
import { formatChampValeur } from "@/lib/domain/odj";

function champDe(champs: ChampOdj[], id: string): ChampOdj | undefined {
  return champs.find((c) => c.id === id);
}
function valeurDe(champs: ChampOdj[], id: string): string | undefined {
  const c = champDe(champs, id);
  return c ? formatChampValeur(c) : undefined;
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

export function DocumentOdj({ odj }: { odj: Odj }) {
  const points = odj.pointsLegaux.filter((p) => p.applicable);
  // Modalite derivee du bouton visio : presentiel par defaut.
  const visio = champDe(odj.enTete, "visio")?.valeur === "oui";

  return (
    <>
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
        <LigneDoc libelle="Pour le syndic" valeur={valeurDe(odj.enTete, "presents-syndic")} />
        <LigneDoc libelle="Pour le conseil syndical" valeur={valeurDe(odj.enTete, "presents-cs")} />
        <LigneDoc libelle="L'assemblée générale est fixée au" valeur={valeurDe(odj.enTete, "date-ag")} />
        <LigneDoc libelle="Lieu de l'AG" valeur={valeurDe(odj.enTete, "lieu")} />
        <p className="text-[12.5px] leading-relaxed">
          Modalité : <span className="font-medium">{visio ? "Présentiel et visio (hybride)" : "Présentiel"}</span>
        </p>
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
          <h2 className="text-[14px] font-semibold border-b border-neutral-300 pb-1 mb-2">{s.titre}</h2>
          {s.champs.map((c) => (
            <LigneDoc key={c.id} libelle={c.libelle} valeur={formatChampValeur(c)} />
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
    </>
  );
}
