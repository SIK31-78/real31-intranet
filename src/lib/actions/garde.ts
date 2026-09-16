// Le preambule commun d'une Server Action : valider (zod), resoudre la session, executer,
// rendre un `Res`. Les gardes METIER (role, perimetre) restent dans le corps de l'action :
// ce helper n'en change aucune, il retire les six lignes recopiees partout.
//
// Un refus metier se dit avec `throw new Refus("…")` : le message est rendu tel quel. Toute
// autre exception passe par messageUtilisateur (technique -> phrase neutre + Sentry).

import type { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { echec, echecDepuis, type Res } from "./resultat";

export class Refus extends Error {}

type Donnees<R> = R extends void ? undefined : R;

export async function actionGestionnaire<S extends z.ZodTypeAny, R>(
  schema: S,
  input: unknown,
  contexte: string,
  corps: (donnees: z.output<S>, g: Gestionnaire) => Promise<R>,
): Promise<Res<Donnees<R>>> {
  const p = schema.safeParse(input);
  if (!p.success) return echec("Saisie invalide.");
  const g = await getGestionnaireCourant();
  if (!g) return echec("Session expirée.");
  try {
    const donnees = await corps(p.data, g);
    return donnees === undefined ? { ok: true } : { ok: true, donnees: donnees as Donnees<R> };
  } catch (e) {
    if (e instanceof Refus) return echec(e.message);
    return echecDepuis(e, contexte);
  }
}
