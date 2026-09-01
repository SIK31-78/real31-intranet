"use client";

// L'ODJ en MODULE EDITABLE : le document lui-meme s'edite sur place (cliquer une
// valeur -> taper -> auto-save), comme un traitement de texte - fin de la double
// vue formulaire / apercu. La mise en page reste DocumentOdj (une seule source),
// ce composant n'injecte que le rendu des valeurs, des points et des ajouts libres.
//
// Sauvegarde : auto-save debounce (900 ms apres la derniere frappe) + bouton
// Enregistrer qui force l'envoi immediat. L'etat des brouillons est le domaine
// pur odj-brouillon (teste) ; l'historique Ctrl+Z / Ctrl+Y est le domaine pur
// odj-historique (teste) - annuler RESAISIT l'ancienne valeur par le meme chemin
// d'auto-save, jamais un contournement.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  CloudUpload,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Redo2,
  Undo2,
  X,
} from "lucide-react";
import type { ChampOdj, Odj, PointLegal, ProvenanceChamp, SectionOdj } from "@/lib/domain/odj";
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
import {
  HISTORIQUE_VIDE,
  annuler,
  pousserGeste,
  refaire,
  type HistoriqueOdj,
} from "@/lib/domain/odj-historique";
import {
  PREFIXE_LIBELLE,
  PREFIXE_MASQUE,
  PREFIXE_TITRE_SECTION,
  ancreDeNote,
  estAjoutLibre,
  estBlocLibre,
  idBlocLibre,
  idChampLibre,
  idNote,
  parseChampLibre,
  sectionDuBloc,
  sectionDuChampLibre,
  serialiserChampLibre,
} from "@/lib/domain/odj-libre";
import { CorpsLigneSection, DocumentOdj, ValeurStatique, estParagraphe } from "@/components/odj/document-odj";

const DELAI_AUTOSAVE_MS = 900;

// Meme vocabulaire que l'ancien formulaire : la provenance REELLE du champ.
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
  historique: HistoriqueOdj;
  /** Ids d'ajouts libres supprimes LOCALEMENT. Le brouillon "" est consomme des que le
   *  serveur repond, mais le HTML revalide arrive APRES : sans ce registre, le champ
   *  supprime se reaffiche entre les deux (doublon fantome mesure le 2026-08-31).
   *  Purge par une nouvelle valeur non vide sur le meme id (Ctrl+Y). */
  supprimes: ReadonlySet<string>;
  /** Commit d'un geste d'edition : entre dans l'HISTORIQUE puis part a l'auto-save
   *  (debounce, ou immediat pour les bascules/ajouts/suppressions). */
  commettre: (champId: string, avant: string, apres: string, immediat?: boolean) => void;
  /** Envoie tout ce qui est en attente (bouton Enregistrer, re-essai apres echec). */
  envoyer: () => void;
  annulerGeste: () => void;
  refaireGeste: () => void;
}

