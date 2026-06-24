import {
  progressionSection,
  type Role,
  type StatutItem,
  type SupervisionAg,
} from "@/lib/domain/supervision-ag";
import { SupervisionHeader } from "./supervision-header";
import { BandeauConclue } from "./bandeau-conclue";
import { ProgressionGlobale } from "./progression-globale";
import { ChecklistSection } from "./checklist-section";

type SupervisionVueProps = {
  supervision: SupervisionAg;
  role: Role;
  aujourdhuiISO: string;
  onCocher: (itemId: string, statut: StatutItem) => Promise<void>;
  onCommenter: (itemId: string, commentaire: string) => Promise<void>;
  onConclure: () => Promise<void>;
};

export function SupervisionVue({
  supervision,
  role,
  aujourdhuiISO,
  onCocher,
  onCommenter,
  onConclure,
}: SupervisionVueProps) {
  const lectureSeule =
    supervision.statut === "conclue_archivee" || role === "lecture";
  // Mode expert replie : seule la PHASE EN COURS (premiere section non terminee) est
  // ouverte au chargement. Fini le mur de 40 cases (decision Sekou 2026-06-22).
  const sectionCourante = supervision.sections.find((s) => progressionSection(s).pourcentage < 100);
  // Date ISO de l'AG, extraite de l'id "CODE__YYYY-MM-DD" (null si AG sans date =
  // sentinelle) -> alimente la colonne d'echeances reglementaires des items (B4).
  const sep = supervision.id.indexOf("__");
  const agDateBrute = sep >= 0 ? supervision.id.slice(sep + 2) : null;
  const agDateISO = agDateBrute && agDateBrute !== "0001-01-01" ? agDateBrute : null;
  return (
    <div className="flex flex-col gap-4">
      <SupervisionHeader
        supervision={supervision}
        role={role}
        onConclure={onConclure}
      />
      <BandeauConclue supervision={supervision} />
      <ProgressionGlobale supervision={supervision} />
      <div className="flex flex-col gap-3">
        {supervision.sections.map((section) => (
          <ChecklistSection
            key={section.id}
            section={section}
            agDateISO={agDateISO}
            aujourdhuiISO={aujourdhuiISO}
            lectureSeule={lectureSeule}
            ouvertParDefaut={section.id === sectionCourante?.id}
            onCocher={onCocher}
            onCommenter={onCommenter}
          />
        ))}
      </div>
    </div>
  );
}
