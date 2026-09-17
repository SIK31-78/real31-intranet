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
//
// Ce fichier est l'orchestrateur : le moteur d'auto-save (use-autosave-odj), les
// ajouts optimistes et la composition. Chaque morceau editable a son fichier ici.

import type { ChampOdj, Odj } from "@/lib/domain/odj";
import {
  ancreDeNote,
  estBlocLibre,
  idBlocLibre,
  idChampLibre,
  sectionDuBloc,
  sectionDuChampLibre,
  serialiserChampLibre,
} from "@/lib/domain/odj-libre";
import { DocumentOdj } from "@/components/odj/document-odj";
import { useAutosaveOdj } from "./use-autosave-odj";
import { BarreSauvegarde } from "./barre-sauvegarde";
import { ValeurEditable, ModaliteEditable } from "./valeur-editable";
import { ChampLibreEditable, BlocLibreEditable, BoutonAjout, champDepuisBrouillon } from "./ajouts-libres";
import { PointEditable, PointsRetires } from "./points-editables";
import { LigneStandardEditable, TitreSectionEditable, ChampsMasques } from "./lignes-section-editables";

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
      <div className="rounded-md border border-line bg-white px-8 py-8 sm:px-10 sm:py-9">
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
