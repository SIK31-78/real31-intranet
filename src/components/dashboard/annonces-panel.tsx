import { Megaphone } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Annonce } from "@/lib/domain/annonce";

// Espace "Annonces" de l'accueil : les messages importants du reseau (direction),
// pilotes depuis /admin/annonces (super-admin). L'appelant ne le rend que s'il y a
// au moins une annonce : une carte vide n'apprend rien.
export function AnnoncesPanel({ annonces }: { annonces: Annonce[] }) {
  if (annonces.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Megaphone strokeWidth={1.5} />
          Annonces
        </CardTitle>
      </CardHeader>
      <ul className="divide-y divide-line">
        {annonces.map((a) => (
          <li key={a.id} className="flex items-start gap-2.5 px-4 py-2.5">
            <span
              className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${a.niveau === "important" ? "bg-err-500" : "bg-info-500"}`}
              aria-hidden
            />
            <div className="min-w-0 flex-1 text-body">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-ink">{a.titre}</span>
                {a.niveau === "important" && <Badge ton="err">Important</Badge>}
              </div>
              {a.corps && <p className="mt-0.5 whitespace-pre-wrap text-ink-2">{a.corps}</p>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
