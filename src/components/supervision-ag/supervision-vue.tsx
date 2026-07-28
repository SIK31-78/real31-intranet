"use client";

import { useMemo, useState } from "react";
import {
  phaseTerminee,
  type ItemChecklist,
  type Role,
  type StatutItem,
  type SupervisionAg,
} from "@/lib/domain/supervision-ag";
import type { CycleAg } from "@/lib/domain/cycle-ag";
import { SupervisionHeader } from "./supervision-header";
import { FriseCycleAg } from "./frise-cycle-ag";
import { BandeauConclue } from "./bandeau-conclue";
import { ProgressionGlobale } from "./progression-globale";
import { ChecklistSection } from "./checklist-section";
import { ModuleModal, type ModuleSupervision } from "./module-modal";

type SupervisionVueProps = {
  supervision: SupervisionAg;
  /** Cycle AG courant de la copro (frise + action du moment) ; null si copro introuvable. */
  cycle: CycleAg | null;
  role: Role;
  aujourdhuiISO: string;
  /** Pennylane branche cote serveur (transmis aux modules ouverts en modale). */
  pennylaneActif: boolean;
  /** Creneau REEL du CS preparatoire (jour + debut + fin), issu de sa confirmation sur la
   *  fiche copro. Pre-remplit la facturation des honoraires CS ouverte depuis la
   *  checklist : le gestionnaire n'a plus a retrouver l'horaire de memoire. */
  creneauCsSuggere?: { jour: string; debut: string; fin?: string };
  onCocher: (itemId: string, statut: StatutItem) => Promise<void>;
  onCommenter: (itemId: string, commentaire: string) => Promise<void>;
  onConclure: () => Promise<void>;
};

export function SupervisionVue({
  supervision,
  cycle,
  role,
  aujourdhuiISO,
  pennylaneActif,
  creneauCsSuggere,
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
  // precedente est terminee). `derniereForcee` = la phase a DEPLOYER : au
  // deverrouillage, elle s'ouvre et les autres se REPLIENT (gain de clics, Sekou
  // 2026-07-28) - applique par remontage (cle epoch = forcees.size).
  const [forcees, setForcees] = useState<Set<string>>(new Set());
  const [derniereForcee, setDerniereForcee] = useState<string | null>(null);
  const deverrouiller = (id: string) => {
    setForcees((prev) => new Set(prev).add(id));
    setDerniereForcee(id);
  };

  // Module interne ouvert en modale (recap / depassement CS), pre-scope a la copro.
  // Jamais en lecture seule (AG conclue / role lecture) : ces modales ecrivent.
  const [moduleOuvert, setModuleOuvert] = useState<ModuleSupervision | null>(null);
  const ouvrirModule = (item: ItemChecklist) => {
    if (lectureSeule || !item.module) return;
    setModuleOuvert(item.module);
  };

  return (
    <div className="flex flex-col gap-4">
      <SupervisionHeader supervision={supervision} role={role} onConclure={onConclure} />
      {cycle && <FriseCycleAg cycle={cycle} />}
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
            onOuvrirModule={ouvrirModule}
          />
        )}
        {phasesAG.map((section, i) => (
          <ChecklistSection
            // Cle "epoch" (nb de deverrouillages) : chaque Deverrouiller remonte les
            // sections avec leurs nouveaux defauts -> la phase forcee se DEPLOIE et
            // les autres (dont la precedente) se REPLIENT, le tout dans le meme clic.
            // Sans deverrouillage force (vie normale) : cle stable, courante ouverte.
            key={`${section.id}-${forcees.size}`}
            section={section}
            agDateISO={agDateISO}
            aujourdhuiISO={aujourdhuiISO}
            lectureSeule={lectureSeule}
            ouvertParDefaut={derniereForcee ? section.id === derniereForcee : i === indexCourante}
            verrouille={i > indexCourante && !forcees.has(section.id)}
            onDeverrouiller={() => deverrouiller(section.id)}
            onCocher={onCocher}
            onCommenter={onCommenter}
            onOuvrirModule={ouvrirModule}
          />
        ))}
      </div>
      {moduleOuvert && (
        <ModuleModal
          module={moduleOuvert}
          copro={supervision.copro}
          agDateISO={agDateISO}
          {...(creneauCsSuggere ? { creneauCsSuggere } : {})}
          pennylaneActif={pennylaneActif}
          onFermer={() => setModuleOuvert(null)}
        />
      )}
    </div>
  );
}
