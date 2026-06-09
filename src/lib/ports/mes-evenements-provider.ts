// Port (contrat) de l'ecran "Mes evenements" : agregat de pilotage du gestionnaire.
// Vue derivee (jalons + evenements + referentiel) ; cote reel, le service composera
// plusieurs sources. Ne depend que du domaine.

import type { MesEvenements } from "@/lib/domain/mes-evenements";

export interface MesEvenementsProvider {
  getMesEvenements(gestionnaireId: string): Promise<MesEvenements>;
}
