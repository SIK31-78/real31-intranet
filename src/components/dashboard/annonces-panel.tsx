import { Megaphone } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

// Espace "Annonces" du dashboard : les messages importants du reseau (direction).
// Placeholder pour l'instant (systeme d'annonces a developper, cf. ROADMAP).
export function AnnoncesPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Megaphone strokeWidth={1.5} className="w-4 h-4 text-ink-3" />
          Annonces
        </CardTitle>
      </CardHeader>
      <div className="px-4 py-6 text-center">
        <p className="text-[13px] text-ink-3">Aucune annonce pour le moment.</p>
        <p className="text-[12px] text-ink-4 mt-0.5">Les annonces importantes du réseau apparaîtront ici.</p>
      </div>
    </Card>
  );
}
