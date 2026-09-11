"use client";

// Les trois valeurs que le gestionnaire ajuste AVANT d'editer le contrat.
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

import { useState } from "react";
import { FileText } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function FormulaireContrat({
  coproCode,
  dateAgISO,
  honorairesTtc,
  forfaitPostauxTtc,
}: {
  coproCode: string;
  dateAgISO: string;
  /** Honoraires du contrat EN COURS : la reference d'ou se mesure l'augmentation. */
  honorairesTtc: number;
  forfaitPostauxTtc: number;
}) {
  const [ag, setAg] = useState(dateAgISO);
  const [honoraires, setHonoraires] = useState(String(honorairesTtc));
  const [timbres, setTimbres] = useState(String(forfaitPostauxTtc));

  const saisi = Number(honoraires.replace(",", "."));
  const valide = Number.isFinite(saisi) && saisi > 0 && /^\d{4}-\d{2}-\d{2}$/.test(ag);
  const ecart =
    honorairesTtc > 0 && Number.isFinite(saisi) && saisi !== honorairesTtc
      ? (saisi / honorairesTtc - 1) * 100
      : null;

  const href =
    `/contrat/${coproCode}/imprimer?ag=${encodeURIComponent(ag)}` +
    `&honoraires=${encodeURIComponent(honoraires.replace(",", "."))}` +
    `&timbres=${encodeURIComponent(timbres.replace(",", "."))}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Date de l'assemblée">
          <Input type="date" value={ag} onChange={(e) => setAg(e.target.value)} largeur="auto" />
        </Field>
        <Field label="Honoraires de gestion (TTC)">
          <Input
            type="text"
            inputMode="decimal"
            value={honoraires}
            onChange={(e) => setHonoraires(e.target.value)}
            largeur="auto"
            className="tabular-nums"
          />
        </Field>
        <Field label="Forfait timbres (TTC)">
          <Input
            type="text"
            inputMode="decimal"
            value={timbres}
            onChange={(e) => setTimbres(e.target.value)}
            largeur="auto"
            className="tabular-nums"
          />
        </Field>
        <ButtonLink href={valide ? href : "#"} variant="primary" aria-disabled={!valide}>
          <FileText strokeWidth={1.5} />
          Éditer le contrat
        </ButtonLink>
      </div>

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
    </div>
  );
}
