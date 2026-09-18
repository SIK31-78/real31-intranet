// Bloc d'accueil « trousseaux en retard sur vos copropriétés » : rien si vide. Chaque
// ligne mene au trousseau (le geste attendu : relancer l'entreprise ou enregistrer le retour).

import { KeySquare } from "lucide-react";
import { Rows, Row } from "@/components/ui/list-rows";
import { Badge } from "@/components/ui/badge";
import { Aide } from "@/components/ui/aide";
import { formatDateLongue } from "@/lib/format-date";
import type { TrousseauResume } from "@/lib/services/cles/lecture";

export function AlerteClesEnRetard({ lignes }: { lignes: Array<{ resume: TrousseauResume; coproCode: string }> }) {
  if (lignes.length === 0) return null;
  return (
    <section aria-labelledby="cles-en-retard" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4 min-h-7">
        <h2 id="cles-en-retard" className="flex items-center gap-2 text-title font-semibold tracking-tight text-err-700">
          <KeySquare strokeWidth={1.5} className="h-4 w-4 shrink-0" aria-hidden />
          Trousseaux en retard sur vos copropriétés
          <span className="text-body font-normal tabular-nums">{lignes.length}</span>
        </h2>
        <Aide titre="Pourquoi cette alerte">
          Un trousseau de vos copropriétés est chez une entreprise au-delà de la date de retour prévue. Depuis le trousseau : reporter la date si le chantier continue, ou enregistrer le retour.
        </Aide>
      </div>
      <Rows>
        {lignes.map(({ resume, coproCode }) => {
          const p = resume.pret!;
          const bien = resume.biens.find((b) => b.coproCode === coproCode);
          return (
            <Row
              key={resume.trousseau.id}
              href={`/cles/trousseaux/${resume.trousseau.id}`}
              ton="err"
              avant={resume.trousseau.numero}
              principal={bien?.libelle ?? coproCode}
              secondaire={<>{p.type === "interne" ? "en interne" : p.entrepriseNom}{p.contact?.nom ? ` (${p.contact.nom})` : ""} · retour prévu le {formatDateLongue(p.retourPrevuLeISO)}</>}
              droite={<Badge ton="err" dot>{resume.joursRetard} j de retard</Badge>}
            />
          );
        })}
      </Rows>
    </section>
  );
}