function useAutosaveOdj(onSaisir: (champId: string, valeur: string) => Promise<void>): MoteurAutosave {
  const [brouillons, setBrouillons] = useState<Brouillons>(BROUILLONS_VIDES);
  const [historique, setHistorique] = useState<HistoriqueOdj>(HISTORIQUE_VIDE);
  const [supprimes, setSupprimes] = useState<ReadonlySet<string>>(new Set());
  // La verite vit dans la ref (mise a jour SYNCHRONE) ; le state ne sert qu'au rendu.
  // Evite les lectures perimees quand blur + clic Enregistrer tombent dans la meme frame.
  const etatRef = useRef<Brouillons>(BROUILLONS_VIDES);
  const histRef = useRef<HistoriqueOdj>(HISTORIQUE_VIDE);
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
    (champId: string, valeur: string, immediat?: boolean) => {
      // Registre des suppressions d'ajouts libres (cf. `supprimes`).
      if (estAjoutLibre(champId)) {
        setSupprimes((s) => {
          const vide = valeur.trim() === "";
          if (vide === s.has(champId)) return s;
          const n = new Set(s);
          if (vide) n.add(champId);
          else n.delete(champId);
          return n;
        });
      }
      maj((b) => poserBrouillon(b, champId, valeur));
      if (immediat) {
        envoyer();
        return;
      }
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(envoyer, DELAI_AUTOSAVE_MS);
    },
    [maj, envoyer],
  );

  const commettre = useCallback(
    (champId: string, avant: string, apres: string, immediat?: boolean) => {
      histRef.current = pousserGeste(histRef.current, { champId, avant, apres });
      setHistorique(histRef.current);
      saisir(champId, apres, immediat);
    },
    [saisir],
  );

  const annulerGeste = useCallback(() => {
    const { historique: h, geste } = annuler(histRef.current);
    histRef.current = h;
    setHistorique(h);
    if (geste) saisir(geste.champId, geste.avant, true);
  }, [saisir]);

  const refaireGeste = useCallback(() => {
    const { historique: h, geste } = refaire(histRef.current);
    histRef.current = h;
    setHistorique(h);
    if (geste) saisir(geste.champId, geste.apres, true);
  }, [saisir]);

  // Ctrl+Z / Ctrl+Y (et Ctrl+Shift+Z) au niveau du document - mais JAMAIS quand un
  // input est actif : la, c'est l'annulation native du champ en cours qui doit jouer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const cible = e.target as HTMLElement | null;
      if (cible && (cible.tagName === "INPUT" || cible.tagName === "TEXTAREA" || cible.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        annulerGeste();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        refaireGeste();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [annulerGeste, refaireGeste]);

  // Garde-fou fermeture d'onglet : des brouillons non confirmes = avertir.
  useEffect(() => {
    const garde = (e: BeforeUnloadEvent) => {
      if (aDesModifsNonSauvees(etatRef.current)) e.preventDefault();
    };
    window.addEventListener("beforeunload", garde);
    return () => window.removeEventListener("beforeunload", garde);
  }, []);

  return { brouillons, historique, supprimes, commettre, envoyer, annulerGeste, refaireGeste };
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

/** Petit input inline partage (valeur de champ, libelle libre) : commit au blur /
 *  Entree, abandon a Echap. */
function InputInline({
  initial,
  onCommit,
  onAbandon,
  placeholder,
  classe,
}: {
  initial: string;
  onCommit: (v: string) => void;
  onAbandon: () => void;
  placeholder?: string;
  classe?: string;
}) {
  const [v, setV] = useState(initial);
  const commitRef = useRef(false);
  const commettre = () => {
    if (commitRef.current) return; // Entree PUIS blur : un seul commit
    commitRef.current = true;
    onCommit(v);
  };
  return (
    <input
      // eslint-disable-next-line jsx-a11y/no-autofocus -- on vient de cliquer ce champ precis
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commettre}
      onKeyDown={(e) => {
        if (e.key === "Enter") commettre();
        if (e.key === "Escape") {
          commitRef.current = true;
          onAbandon();
        }
      }}
      placeholder={placeholder}
      className={
        classe ??
        "inline-block align-baseline min-w-[160px] max-w-full px-1 -mx-1 rounded-sm bg-green-700/5 font-medium text-neutral-900 text-[12px] leading-[1.55] outline-none ring-1 ring-green-700/40 focus:ring-green-700"
      }
    />
  );
}

/** Textarea multi-lignes pour les valeurs TEXTE : leur vrai ODJ CS est redige en
 *  paragraphes (retour collegue 2026-09-01, "le saut de ligne ne fonctionne pas").
 *  Entree = saut de ligne ; commit au blur ; abandon a Echap. */
function TextareaInline({
  initial,
  onCommit,
  onAbandon,
}: {
  initial: string;
  onCommit: (v: string) => void;
  onAbandon: () => void;
}) {
  const [v, setV] = useState(initial);
  const commitRef = useRef(false);
  return (
    <textarea
      // eslint-disable-next-line jsx-a11y/no-autofocus -- on vient de cliquer ce champ precis
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (commitRef.current) return;
        commitRef.current = true;
        onCommit(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          commitRef.current = true;
          onAbandon();
        }
      }}
      rows={Math.max(2, v.split("\n").length)}
      className="block w-full mt-0.5 px-2 py-1 rounded-sm bg-green-700/5 text-[12px] leading-[1.55] text-neutral-900 outline-none ring-1 ring-green-700/40 focus:ring-green-700 resize-y"
    />
  );
}

