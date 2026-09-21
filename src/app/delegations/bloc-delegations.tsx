// Le bloc « delegations » : le formulaire, puis les delegations en cours et a venir, puis
// les terminees. Partage par /delegations (chacun) et Collaborateurs (la direction).

import { formatJour } from "@/lib/services/facturation/format";
import { niveauEcriture } from "@/lib/domain/perimetre-ecriture";
import type { EcranDelegations } from "@/lib/services/delegations/delegations";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Rows, Row } from "@/components/ui/list-rows";
import { FormulaireDelegation } from "./formulaire-delegation";
import { RetirerDelegation } from "./retirer-delegation";

const LIBELLE_PORTEE = { portefeuille: "le portefeuille", agence: "l'agence", copro: "la copropriété" } as const;

export function BlocDelegations({ ecran, moi }: { ecran: EcranDelegations; moi: string }) {
  const niveau = niveauEcriture(ecran.auteur);
  const actives = ecran.delegations.filter((d) => d.etat !== "passee");
  const passees = ecran.delegations.filter((d) => d.etat === "passee");
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardBody>
          <FormulaireDelegation
            moi={moi}
            collaborateurs={ecran.collaborateurs}
            titulairesPossibles={ecran.titulairesPossibles}
            agences={ecran.agences}
            peutDeleguerAgence={niveau !== "portefeuille"}
          />
        </CardBody>
      </Card>

      {actives.length === 0 ? (
        <EmptyState>Aucune délégation en cours.</EmptyState>
      ) : (
        <Rows>
          {actives.map((d) => (
            <Row
              key={d.id}
              avant={<Badge ton={d.etat === "active" ? "ok" : "neutral"} dot>{d.etat === "active" ? "active" : "à venir"}</Badge>}
              principal={`${d.de.nomComplet} → ${d.a.nomComplet}`}
              secondaire={`sur ${LIBELLE_PORTEE[d.portee]}${d.portee === "agence" ? ` ${d.agenceCode}` : d.portee === "copro" ? ` ${d.coproCode}` : ""} · du ${formatJour(d.depuisISO)}${d.jusquaISO ? ` au ${formatJour(d.jusquaISO)}` : ", sans fin"}${d.motif ? ` · ${d.motif}` : ""}`}
              droite={d.retirable ? <RetirerDelegation id={d.id} /> : undefined}
            />
          ))}
        </Rows>
      )}

      {passees.length > 0 && (
        <details className="text-body">
          <summary className="cursor-pointer text-ink-2">{passees.length} terminée{passees.length > 1 ? "s" : ""}</summary>
          <div className="mt-2">
            <Rows>
              {passees.map((d) => (
                <Row
                  key={d.id}
                  avant={<Badge ton="neutral">terminée</Badge>}
                  principal={`${d.de.nomComplet} → ${d.a.nomComplet}`}
                  secondaire={`du ${formatJour(d.depuisISO)} au ${formatJour(d.jusquaISO ?? "")}${d.motif ? ` · ${d.motif}` : ""}`}
                />
              ))}
            </Rows>
          </div>
        </details>
      )}
    </div>
  );
}
