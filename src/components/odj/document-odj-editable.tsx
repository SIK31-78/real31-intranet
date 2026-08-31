"use client";

// L'ODJ en MODULE EDITABLE : le document lui-meme s'edite sur place (cliquer une
// valeur -> taper -> auto-save), comme un traitement de texte - fin de la double
// vue formulaire / apercu. La mise en page reste DocumentOdj (une seule source),
// ce composant n'injecte que le rendu des valeurs et des points.
//
// Sauvegarde : auto-save debounce (900 ms apres la derniere frappe) + bouton
// Enregistrer qui force l'envoi immediat. L'etat des brouillons est le domaine
// pur odj-brouillon (teste) ; ici on ne fait qu'orchestrer timers et actions.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Check, CloudUpload, Eye, EyeOff, Loader2, Pencil } from "lucide-react";
import type { ChampOdj, Odj, PointLegal, ProvenanceChamp } from "@/lib/domain/odj";
import { formatChampValeur, provenanceChamp } from "@/lib/domain/odj";
import {
  BROUILLONS_VIDES,
  aDesModifsNonSauvees,
  atterrir,
  partirEnVol,
  poserBrouillon,
  statutGlobal,
  valeurLocale,
  type Brouillons,
  type StatutSauvegarde,
} from "@/lib/domain/odj-brouillon";
import { DocumentOdj, ValeurStatique } from "@/components/odj/document-odj";

const DELAI_AUTOSAVE_MS = 900;

// Meme vocabulaire que l'ancien formulaire (ligne-champ) : la provenance REELLE.
const PROVENANCE_TITRE: Record<ProvenanceChamp, string> = {
  auto: "Rempli automatiquement",
  "auto-jalon": "Calculé depuis la date d'AG (jalon)",
  calcul: "Calculé depuis d'autres champs",
  saisi: "Saisi par le gestionnaire",
  "a-venir": "Sera rempli par eStale (à venir)",
  "a-saisir": "À saisir",
};

interface MoteurAutosave {
  brouillons: Brouillons;
  /** Pose un brouillon et (re)arme le debounce. */
  saisir: (champId: string, valeur: string) => void;
  /** Pose et envoie IMMEDIATEMENT (toggles : pas de raison d'attendre). */
  saisirImmediat: (champId: string, valeur: string) => void;
  /** Envoie tout ce qui est en attente (bouton Enregistrer, re-essai apres echec). */
  envoyer: () => void;
}

function useAutosaveOdj(onSaisir: (champId: string, valeur: string) => Promise<void>): MoteurAutosave {
  const [brouillons, setBrouillons] = useState<Brouillons>(BROUILLONS_VIDES);
  // La verite vit dans la ref (mise a jour SYNCHRONE) ; le state ne sert qu'au rendu.
  // Evite les lectures perimees quand blur + clic Enregistrer tombent dans la meme frame.
  const etatRef = useRef<Brouillons>(BROUILLONS_VIDES);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const maj = useCallback((fn: (b: Brouillons) => Brouillons) => {
    etatRef.current = fn(etatRef.current);
    setBrouillons(etatRef.current);
  }, []);

  const envoyer = useCallback(() => {
    clearTimeout(timerRef.current);
    const { etat, cargaison } = partirEnVol(etatRef.current);
    const entrees = Object.entries(cargaison);
    if (entrees.length === 0) return;
    etatRef.current = etat;
    setBrouillons(etat);
    for (const [champId, valeur] of entrees) {
      void onSaisir(champId, valeur)
        .then(() => maj((b) => atterrir(b, champId, true)))
        .catch(() => maj((b) => atterrir(b, champId, false)));
    }
  }, [onSaisir, maj]);

  const saisir = useCallback(
    (champId: string, valeur: string) => {
      maj((b) => poserBrouillon(b, champId, valeur));
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(envoyer, DELAI_AUTOSAVE_MS);
    },
    [maj, envoyer],
  );

  const saisirImmediat = useCallback(
    (champId: string, valeur: string) => {
      maj((b) => poserBrouillon(b, champId, valeur));
      envoyer();
    },
    [maj, envoyer],
  );

  // Garde-fou fermeture d'onglet : des brouillons non confirmes = avertir.
  useEffect(() => {
    const garde = (e: BeforeUnloadEvent) => {
      if (aDesModifsNonSauvees(etatRef.current)) e.preventDefault();
    };
    window.addEventListener("beforeunload", garde);
    return () => window.removeEventListener("beforeunload", garde);
  }, []);

  return { brouillons, saisir, saisirImmediat, envoyer };
}

/** Champ du document avec le brouillon local superpose (l'affichage suit la frappe
 *  sans attendre le retour serveur). */
