import { Megaphone } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Annonce } from "@/lib/domain/annonce";

// Espace "Annonces" de l'accueil : les messages importants du reseau (direction),
// pilotes depuis /admin/annonces (super-admin). Etat vide propre si aucune annonce.
export function AnnoncesPanel({ annonces }: { annonces: Annonce[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Megaphone strokeWidth={1.5} className="w-4 h-4 text-ink-3" />
          Annonces
        </CardTitle>
      </CardHeader>
      {annonces.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-[13px] text-ink-3">Aucune annonce pour le moment.</p>
          <p className="text-[12px] text-ink-4 mt-0.5">Les annonces importantes du réseau apparaîtront ici.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {annonces.map((a) => (
            <li key={a.id} className="flex items-start gap-2.5 px-4 py-3">
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  a.niveau === "important" ? "bg-err-500" : "bg-info-500"
                }`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13.5px] font-medium text-ink">{a.titre}</span>
                  {a.niveau === "important" && <Badge ton="err">Important</Badge>}
                </div>
                {a.corps && <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] text-ink-2">{a.corps}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
