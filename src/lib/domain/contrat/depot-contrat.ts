// Où le contrat édité se range dans SharePoint (REA-116). MYTHEC le déposait dans le dossier
// d'AG de la copropriété ; l'intranet l'avait perdu, les équipes téléchargeaient puis
// « imprimaient en PDF » pour le ranger (5 Mo, plus de texte : constat du 12/10/2026).
//
// Le dossier AG de chaque copro est connu (Copropriete.sharepointUrl, ex.
// « https://real31france.sharepoint.com/sites/copro/LGC/Bleuets%202%20bis/AG »). Le
// contrat va dans « <AG>/<année de l'AG>/Docs pour convocation/05 - contrat de syndic.pdf ».
// Pur : la résolution bibliothèque + chemin se fait sur la liste des bibliothèques du site,
// passée par l'adaptateur.

export const NOM_FICHIER_CONTRAT = "05 - contrat de syndic.pdf";
export const DOSSIER_CONVOCATION = "Docs pour convocation";

/** Les sous-dossiers du dossier AG où ranger le contrat : l'année de l'AG, puis la convocation. */
export function sousDossiersContrat(dateAgISO: string): string[] {
  return [dateAgISO.slice(0, 4), DOSSIER_CONVOCATION];
}

/** Le site SharePoint d'un lien de dossier : hôte et chemin du site (« /sites/copro »). */
export function siteDepuisUrl(url: string): { hote: string; cheminSite: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const m = /^\/(sites|teams)\/[^/]+/i.exec(decodeURIComponent(u.pathname));
  if (u.protocol !== "https:" || !m) return null;
  return { hote: u.hostname, cheminSite: m[0] };
}

function normaliser(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.toLowerCase()}${decodeURIComponent(u.pathname).replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * La bibliothèque qui contient le dossier, et le chemin du dossier dans cette bibliothèque.
 * Retient la bibliothèque dont l'adresse est le plus long préfixe du lien (une bibliothèque
 * « LGC » ne doit pas capter « LGC2 ») ; null si aucune ne le contient.
 */
export function resoudreDossier(
  dossierUrl: string,
  bibliotheques: readonly { id: string; webUrl: string }[],
): { driveId: string; chemin: string[] } | null {
  const cible = normaliser(dossierUrl);
  if (!cible) return null;
  const candidates = bibliotheques
    .map((b) => ({ id: b.id, base: normaliser(b.webUrl) }))
    .filter((b) => b.base && (cible === b.base || cible.startsWith(`${b.base}/`)))
    .sort((a, b) => b.base.length - a.base.length);
  const retenue = candidates[0];
  if (!retenue) return null;
  // Le chemin garde la casse du lien d'origine : on découpe le lien, pas la version normalisée.
  const segments = decodeURIComponent(new URL(dossierUrl).pathname).replace(/\/+$/, "").split("/").filter(Boolean);
  const profondeurBase = retenue.base.split("/").length - 1; // l'hôte n'est pas un segment
  return { driveId: retenue.id, chemin: segments.slice(profondeurBase) };
}