function champAvecBrouillon(champ: ChampOdj, brouillons: Brouillons): ChampOdj {
  const local = valeurLocale(brouillons, champ.id);
  if (local === undefined) return champ;
  const { valeur: _ancienne, ...reste } = champ;
  void _ancienne;
  // Brouillon vide = retour a la valeur AUTO cote serveur ; en attendant, trait vide.
  return local.trim() === "" ? { ...reste, saisi: false } : { ...reste, valeur: local, saisi: true };
}

function ValeurEditable({ champ, moteur }: { champ: ChampOdj; moteur: MoteurAutosave }) {
  const [edition, setEdition] = useState(false);
  const [saisieLocale, setSaisieLocale] = useState("");
  const affiche = champAvecBrouillon(champ, moteur.brouillons);
  const titreProvenance = PROVENANCE_TITRE[provenanceChamp(affiche)];

  if (!champ.editable) {
    return (
      <span title={titreProvenance}>
        <ValeurStatique v={formatChampValeur(affiche)} />
      </span>
    );
  }

  if (edition) {
    const valider = () => {
      setEdition(false);
      const brut = saisieLocale.trim();
      const actuel = valeurLocale(moteur.brouillons, champ.id) ?? champ.valeur ?? "";
      if (brut === actuel.trim()) return; // rien n'a change : pas d'ecriture inutile
      moteur.saisir(champ.id, brut);
    };
    return (
      <input
        // eslint-disable-next-line jsx-a11y/no-autofocus -- on vient de cliquer ce champ precis
        autoFocus
        value={saisieLocale}
        onChange={(e) => setSaisieLocale(e.target.value)}
        onBlur={valider}
        onKeyDown={(e) => {
          if (e.key === "Enter") valider();
          if (e.key === "Escape") setEdition(false);
        }}
        placeholder={champ.type === "montant" ? "Montant en €" : undefined}
        className="inline-block align-baseline min-w-[160px] max-w-full px-1 -mx-1 rounded-sm bg-green-700/5 font-medium text-neutral-900 text-[12px] leading-[1.55] outline-none ring-1 ring-green-700/40 focus:ring-green-700"
      />
    );
  }

  const v = formatChampValeur(affiche);
  return (
    <button
      type="button"
      title={`${titreProvenance} - cliquer pour modifier${champ.alerte ? ` (${champ.alerte})` : ""}`}
      onClick={() => {
        // Prefill avec la valeur BRUTE (pas le format d'affichage "4 500,00 EUR").
        setSaisieLocale(valeurLocale(moteur.brouillons, champ.id) ?? champ.valeur ?? "");
        setEdition(true);
      }}
      className="group inline-flex items-baseline gap-1 max-w-full text-left align-baseline rounded-sm -mx-0.5 px-0.5 hover:bg-green-700/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-700/50"
    >
      {v ? (
        <span className="font-medium text-neutral-900 border-b border-dotted border-green-700/40">{v}</span>
      ) : (
        <span className="inline-block align-baseline min-w-[140px] border-b border-dotted border-neutral-400 group-hover:border-green-700/60" />
      )}
      {champ.alerte && !v ? (
        <AlertTriangle strokeWidth={1.5} className="w-3 h-3 self-center text-warn-700" />
      ) : (
        <Pencil
          strokeWidth={1.5}
          className="w-3 h-3 self-center text-neutral-300 opacity-0 group-hover:opacity-100 group-hover:text-green-700 transition-opacity"
        />
      )}
    </button>
  );
}

/** Modalite (visio) : bascule directe Presentiel <-> hybride, envoi immediat. */
function ModaliteEditable({ champ, moteur }: { champ: ChampOdj | undefined; moteur: MoteurAutosave }) {
  if (!champ) return <span className="font-medium text-neutral-900">Présentiel</span>;
  const actif = champAvecBrouillon(champ, moteur.brouillons).valeur === "oui";
  return (
    <button
      type="button"
      title="Cliquer pour basculer présentiel / hybride"
      onClick={() => moteur.saisirImmediat(champ.id, actif ? "non" : "oui")}
      className="font-medium text-neutral-900 border-b border-dotted border-green-700/40 rounded-sm -mx-0.5 px-0.5 hover:bg-green-700/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-700/50"
    >
      {actif ? "Présentiel et visio (hybride)" : "Présentiel"}
    </button>
  );
}

