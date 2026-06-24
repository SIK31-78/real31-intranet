"use client";

import { useMemo, useState } from "react";
import {
  phaseTerminee,
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

  // Date ISO de l'AG, extraite de l'id "CODE__YYYY-MM-DD" (null si AG sans date =
  // sentinelle) -> alimente la colonne d'echeances reglementaires des items (B4).
  const sep = supervision.id.indexOf("__");
  const agDateBrute = sep >= 0 ? supervision.id.slice(sep + 2) : null;
  const agDateISO = agDateBrute && agDateBrute !== "0001-01-01" ? agDateBrute : null;

  // Parcours par paliers (B1). La phase "Verifications comptables" est EPINGLEE en
  // tete, hors-paliers (ne verrouille rien, n'est verrouillee par rien, repliee par
  // defaut = "vue comptable"). Les autres phases forment le parcours chronologique.
  const phaseCompta = supervision.sections.find((s) => s.id === "compta");
  const phasesAG = useMemo(
    () => supervision.sections.filter((s) => s.id !== "compta"),
    [supervision.sections],
  );

  // Phase AG COURANTE = la premiere non terminee. Les precedentes sont faites (repliees,
  // rouvrables), les suivantes verrouillees-grisees. Tout fait -> aucune verrouillee.
  const indexCourante = useMemo(() => {
    const i = phasesAG.findIndex((s) => !phaseTerminee(s));
    return i === -1 ? phasesAG.length : i;
  }, [phasesAG]);

  // Anti-blocage : phases deverrouillees a la main malgre le palier (l'utilisateur
  // assume). Etat de session (la phase se deverrouille de toute facon quand la
  // precedente est terminee).
  const [forcees, setForcees] = useState<Set<string>>(new Set());
  const deverrouiller = (id: string) =>
    setForcees((prev) => new Set(prev).add(id));

  return (
    <div className="flex flex-col gap-4">
      <SupervisionHeader supervision={supervision} role={role} onConclure={onConclure} />
      <BandeauConclue supervision={supervision} />
      <ProgressionGlobale supervision={supervision} />
      <div className="flex flex-col gap-3">
        {phaseCompta && (
          <ChecklistSection
            section={phaseCompta}
            agDateISO={agDateISO}
            aujourdhuiISO={aujourdhuiISO}
            lectureSeule={lectureSeule}
            ouvertParDefaut={false}
            epingle
            onCocher={onCocher}
            onCommenter={onCommenter}
          />
        )}
        {phasesAG.map((section, i) => (
          <ChecklistSection
            key={section.id}
            section={section}
            agDateISO={agDateISO}
            aujourdhuiISO={aujourdhuiISO}
            lectureSeule={lectureSeule}
            ouvertParDefaut={i === indexCourante}
            verrouille={i > indexCourante && !forcees.has(section.id)}
            onDeverrouiller={() => deverrouiller(section.id)}
            onCocher={onCocher}
            onCommenter={onCommenter}
          />
        ))}
      </div>
    </div>
  );
}