function ValeurEditable({
  champ,
  moteur,
  sobre = false,
}: {
  champ: ChampOdj;
  moteur: MoteurAutosave;
  /** Lignes de SECTION : le gras est au libelle, la valeur reste sobre (mise en page Word). */
  sobre?: boolean;
}) {
  const [edition, setEdition] = useState(false);
  const affiche = champAvecBrouillon(champ, moteur.brouillons);
  const titreProvenance = PROVENANCE_TITRE[provenanceChamp(affiche)];
  const actuel = valeurLocale(moteur.brouillons, champ.id) ?? champ.valeur ?? "";
  // Montants / pourcentages : une ligne. Tout le reste : PARAGRAPHE possible.
  const multiligne = !champ.type || champ.type === "texte";

  if (!champ.editable) {
    return (
      <span title={titreProvenance}>
        <ValeurStatique v={formatChampValeur(affiche)} gras={!sobre} />
      </span>
    );
  }

  if (edition) {
    const commit = (v: string) => {
      setEdition(false);
      const brut = v.trim();
      if (brut !== actuel.trim()) moteur.commettre(champ.id, actuel, brut);
    };
    if (multiligne) return <TextareaInline initial={actuel} onAbandon={() => setEdition(false)} onCommit={commit} />;
    return (
      <InputInline
        initial={actuel}
        placeholder={champ.type === "montant" ? "Montant en €" : undefined}
        onAbandon={() => setEdition(false)}
        onCommit={commit}
      />
    );
  }

  const v = formatChampValeur(affiche);
  return (
    <button
      type="button"
      title={`${titreProvenance} - cliquer pour modifier${champ.alerte ? ` (${champ.alerte})` : ""}`}
      onClick={() => setEdition(true)}
      className="group inline-flex items-baseline gap-1 max-w-full text-left align-baseline rounded-sm -mx-0.5 px-0.5 hover:bg-green-700/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-700/50"
    >
      {v ? (
        <span
          className={`whitespace-pre-wrap border-b border-dotted border-green-700/40 ${sobre ? "text-neutral-700" : "font-medium text-neutral-900"}`}
        >
          {v}
        </span>
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
  const actuel = valeurLocale(moteur.brouillons, champ.id) ?? champ.valeur ?? "non";
  const actif = actuel === "oui";
  if (!champ.editable) {
    return (
      <span className="font-medium text-neutral-900">{actif ? "Présentiel et visio (hybride)" : "Présentiel"}</span>
    );
  }
  return (
    <button
      type="button"
      title="Cliquer pour basculer présentiel / hybride"
      onClick={() => moteur.commettre(champ.id, actuel, actif ? "non" : "oui", true)}
      className="font-medium text-neutral-900 border-b border-dotted border-green-700/40 rounded-sm -mx-0.5 px-0.5 hover:bg-green-700/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-700/50"
    >
      {actif ? "Présentiel et visio (hybride)" : "Présentiel"}
    </button>
  );
}

/** Ligne d'un champ LIBRE : libelle ET valeur editables, croix de suppression.
 *  Tout commit reecrit la valeur ENCODEE complete (libelle|texte) sur le meme id. */
function ChampLibreEditable({ champ, moteur }: { champ: ChampOdj; moteur: MoteurAutosave }) {
  const [editionLibelle, setEditionLibelle] = useState(false);
  // La verite locale prime : un brouillon en vol porte deja "libelle|texte".
  const local = valeurLocale(moteur.brouillons, champ.id);
  const encodeActuel = local ?? serialiserChampLibre(champ.libelle, champ.valeur ?? "");
  const { libelle, texte } = parseChampLibre(encodeActuel);
  // Supprime : masque jusqu'a ce que le serveur cesse de le rendre (cf. `supprimes`).
  if (moteur.supprimes.has(champ.id)) return null;

  const champTexte: ChampOdj = {
    id: champ.id,
    libelle,
    source: "manuel",
    editable: true,
    saisi: Boolean(texte),
    ...(texte ? { valeur: texte } : {}),
  };

  const renduLibelle = editionLibelle ? (
    <InputInline
      initial={libelle}
      placeholder="Libellé"
      onAbandon={() => setEditionLibelle(false)}
      onCommit={(v) => {
        setEditionLibelle(false);
        const nouveau = serialiserChampLibre(v.trim() || "Nouveau champ", texte);
        if (nouveau !== encodeActuel) moteur.commettre(champ.id, encodeActuel, nouveau);
      }}
      classe="inline-block align-baseline min-w-[120px] px-1 -mx-1 rounded-sm bg-green-700/5 font-semibold text-neutral-800 text-[12px] leading-[1.55] outline-none ring-1 ring-green-700/40 focus:ring-green-700"
    />
  ) : (
    <button
      type="button"
      title="Champ ajouté - cliquer pour renommer"
      onClick={() => setEditionLibelle(true)}
      className="font-semibold text-neutral-800 text-left border-b border-dotted border-transparent hover:border-green-700/40 rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-700/50"
    >
      {libelle}
    </button>
  );

  return (
    <div className="group/libre">
      <CorpsLigneSection
        libelle={renduLibelle}
        paragraphe={estParagraphe(champTexte, texte)}
        valeur={<ValeurLibre champ={champTexte} libelle={libelle} encodeActuel={encodeActuel} moteur={moteur} />}
        apres={
          <>
            <button
              type="button"
              title="Ajouter un paragraphe SOUS cette ligne"
              onClick={() =>
                moteur.commettre(idNote(champ.id, Date.now()), "", "Nouveau paragraphe - cliquer pour rédiger.", true)
              }
              className="self-center p-0.5 rounded text-neutral-300 opacity-0 group-hover/libre:opacity-100 hover:text-green-700 hover:bg-green-700/5 transition-opacity"
            >
              <Plus strokeWidth={1.5} className="w-3 h-3" />
            </button>
            <button
              type="button"
              title="Supprimer ce champ"
              onClick={() => moteur.commettre(champ.id, encodeActuel, "", true)}
              className="self-center p-0.5 rounded text-neutral-300 opacity-0 group-hover/libre:opacity-100 hover:text-err-700 hover:bg-err-50 transition-opacity"
            >
              <X strokeWidth={1.5} className="w-3 h-3" />
            </button>
          </>
        }
      />
    </div>
  );
}

/** Valeur d'un champ libre : meme UX que ValeurEditable, mais le commit encode
 *  libelle|texte (la valeur seule n'existe pas en persistance). */
function ValeurLibre({
  champ,
  libelle,
  encodeActuel,
  moteur,
}: {
  champ: ChampOdj;
  libelle: string;
  encodeActuel: string;
  moteur: MoteurAutosave;
}) {
  const [edition, setEdition] = useState(false);
  if (edition) {
    // TEXTAREA : Entree = saut de ligne, comme dans leur Word ("l'enter ne
    // fonctionne pas" - retour du 2026-09-01 : la valeur libre passait par l'input).
    return (
      <TextareaInline
        initial={champ.valeur ?? ""}
        onAbandon={() => setEdition(false)}
        onCommit={(v) => {
          setEdition(false);
          const nouveau = serialiserChampLibre(libelle, v.trim());
          if (nouveau !== encodeActuel) moteur.commettre(champ.id, encodeActuel, nouveau);
        }}
      />
    );
  }
  return (
    <button
      type="button"
      title="Saisi par le gestionnaire - cliquer pour modifier"
      onClick={() => setEdition(true)}
      className="group inline-flex items-baseline gap-1 max-w-full text-left align-baseline rounded-sm -mx-0.5 px-0.5 hover:bg-green-700/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-700/50"
    >
      {champ.valeur ? (
        <span className="text-neutral-700 whitespace-pre-wrap border-b border-dotted border-green-700/40">{champ.valeur}</span>
      ) : (
        <span className="inline-block align-baseline min-w-[140px] border-b border-dotted border-neutral-400 group-hover:border-green-700/60" />
      )}
    </button>
  );
}

/** Paragraphe libre : texte multiligne editable au clic, croix de suppression. */
function BlocLibreEditable({
  id,
  texteServeur,
  moteur,
}: {
  id: string;
  texteServeur: string;
  moteur: MoteurAutosave;
}) {
  const [edition, setEdition] = useState(false);
  const local = valeurLocale(moteur.brouillons, id);
  const texte = local ?? texteServeur;
  const [brouillon, setBrouillon] = useState("");
  if (moteur.supprimes.has(id)) return null; // cf. `supprimes`

  if (edition) {
    const commettre = () => {
      setEdition(false);
      const v = brouillon.trim();
      if (v !== texte.trim()) moteur.commettre(id, texte, v || texte, false);
    };
    return (
      <textarea
        // eslint-disable-next-line jsx-a11y/no-autofocus -- on vient de cliquer ce paragraphe
        autoFocus
        value={brouillon}
        onChange={(e) => setBrouillon(e.target.value)}
        onBlur={commettre}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEdition(false);
        }}
        rows={Math.max(2, brouillon.split("\n").length)}
        className="w-full px-2 py-1 rounded-sm bg-green-700/5 text-[11.5px] leading-[1.55] text-neutral-900 outline-none ring-1 ring-green-700/40 focus:ring-green-700 resize-y"
      />
    );
  }

  return (
    <div className="group/bloc relative pr-7">
      <button
        type="button"
        title="Paragraphe ajouté - cliquer pour modifier"
        onClick={() => {
          setBrouillon(texte);
          setEdition(true);
        }}
        className="block w-full text-left text-[11.5px] text-neutral-700 leading-[1.55] whitespace-pre-wrap rounded-sm px-1 -mx-1 hover:bg-green-700/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-700/50"
      >
        {texte}
      </button>
      <button
        type="button"
        title="Supprimer ce paragraphe"
        onClick={() => moteur.commettre(id, texte, "", true)}
        className="absolute right-0 top-0.5 p-1 rounded text-neutral-300 opacity-0 group-hover/bloc:opacity-100 hover:text-err-700 hover:bg-err-50 transition-opacity"
      >
        <X strokeWidth={1.5} className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/** Un point reglementaire applicable, retirable (bouton VISIBLE, pas seulement au
 *  survol : "on peut pas les enlever" - retour Sekou 2026-08-31). */
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
        className="absolute right-0 top-0.5 p-1 rounded text-neutral-300 hover:text-warn-700 hover:bg-warn-50 group-hover/point:text-neutral-400 transition-colors"
      >
        <EyeOff strokeWidth={1.5} className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/** Les points retires, reintegrables d'un clic. */
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
      <p className="text-[11px] text-neutral-400 mb-1.5">Points retirés de ce document ({points.length}) :</p>
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

/** Bouton d'ajout discret ("+ Ajouter un champ" / "+ Ajouter un paragraphe"). */
function BoutonAjout({ libelle, onClick }: { libelle: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1 inline-flex items-center gap-1 text-[11px] text-neutral-400 hover:text-green-700 transition-colors"
    >
      <Plus strokeWidth={1.5} className="w-3 h-3" />
      {libelle}
    </button>
  );
}

/** Barre de sauvegarde : annuler / refaire + statut + bouton Enregistrer. */
function BarreSauvegarde({ moteur }: { moteur: MoteurAutosave }) {
  const statut = statutGlobal(moteur.brouillons);
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
    <div className="sticky top-2 z-10 flex items-center justify-between gap-3 rounded-md border border-line bg-surface/95 backdrop-blur px-3 py-1.5 shadow-sm">
      <div className="flex items-center gap-1">
        <button
          type="button"
          title="Annuler (Ctrl+Z)"
          onClick={moteur.annulerGeste}
          disabled={moteur.historique.annulables.length === 0}
          className="p-1.5 rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Undo2 strokeWidth={1.5} className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          title="Rétablir (Ctrl+Y)"
          onClick={moteur.refaireGeste}
          disabled={moteur.historique.refaisables.length === 0}
          className="p-1.5 rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Redo2 strokeWidth={1.5} className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[12px]">{rendu[statut]}</span>
        <button
          type="button"
          onClick={moteur.envoyer}
          disabled={statut === "enregistrement"}
          className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md bg-green-700 text-surface text-[12.5px] font-medium hover:bg-green-600 transition-colors disabled:opacity-50"
        >
          <CloudUpload strokeWidth={1.5} className="w-3.5 h-3.5" />
          Enregistrer
        </button>
      </div>
    </div>
  );
}

/** Ligne STANDARD de section : libelle renommable ("libelle.<id>"), valeur editable,
 *  croix de masquage ("masque.<id>"). Le catalogue n'est jamais modifie - tout vit
 *  dans l'etat, donc annulable (Ctrl+Z) et effacable (retour au catalogue). */
function LigneStandardEditable({
  champ,
  libelle,
  moteur,
}: {
  champ: ChampOdj;
  libelle: string;
  moteur: MoteurAutosave;
}) {
  const [editionLibelle, setEditionLibelle] = useState(false);
  const cleMasque = `${PREFIXE_MASQUE}${champ.id}`;
  const cleLibelle = `${PREFIXE_LIBELLE}${champ.id}`;
  // Masquage OPTIMISTE : le brouillon local prime sur l'etat serveur.
  const masqueLocal = valeurLocale(moteur.brouillons, cleMasque);
  if (masqueLocal !== undefined ? masqueLocal.trim() !== "" : Boolean(champ.masque)) return null;
  const libelleLocal = valeurLocale(moteur.brouillons, cleLibelle);
  const libelleAffiche =
    libelleLocal !== undefined ? (libelleLocal.trim() || libelle) : libelle;

  const valeurAffichee = valeurLocale(moteur.brouillons, champ.id) ?? champ.valeur;
  const renduLibelle = editionLibelle ? (
    <InputInline
      initial={libelleAffiche}
      placeholder="Libellé"
      onAbandon={() => setEditionLibelle(false)}
      onCommit={(v) => {
        setEditionLibelle(false);
        const nouveau = v.trim();
        const avant = libelleLocal ?? (champ.libelleReecrit ? libelle : "");
        // Vide = retour au libelle du catalogue (efface la reecriture).
        if (nouveau !== libelleAffiche || nouveau === "") moteur.commettre(cleLibelle, avant, nouveau);
      }}
      classe="inline-block align-baseline min-w-[120px] px-1 -mx-1 rounded-sm bg-green-700/5 font-semibold text-neutral-800 text-[12px] leading-[1.55] outline-none ring-1 ring-green-700/40 focus:ring-green-700"
    />
  ) : (
    <button
      type="button"
      title="Cliquer pour renommer ce libellé (le vider rétablit l'original)"
      onClick={() => setEditionLibelle(true)}
      className="font-semibold text-neutral-800 text-left border-b border-dotted border-transparent hover:border-green-700/40 rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-700/50"
    >
      {libelleAffiche}
    </button>
  );

  return (
    <div className="group/std">
      <CorpsLigneSection
        libelle={renduLibelle}
        paragraphe={estParagraphe(champ, valeurAffichee)}
        valeur={<ValeurEditable champ={champ} moteur={moteur} sobre />}
        apres={
          <>
            <button
              type="button"
              title="Ajouter un paragraphe SOUS cette ligne (ex. expliquer ce montant)"
              onClick={() =>
                moteur.commettre(idNote(champ.id, Date.now()), "", "Nouveau paragraphe - cliquer pour rédiger.", true)
              }
              className="self-center p-0.5 rounded text-neutral-300 opacity-0 group-hover/std:opacity-100 hover:text-green-700 hover:bg-green-700/5 transition-opacity"
            >
              <Plus strokeWidth={1.5} className="w-3 h-3" />
            </button>
            <button
              type="button"
              title="Retirer cette ligne du document"
              onClick={() => moteur.commettre(cleMasque, "", "1", true)}
              className="self-center p-0.5 rounded text-neutral-300 opacity-0 group-hover/std:opacity-100 hover:text-warn-700 hover:bg-warn-50 transition-opacity"
            >
              <EyeOff strokeWidth={1.5} className="w-3 h-3" />
            </button>
          </>
        }
      />
    </div>
  );
}

/** Titre de section renommable ("titre-section.<id>", vider = retour au catalogue). */
function TitreSectionEditable({ section, n, moteur }: { section: SectionOdj; n: number; moteur: MoteurAutosave }) {
  const [edition, setEdition] = useState(false);
  const cle = `${PREFIXE_TITRE_SECTION}${section.id}`;
  const local = valeurLocale(moteur.brouillons, cle);
  const titre = local !== undefined ? (local.trim() || section.titre) : section.titre;
  return (
    <h2 className="flex items-baseline gap-2 mb-2 pb-1 border-b border-green-700/40 break-after-avoid">
      <span className="text-green-700 font-bold text-[12.5px] tabular-nums">{n}.</span>
      {edition ? (
        <InputInline
          initial={titre}
          placeholder="Titre de la section"
          onAbandon={() => setEdition(false)}
          onCommit={(v) => {
            setEdition(false);
            const nouveau = v.trim();
            const avant = local ?? (section.titreReecrit ? section.titre : "");
            if (nouveau !== titre || nouveau === "") moteur.commettre(cle, avant, nouveau);
          }}
          classe="min-w-[220px] px-1 -mx-1 rounded-sm bg-green-700/5 text-[13px] font-semibold uppercase tracking-[0.04em] text-green-700 outline-none ring-1 ring-green-700/40 focus:ring-green-700"
        />
      ) : (
        <button
          type="button"
          title="Cliquer pour renommer cette section (la vider rétablit le titre d'origine)"
          onClick={() => setEdition(true)}
          className="text-[13px] font-semibold uppercase tracking-[0.04em] text-green-700 text-left rounded-sm hover:bg-green-700/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-700/50"
        >
          {titre}
        </button>
      )}
    </h2>
  );
}

/** Lignes standard MASQUEES d'une section, reintegrables d'un clic (meme motif que
 *  les points retires). L'etat local prime pour l'affichage optimiste. */
function ChampsMasques({ section, moteur }: { section: SectionOdj; moteur: MoteurAutosave }) {
  const masques = section.champs.filter((c) => {
    if (c.libre) return false;
    const local = valeurLocale(moteur.brouillons, `${PREFIXE_MASQUE}${c.id}`);
    return local !== undefined ? local.trim() !== "" : Boolean(c.masque);
  });
  if (masques.length === 0) return null;
  return (
    <div className="mt-2 pt-1.5 border-t border-dashed border-neutral-200">
      <p className="text-[11px] text-neutral-400 mb-1">Lignes retirées de cette section ({masques.length}) :</p>
      <ul className="space-y-0.5">
        {masques.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              title="Réintégrer cette ligne"
              onClick={() => moteur.commettre(`${PREFIXE_MASQUE}${c.id}`, "1", "", true)}
              className="inline-flex items-center gap-1.5 text-[11.5px] text-neutral-500 hover:text-green-700"
            >
              <Eye strokeWidth={1.5} className="w-3 h-3 shrink-0" />
              <span className="line-through decoration-neutral-300">{c.libelle}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Champ construit depuis un brouillon local "libre.*" pas encore revenu du serveur
 *  (creation optimiste : le champ apparait des le clic, sans attendre le refresh). */
function champDepuisBrouillon(champId: string, encode: string): ChampOdj {
  const { libelle, texte } = parseChampLibre(encode);
  return {
    id: champId,
    libelle: libelle || "Nouveau champ",
    source: "manuel",
    editable: true,
    saisi: true,
    libre: true,
    ...(texte ? { valeur: texte } : {}),
  };
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

  // Ajouts optimistes : les brouillons libre.*/bloc.* que le serveur ne rend pas encore.
  const idsServeur = new Set([
    ...odj.sections.flatMap((s) => s.champs.map((c) => c.id)),
    ...odj.sections.flatMap((s) => s.champs.flatMap((c) => (c.notes ?? []).map((n) => n.id))),
    ...(odj.blocsLibres ?? []).map((b) => b.id),
  ]);
  const brouillonsLocaux = { ...moteur.brouillons.enVol, ...moteur.brouillons.attente };
  const visibleLocalement = (id: string, v: string) =>
    v.trim() !== "" && !idsServeur.has(id) && !moteur.supprimes.has(id);
  const sectionsConnues = new Set(odj.sections.map((s) => s.id));
  const champsLocauxDe = (sectionId: string): ChampOdj[] =>
    Object.entries(brouillonsLocaux)
      .filter(([id, v]) => visibleLocalement(id, v) && sectionDuChampLibre(id) === sectionId)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, v]) => champDepuisBrouillon(id, v));
  const notesLocalesDe = (champAncre: string) =>
    Object.entries(brouillonsLocaux)
      .filter(([id, v]) => visibleLocalement(id, v) && ancreDeNote(id) === champAncre)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, v]) => ({ id, texte: v }));
  const blocsLocauxDe = (sectionId: string) =>
    Object.entries(brouillonsLocaux)
      .filter(([id, v]) => visibleLocalement(id, v) && sectionDuBloc(id) === sectionId)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, v]) => ({ id, texte: v }));
  // Fin de document = blocs SANS section connue (les historiques "bloc.<ts>" inclus).
  const blocsLocaux = Object.entries(brouillonsLocaux)
    .filter(([id, v]) => {
      if (!visibleLocalement(id, v) || !estBlocLibre(id)) return false;
      const s = sectionDuBloc(id);
      return s === undefined || !sectionsConnues.has(s);
    })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, v]) => ({ id, texte: v }));

  return (
    <div className="flex flex-col gap-3">
      <BarreSauvegarde moteur={moteur} />
      {/* La "feuille" : fond papier, la mise en page EXACTE du document imprimable. */}
      <div className="rounded-lg border border-line bg-white shadow-sm px-8 py-8 sm:px-10 sm:py-9">
        <DocumentOdj
          odj={odj}
          rendu={{
            valeur: (champ) => <ValeurEditable champ={champ} moteur={moteur} />,
            ligneLibre: (champ) => <ChampLibreEditable champ={champ} moteur={moteur} />,
            ligneStandard: (champ, libelle) => (
              <LigneStandardEditable champ={champ} libelle={libelle} moteur={moteur} />
            ),
            titreSection: (section, n) => <TitreSectionEditable section={section} n={n} moteur={moteur} />,
            modalite: (champVisio) => <ModaliteEditable champ={champVisio} moteur={moteur} />,
            point: (p) => <PointEditable point={p} onToggle={onTogglePoint} />,
            finPoints: <PointsRetires points={retires} onToggle={onTogglePoint} />,
            note: (n) => <BlocLibreEditable id={n.id} texteServeur={n.texte} moteur={moteur} />,
            apresLigne: (c) => (
              <>
                {notesLocalesDe(c.id).map((n) => (
                  <BlocLibreEditable key={n.id} id={n.id} texteServeur={n.texte} moteur={moteur} />
                ))}
              </>
            ),
            finSection: (sectionId) => (
              <>
                {champsLocauxDe(sectionId).map((c) => (
                  <ChampLibreEditable key={c.id} champ={c} moteur={moteur} />
                ))}
                {/* Les paragraphes s'ajoutent desormais SOUS leur ligne (bouton + de la
                    ligne) : un ajout de fin de section "va tout en bas donc ne sert a
                    rien" (retour 2026-09-01). Reste l'ajout de champ. */}
                {blocsLocauxDe(sectionId).map((b) => (
                  <BlocLibreEditable key={b.id} id={b.id} texteServeur={b.texte} moteur={moteur} />
                ))}
                <BoutonAjout
                  libelle="Ajouter un champ"
                  onClick={() =>
                    moteur.commettre(idChampLibre(sectionId, Date.now()), "", serialiserChampLibre("Nouveau champ", ""), true)
                  }
                />
                <ChampsMasques
                  section={odj.sections.find((s) => s.id === sectionId) ?? { id: sectionId, titre: "", champs: [] }}
                  moteur={moteur}
                />
              </>
            ),
            bloc: (b) => <BlocLibreEditable id={b.id} texteServeur={b.texte} moteur={moteur} />,
            finDocument: (
              <>
                {blocsLocaux.map((b) => (
                  <BlocLibreEditable key={b.id} id={b.id} texteServeur={b.texte} moteur={moteur} />
                ))}
                <BoutonAjout
                  libelle="Ajouter un paragraphe"
                  onClick={() => moteur.commettre(idBlocLibre(Date.now()), "", "Nouveau paragraphe - cliquer pour rédiger.", true)}
                />
              </>
            ),
          }}
        />
      </div>
    </div>
  );
}
