// Adapter "fichier" du cockpit Mes emails : lit le triage reel produit par
// assistant-ia (pipeline Mistral sur l'export d'archive) depuis un JSON local.
// Le fichier contient de la PII (vrais coproprietaires) : il est git-ignore et
// n'existe que sur le poste. S'il est absent, le routeur retombe sur le mock.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { MesEmailsProvider } from "@/lib/ports/mes-emails-provider";
import type { MesEmails } from "@/lib/domain/mes-emails";

const CHEMIN = join(process.cwd(), "data", "mes-emails-triage.json");

/** Vrai si un triage reel est present sur le poste (sinon : mock). */
export function triageFichierPresent(): boolean {
  return existsSync(CHEMIN);
}

export class FichierMesEmailsProvider implements MesEmailsProvider {
  async getMesEmails(): Promise<MesEmails> {
    return JSON.parse(readFileSync(CHEMIN, "utf8")) as MesEmails;
  }
}
