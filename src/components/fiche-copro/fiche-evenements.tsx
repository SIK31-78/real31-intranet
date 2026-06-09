import { grouperParJour } from "@/lib/domain/calendrier";
import type { Evenement } from "@/lib/domain/calendrier";
import type { Severite } from "@/lib/domain/commun";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateLongue } from "@/lib/format-date";

const SEVERITE_TON: Record<Severite, "err" | "warn" | "ok"> = {
  late: "err",
  soon: "warn",
  ok: "ok",
};

const STATUT_LABEL: Record<Evenement["statut"], string> = {
  planifiee: "Planifié",
  convoquee: "Convoqué",
  tenue: "Tenu",
  annulee: "Annulé",
};

// Onglet "Evenements" de la fiche : les prochains evenements de la copro, groupes par jour.
export function FicheEvenements({ evenements }: { evenements: Evenement[] }) {
  if (evenements.length === 0) {
    return (
      <Card>
        <p className="px-4 py-8 text-[13px] text-ink-3 text-center">
          Aucun événement à venir pour cette copropriété.
        </p>
      </Card>
    );
  }

  const jours = grouperParJour(evenements);

  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-line">
        {jours.map((jour) => (
          <li key={jour.date} className="px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.5px] text-ink-3 mb-2">
              {formatDateLongue(jour.date)}
            </p>
            <div className="flex flex-col gap-2">
              {jour.evenements.map((e) => (
                <div key={e.id} className="flex items-center gap-3">
                  {e.heure && (
                    <span className="font-mono text-[11px] text-ink-3 w-10 shrink-0">{e.heure}</span>
                  )}
                  <Badge ton="outline" className="font-mono shrink-0">{e.type}</Badge>
                  <span className="text-[13px] text-ink flex-1 truncate">{e.coproNomCourt}</span>
                  <span className="text-[11px] text-ink-3 shrink-0">{STATUT_LABEL[e.statut]}</span>
                  {e.jalon && (
                    <Badge ton={SEVERITE_TON[e.jalon.severite]} className="font-mono shrink-0">
                      {e.jalon.label}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