/** Un point reglementaire applicable, retirable au survol. */
function PointEditable({
  point,
  onToggle,
}: {
  point: PointLegal;
  onToggle: (pointId: string, retire: boolean) => Promise<void>;
}) {
  const [enCours, setEnCours] = useState(false);
  return (
    <div className={`group/point relative pr-8 ${enCours ? "opacity-50" : ""}`}>
      <p className="text-[12px] font-semibold text-neutral-800">{point.titre}</p>
      <p className="text-[11.5px] text-neutral-600 leading-[1.5]">{point.texte}</p>
      <button
        type="button"
        title="Retirer ce point de l'ordre du jour"
        disabled={enCours}
        onClick={() => {
          setEnCours(true);
          void onToggle(point.id, true).finally(() => setEnCours(false));
        }}
        className="absolute right-0 top-0.5 p-1 rounded text-neutral-300 opacity-0 group-hover/point:opacity-100 hover:text-warn-700 hover:bg-warn-50 transition-opacity"
      >
        <EyeOff strokeWidth={1.5} className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/** Les points retires, reintegrables d'un clic. Discret : hors document a l'impression
 *  (cette page ne s'imprime pas - la version imprimable reste /imprimer). */
function PointsRetires({
  points,
  onToggle,
}: {
  points: PointLegal[];
  onToggle: (pointId: string, retire: boolean) => Promise<void>;
}) {
  const [enCours, setEnCours] = useState<string | null>(null);
  if (points.length === 0) return null;
  return (
    <div className="mt-4 pt-3 border-t border-dashed border-neutral-200">
      <p className="text-[11px] text-neutral-400 mb-1.5">
        Points retirés de ce document ({points.length}) :
      </p>
      <ul className="space-y-1">
        {points.map((p) => (
          <li key={p.id} className="flex items-center gap-2">
            <button
              type="button"
              disabled={enCours === p.id}
              onClick={() => {
                setEnCours(p.id);
                void onToggle(p.id, false).finally(() => setEnCours(null));
              }}
              title={p.condition ? `Réintégrer - ${p.condition}` : "Réintégrer ce point"}
              className="inline-flex items-center gap-1.5 text-[11.5px] text-neutral-500 hover:text-green-700 disabled:opacity-50"
            >
              <Eye strokeWidth={1.5} className="w-3 h-3 shrink-0" />
              <span className="line-through decoration-neutral-300">{p.titre}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Barre de sauvegarde : statut + bouton Enregistrer. Sticky au-dessus du document. */
function BarreSauvegarde({ statut, onEnregistrer }: { statut: StatutSauvegarde; onEnregistrer: () => void }) {
  const rendu: Record<StatutSauvegarde, ReactNode> = {
    repos: <span className="text-ink-4">Les modifications s&apos;enregistrent automatiquement</span>,
    "en-attente": <span className="text-ink-3">Modifications en attente…</span>,
    enregistrement: (
      <span className="inline-flex items-center gap-1.5 text-ink-3">
        <Loader2 strokeWidth={1.5} className="w-3.5 h-3.5 animate-spin" />
        Enregistrement…
      </span>
    ),
    enregistre: (
      <span className="inline-flex items-center gap-1.5 text-ok-700">
        <Check strokeWidth={1.5} className="w-3.5 h-3.5" />
        Enregistré
      </span>
    ),
    erreur: (
      <span className="inline-flex items-center gap-1.5 text-err-700">
        <AlertTriangle strokeWidth={1.5} className="w-3.5 h-3.5" />
        Échec d&apos;enregistrement — réessayez
      </span>
    ),
  };
  return (
    <div className="sticky top-2 z-10 flex items-center justify-end gap-3 rounded-md border border-line bg-surface/95 backdrop-blur px-3 py-1.5 shadow-sm">
      <span className="text-[12px]">{rendu[statut]}</span>
      <button
        type="button"
        onClick={onEnregistrer}
        disabled={statut === "enregistrement"}
        className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md bg-green-700 text-surface text-[12.5px] font-medium hover:bg-green-600 transition-colors disabled:opacity-50"
      >
        <CloudUpload strokeWidth={1.5} className="w-3.5 h-3.5" />
        Enregistrer
      </button>
    </div>
  );
}

export function DocumentOdjEditable({
  odj,
  onSaisir,
  onTogglePoint,
}: {
  odj: Odj;
  onSaisir: (champId: string, valeur: string) => Promise<void>;
  onTogglePoint: (pointId: string, retire: boolean) => Promise<void>;
}) {
  const moteur = useAutosaveOdj(onSaisir);
  const retires = odj.pointsLegaux.filter((p) => !p.applicable);

  return (
    <div className="flex flex-col gap-3">
      <BarreSauvegarde statut={statutGlobal(moteur.brouillons)} onEnregistrer={moteur.envoyer} />
      {/* La "feuille" : fond papier, la mise en page EXACTE du document imprimable. */}
      <div className="rounded-lg border border-line bg-white shadow-sm px-8 py-8 sm:px-10 sm:py-9">
        <DocumentOdj
          odj={odj}
          rendu={{
            valeur: (champ) => <ValeurEditable champ={champ} moteur={moteur} />,
            modalite: (champVisio) => <ModaliteEditable champ={champVisio} moteur={moteur} />,
            point: (p) => <PointEditable point={p} onToggle={onTogglePoint} />,
            finPoints: <PointsRetires points={retires} onToggle={onTogglePoint} />,
          }}
        />
      </div>
    </div>
  );
}
