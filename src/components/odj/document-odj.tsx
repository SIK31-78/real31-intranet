// Rendu "document" de l'ODJ (calque sur le modele REAL31), mise en forme soignee
// pour impression PDF. Composant pur (props only). Accents verts = marque REAL31
// (green-700).
//
// Le rendu des VALEURS est injectable (prop `rendu`) : sans rien, le document est
// statique (version imprimable) ; la page d'edition injecte des valeurs cliquables
// (document-odj-editable). UNE seule mise en page pour les deux - le motif "deux
// copies qui divergent" est exactement celui du bug ODJ lecture/ecriture du 2026-08-17.

import { Fragment, type ReactNode } from "react";
import type { ChampOdj, Odj, PointLegal, SectionOdj } from "@/lib/domain/odj";
import { formatChampValeur } from "@/lib/domain/odj";

/** Points d'injection de la page d'edition. Tous optionnels : defaut = statique. */
export interface RenduDocumentOdj {
  /** Rendu de la valeur d'un champ (l'edition inline se branche ici). */
  valeur?: (champ: ChampOdj) => ReactNode;
  /** Rendu COMPLET d'une ligne de champ LIBRE (libelle editable + valeur + suppression). */
  ligneLibre?: (champ: ChampOdj) => ReactNode;
  /** Rendu COMPLET d'une ligne STANDARD de section (libelle renommable + valeur + masquage). */
  ligneStandard?: (champ: ChampOdj, libelle: string) => ReactNode;
  /** Rendu du TITRE d'une section (renommable en edition). */
  titreSection?: (section: SectionOdj, n: number) => ReactNode;
  /** Rendu de la ligne "Modalite" (le booleen visio, libelles specifiques). */
  modalite?: (champVisio: ChampOdj | undefined) => ReactNode;
  /** Rendu d'un point reglementaire APPLICABLE (titre + texte + controles). */
  point?: (point: PointLegal) => ReactNode;
  /** Bloc ajoute apres la liste des points (ex. reintegration des points retires). */
  finPoints?: ReactNode;
  /** Ajout en pied de section (ex. bouton "+ champ libre"). */
  finSection?: (sectionId: string) => ReactNode;
  /** Rendu d'un paragraphe libre (edition + suppression). */
  bloc?: (bloc: { id: string; texte: string }) => ReactNode;
  /** Rendu d'une NOTE ancree sous une ligne (edition + suppression). */
  note?: (note: { id: string; texte: string }) => ReactNode;
  /** Ajouts locaux (optimistes) sous une ligne : notes creees pas encore revenues. */
  apresLigne?: (champ: ChampOdj) => ReactNode;
  /** Ajout apres les paragraphes libres (ex. bouton "+ paragraphe"). */
  finDocument?: ReactNode;
}

function champDe(champs: ChampOdj[], id: string): ChampOdj | undefined {
  return champs.find((c) => c.id === id);
}

/** Valeur renseignee, ou un trait pointille a completer a la main. Les SAUTS DE
 *  LIGNE sont rendus (leur vrai ODJ CS est redige en paragraphes, pas en champs).
 *  `gras` : l'en-tete reunion garde la valeur en gras ; dans les SECTIONS c'est le
 *  LIBELLE qui porte le gras (hierarchie de leur document Word), la valeur est sobre. */
export function ValeurStatique({ v, gras = true }: { v?: string; gras?: boolean }) {
  if (v) {
    return (
      <span className={`whitespace-pre-wrap ${gras ? "font-medium text-neutral-900" : "text-neutral-700"}`}>{v}</span>
    );
  }
  return (
    <span className="inline-block align-baseline min-w-[140px] border-b border-dotted border-neutral-400" />
  );
}

/** Une valeur de section se rend-elle en PARAGRAPHE sous son titre (plutot qu'inline) ?
 *  Regle (retour collegue 2026-09-01, "des lignes qui ne sont pas d'office en saut de
 *  ligne") : TOUT texte renseigne passe sous le titre, comme leur ODJ Word. Seuls les
 *  montants/pourcentages (courts par nature) et les champs vides restent inline. */
export function estParagraphe(champ: { type?: string; valeur?: string } | undefined, v?: string): boolean {
  if (!v) return false;
  return !champ?.type || champ.type === "texte";
}

/** Mise en page d'une ligne de SECTION, calquee sur leur ODJ CS Word : sous-titre en
 *  GRAS, et le texte long passe EN DESSOUS en paragraphe. Partagee entre le rendu
 *  statique (imprimable) et l'edition - une seule structure, jamais deux copies. */
