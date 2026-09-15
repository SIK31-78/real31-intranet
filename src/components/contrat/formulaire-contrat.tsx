"use client";

// Les valeurs que le gestionnaire ajuste AVANT d'editer le contrat.
//
// POURQUOI ELLES SE SAISISSENT, et ne sont pas seulement lues : l'historique des 460
// generations MYTHEC le prouve. Sur 231 coproprietes, 56 contrats portent des honoraires
// DIFFERENTS du contrat en cours - et l'ecart est presque toujours l'augmentation votee
// en AG (S065 : 15 067,50 en base, 15 369 sur le contrat, soit +2,0 % exactement).
// C'est cohérent avec l'ODJ, qui calcule deja « contrat actuel x (1 + augmentation) ».
// Pre-remplir avec le contrat en cours et ne pas laisser modifier aurait produit des
// contrats faux a chaque renouvellement avec augmentation.
//
// L'ecart s'affiche en pourcentage : le meme historique montre des saisies aberrantes
// (100 € d'honoraires, 50 000 €, 200 € de timbres). Voir « +2,0 % » ou « x 3,3 » sous le
// champ arrete la faute de frappe avant l'impression.
//
// DUREE LIBRE (Sekou, 14/09/2026) : le cycle n'est plus « debut + 1 an » impose. Debut
// et fin se saisissent, avec trois raccourcis (1 an, 2 ans, 15 mois pour une reprise) et
// le maximum legal de trois ans. Le document imprime la duree reelle.
//
// La soumission passe par une Server Action : elle TRACE l'edition (c'est ce qui fait
// passer la copro en « genere » et nourrit le recap AG) puis ouvre le document.

import { useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Choix, Field, GroupeChoix, Input } from "@/components/ui/field";
import {
  DUREES_CONTRAT_MOIS,
  finDeCycle,
  motifRefusCycle,
} from "@/lib/domain/contrat/cycle-contrat";
import { dureeContratTexte } from "@/lib/domain/contrat/duree-contrat";
import { editerContratAction } from "@/app/contrat/actions";

const JOUR_RE = /^\d{4}-\d{2}-\d{2}$/;

export function FormulaireContrat({
  coproCode,
  dateAgISO,
  debutISO,
  finISO,
  honorairesTtc,
  forfaitPostauxTtc,
  fraisPostauxReels = false,
}: {
  coproCode: string;
  dateAgISO: string;
  debutISO: string;
  finISO: string;
  /** Honoraires du contrat EN COURS : la reference d'ou se mesure l'augmentation. */
  honorairesTtc: number;
  forfaitPostauxTtc: number;
  /** Defaut : forfait. Le reel ne se propose que si le dernier contrat edite l'etait. */
  fraisPostauxReels?: boolean;
}) {
  const [ag, setAg] = useState(dateAgISO);
  const [debut, setDebut] = useState(debutISO);
  const [fin, setFin] = useState(finISO);
  const [honoraires, setHonoraires] = useState(String(honorairesTtc));
  const [timbres, setTimbres] = useState(String(forfaitPostauxTtc));
  const [reels, setReels] = useState(fraisPostauxReels);

  const saisi = Number(honoraires.replace(",", "."));
  const datesLisibles = JOUR_RE.test(ag) && JOUR_RE.test(debut) && JOUR_RE.test(fin);
  const refusCycle = datesLisibles ? motifRefusCycle(debut, fin) : null;
  const valide = Number.isFinite(saisi) && saisi > 0 && datesLisibles && refusCycle === null;
  const ecart =
    honorairesTtc > 0 && Number.isFinite(saisi) && saisi !== honorairesTtc
      ? (saisi / honorairesTtc - 1) * 100
      : null;
  // Duree telle qu'elle s'imprimera, pour que « 15 mois » se lise avant d'editer.
  const duree = datesLisibles && refusCycle === null ? dureeContratTexte(debut, fin) : null;

  // Un raccourci recalcule la fin depuis le debut. Changer le debut garde la fin en
  // place (le gestionnaire la voit et la corrige) - sauf quand elle est vide : poser un
  // debut sur un formulaire vierge propose un an, comme partout ailleurs.
  const poserDuree = (mois: number) => {
    if (JOUR_RE.test(debut)) setFin(finDeCycle(debut, mois));
  };
  const poserDebut = (v: string) => {
    setDebut(v);
    if (fin === "" && JOUR_RE.test(v)) setFin(finDeCycle(v));
  };
  const dureeActive = (mois: number) => JOUR_RE.test(debut) && finDeCycle(debut, mois) === fin;

  return (
    <form action={editerContratAction} className="flex flex-col gap-3">
      <input type="hidden" name="copro" value={coproCode} />
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Date de l'assemblée">
          <Input type="date" name="ag" value={ag} onChange={(e) => setAg(e.target.value)} largeur="auto" />
        </Field>
        <Field label="Début du contrat">
          <Input type="date" name="debut" value={debut} onChange={(e) => poserDebut(e.target.value)} largeur="auto" />
        </Field>
        <Field label="Fin du contrat">
          <Input type="date" name="fin" value={fin} onChange={(e) => setFin(e.target.value)} largeur="auto" />
        </Field>
        <div className="flex items-center gap-1 pb-1" role="group" aria-label="Durée du contrat">
          {DUREES_CONTRAT_MOIS.map((d) => (
            <Button
              key={d.mois}
              type="button"
              variant={dureeActive(d.mois) ? "secondary" : "ghost"}
              size="sm"
              onClick={() => poserDuree(d.mois)}
              title={"aide" in d ? d.aide : undefined}
            >
              {d.libelle}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Honoraires de gestion (TTC)">
          <Input
            type="text"
            name="honoraires"
            inputMode="decimal"
            value={honoraires}
            onChange={(e) => setHonoraires(e.target.value)}
            largeur="auto"
            className="tabular-nums"
          />
        </Field>
        {/* Frais postaux : forfait par defaut ; au reel, le § 7.1.5 change et le montant
            n'a plus lieu d'etre (modele du patron, 15/09/2026). */}
        <GroupeChoix label="Frais postaux">
          <Choix type="radio" name="frais" value="forfait" label="Forfait" checked={!reels} onChange={() => setReels(false)} />
          <Choix type="radio" name="frais" value="reels" label="Frais réels" checked={reels} onChange={() => setReels(true)} />
        </GroupeChoix>
        {!reels && (
          <Field label="Forfait timbres (TTC)">
            <Input
              type="text"
              name="timbres"
              inputMode="decimal"
              value={timbres}
              onChange={(e) => setTimbres(e.target.value)}
              largeur="auto"
              className="tabular-nums"
            />
          </Field>
        )}
        <Button type="submit" variant="primary" disabled={!valide}>
          <FileText strokeWidth={1.5} />
          Éditer le contrat
        </Button>
      </div>

      {refusCycle !== null && (
        <p className="text-body text-err-700">Cycle refusé : {refusCycle}.</p>
      )}
      {duree !== null && (
        <p className="text-body text-ink-2">
          Durée imprimée : <span className="font-medium">{duree}</span>.
        </p>
      )}
      {ecart !== null && (
        <p className={`text-body ${Math.abs(ecart) > 20 ? "text-warn-700" : "text-ink-2"}`}>
          {ecart > 0 ? "Augmentation" : "Baisse"} de{" "}
          <span className="font-medium tabular-nums">
            {Math.abs(ecart).toFixed(1).replace(".", ",")} %
          </span>{" "}
          par rapport au contrat en cours
          {Math.abs(ecart) > 20 && " — écart inhabituel, à vérifier avant d'éditer"}.
        </p>
      )}
    </form>
  );
}
