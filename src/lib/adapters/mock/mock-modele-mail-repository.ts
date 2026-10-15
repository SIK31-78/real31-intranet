// Adapter mock des modèles de mail : STORE au niveau du module (vit le temps du serveur de
// dev). Vide au départ : le compositeur montre alors les modèles de secours du code.

import type { ModeleMailStocke } from "@/lib/domain/modeles-mail";
import type { ModeleMailRepository, SaisieModeleMail } from "@/lib/ports/modele-mail-repository";

const STORE = new Map<string, ModeleMailStocke>();
let seq = 0;

const depuis = (id: string, s: SaisieModeleMail): ModeleMailStocke => ({
  id,
  titre: s.titre,
  sujet: s.sujet,
  corps: s.corps,
  agence: s.agence,
  actif: s.actif,
  ...(s.auteurEmail ? { auteurEmail: s.auteurEmail } : {}),
  majLe: new Date().toISOString(),
});

export class MockModeleMailRepository implements ModeleMailRepository {
  async listerTous(): Promise<ModeleMailStocke[]> {
    return [...STORE.values()];
  }
  async trouver(id: string): Promise<ModeleMailStocke | null> {
    return STORE.get(id) ?? null;
  }
  async creer(s: SaisieModeleMail): Promise<ModeleMailStocke> {
    const m = depuis(`mm-${++seq}`, s);
    STORE.set(m.id, m);
    return m;
  }
  async modifier(id: string, s: SaisieModeleMail): Promise<ModeleMailStocke | null> {
    if (!STORE.has(id)) return null;
    const m = depuis(id, s);
    STORE.set(id, m);
    return m;
  }
  async supprimer(id: string): Promise<boolean> {
    return STORE.delete(id);
  }
}