export function CorpsLigneSection({
  libelle,
  valeur,
  paragraphe,
  apres,
}: {
  libelle: ReactNode;
  valeur: ReactNode;
  paragraphe: boolean;
  /** Controles de fin de ligne (croix de masquage/suppression), edition seulement. */
  apres?: ReactNode;
}) {
  if (paragraphe) {
    return (
      <div className="text-[12px] leading-[1.55] break-inside-avoid-page">
        <p className="flex items-baseline gap-1">
          <span className="font-semibold text-neutral-800">{libelle}</span>
          <span className="font-semibold text-neutral-800">:</span>
          {apres}
        </p>
        <div className="text-neutral-700">{valeur}</div>
      </div>
    );
  }
  return (
    <p className="text-[12px] leading-[1.55] text-neutral-700 flex items-baseline gap-1">
      <span className="font-semibold text-neutral-800 shrink-0">{libelle}</span>
      <span className="font-semibold text-neutral-800">:</span>
      <span className="min-w-0 flex-1">{valeur}</span>
      {apres}
    </p>
  );
}

function Ligne({
  libelle,
  champ,
  rendu,
  standard,
}: {
  libelle: string;
  champ?: ChampOdj;
  rendu?: RenduDocumentOdj;
  /** Ligne de SECTION (renommable/masquable) - jamais les fondamentaux de l'en-tete. */
  standard?: boolean;
}) {
  // Champ MASQUE par le gestionnaire : absent du document. La page d'edition le
  // propose a la reintegration via finSection, jamais ici.
  if (champ?.masque) return null;
  // Champ LIBRE : la ligne entiere est rendue par la page d'edition (libelle editable).
  if (champ?.libre && rendu?.ligneLibre) return <>{rendu.ligneLibre(champ)}</>;
  // Ligne STANDARD en edition : rendue entiere par la page (libelle renommable + croix).
  if (champ && standard && rendu?.ligneStandard) return <>{rendu.ligneStandard(champ, libelle)}</>;
  // Ligne de SECTION statique : sous-titre gras + paragraphe (mise en page Word).
  if (standard) {
    const v = champ ? formatChampValeur(champ) : undefined;
    return (
      <CorpsLigneSection
        libelle={libelle}
        paragraphe={estParagraphe(champ, v)}
        valeur={rendu?.valeur && champ ? rendu.valeur(champ) : <ValeurStatique v={v} gras={false} />}
      />
    );
  }
  return (
    <p className="text-[12px] leading-[1.55] text-neutral-700">
      <span className="text-neutral-500">{libelle} : </span>
      {rendu?.valeur && champ ? rendu.valeur(champ) : <ValeurStatique v={champ ? formatChampValeur(champ) : undefined} />}
    </p>
  );
}

/** Heure de cloture du CS, fuseau cabinet (Europe/Paris) EXPLICITE : le meme rendu
 *  cote serveur (UTC Vercel) et cote client, sinon mismatch d'hydratation. */
function formatFinReunion(iso: string): string | undefined {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const f = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return f.replace(":", "h");
}

export function TitreSection({ n, titre }: { n: number; titre: string }) {
  return (
    <h2 className="flex items-baseline gap-2 mb-2 pb-1 border-b border-green-700/40 break-after-avoid">
      <span className="text-green-700 font-bold text-[12.5px] tabular-nums">{n}.</span>
      <span className="text-[13px] font-semibold uppercase tracking-[0.04em] text-green-700">{titre}</span>
    </h2>
  );
}

export function DocumentOdj({ odj, rendu }: { odj: Odj; rendu?: RenduDocumentOdj }) {
  const points = odj.pointsLegaux.filter((p) => p.applicable);
  const champVisio = champDe(odj.enTete, "visio");
  const visio = champVisio?.valeur === "oui";
  const enTete = (id: string) => champDe(odj.enTete, id);

  return (
    <div className="text-neutral-900 [font-feature-settings:'tnum'] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
      {/* En-tete de marque */}
      <header className="flex items-end justify-between gap-6 pb-3 mb-5 border-b-2 border-green-700">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-real31.png" alt="REAL 31 Immobilier" className="h-16 w-auto" />
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
        <Ligne libelle="Conseil syndical du" champ={enTete("date-cs")} rendu={rendu} />
        <Ligne libelle="Pour le syndic" champ={enTete("presents-syndic")} rendu={rendu} />
        <Ligne libelle="Pour le conseil syndical" champ={enTete("presents-cs")} rendu={rendu} />
        <div className="grid grid-cols-2 gap-x-8 mt-1.5 pt-1.5 border-t border-neutral-200">
          <Ligne libelle="Assemblée générale fixée au" champ={enTete("date-ag")} rendu={rendu} />
          <Ligne libelle="Lieu" champ={enTete("lieu")} rendu={rendu} />
          <p className="text-[12px] leading-[1.55] text-neutral-700">
            <span className="text-neutral-500">Modalité : </span>
            {rendu?.modalite ? (
              rendu.modalite(champVisio)
            ) : (
              <span className="font-medium text-neutral-900">
                {visio ? "Présentiel et visio (hybride)" : "Présentiel"}
              </span>
            )}
          </p>
          <Ligne libelle="Limite d'ajout de points à l'ODJ" champ={enTete("limite-odj")} rendu={rendu} />
          <Ligne libelle="Mise sous pli de la convocation" champ={enTete("mise-sous-pli")} rendu={rendu} />
        </div>
      </section>

      {/* Sections numerotees */}
      {odj.sections.map((s, i) => (
        <section key={s.id} className="mb-5 break-inside-avoid-page">
          {rendu?.titreSection ? rendu.titreSection(s, i + 1) : <TitreSection n={i + 1} titre={s.titre} />}
          <div className="space-y-0.5">
            {s.champs.map((c) => (
              <Fragment key={c.id}>
                <Ligne libelle={c.libelle} champ={c} rendu={rendu} standard={!c.libre} />
                {/* Notes ANCREES : elles suivent leur ligne (meme masquee, la note reste). */}
                {(c.notes ?? []).map((n) =>
                  rendu?.note ? (
                    <div key={n.id} className="break-inside-avoid-page">{rendu.note(n)}</div>
                  ) : (
                    <p key={n.id} className="text-[11.5px] text-neutral-700 leading-[1.55] whitespace-pre-wrap break-inside-avoid-page">
                      {n.texte}
                    </p>
                  ),
                )}
                {rendu?.apresLigne?.(c)}
              </Fragment>
            ))}
          </div>
          {/* Paragraphes libres de la section */}
          {(s.blocs ?? []).length > 0 && (
            <div className="mt-1.5 space-y-2">
              {(s.blocs ?? []).map((b) =>
                rendu?.bloc ? (
                  <div key={b.id} className="break-inside-avoid-page">{rendu.bloc(b)}</div>
                ) : (
                  <p key={b.id} className="text-[11.5px] text-neutral-700 leading-[1.55] whitespace-pre-wrap break-inside-avoid-page">
                    {b.texte}
                  </p>
                ),
              )}
            </div>
          )}
          {rendu?.finSection?.(s.id)}
        </section>
      ))}

      {/* Points reglementaires */}
      <section className="mb-5">
        <TitreSection n={odj.sections.length + 1} titre="Points réglementaires à l'ordre du jour" />
        <div className="space-y-2.5">
          {points.map((p) =>
            rendu?.point ? (
              <div key={p.id} className="break-inside-avoid-page">{rendu.point(p)}</div>
            ) : (
              <div key={p.id} className="break-inside-avoid-page">
                <p className="text-[12px] font-semibold text-neutral-800">{p.titre}</p>
                <p className="text-[11.5px] text-neutral-600 leading-[1.5]">{p.texte}</p>
              </div>
            ),
          )}
        </div>
        {rendu?.finPoints}
      </section>

      {/* Paragraphes libres (ajoutes par le gestionnaire) */}
      {(odj.blocsLibres?.length || rendu?.finDocument) ? (
        <section className="mb-5">
          <div className="space-y-2">
            {(odj.blocsLibres ?? []).map((b) =>
              rendu?.bloc ? (
                <div key={b.id} className="break-inside-avoid-page">{rendu.bloc(b)}</div>
              ) : (
                <p key={b.id} className="text-[11.5px] text-neutral-700 leading-[1.55] whitespace-pre-wrap break-inside-avoid-page">
                  {b.texte}
                </p>
              ),
            )}
          </div>
          {rendu?.finDocument}
        </section>
      ) : null}

      {/* Pied : fin de reunion = l'heure de CLOTURE du CS (posee par "Marquer la
          reunion terminee"), pas une ligne a remplir a la main. */}
      <footer className="mt-8 pt-3 border-t border-neutral-200">
        <p className="text-[12px] text-neutral-700">
          Fin de réunion :{" "}
          {odj.cloture ? (
            <span className="font-medium text-neutral-900">{formatFinReunion(odj.cloture.le)}</span>
          ) : (
            <span className="inline-block min-w-[90px] border-b border-dotted border-neutral-400" />
          )}
        </p>
      </footer>
    </div>
  );
}
