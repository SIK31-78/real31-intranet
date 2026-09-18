// Telecharger un PDF produit par le serveur, depuis le navigateur : on attend les octets
// puis on declenche l'enregistrement. Partage par le bouton PDF et le formulaire du contrat.

export type ResultatTelechargement = { ok: true; nom: string } | { ok: false; erreur: string };

export async function telechargerPdf(href: string): Promise<ResultatTelechargement> {
  try {
    const r = await fetch(href, { credentials: "same-origin" });
    if (!r.ok) return { ok: false, erreur: (await r.text()).slice(0, 300) || `Téléchargement impossible (${r.status}).` };
    const blob = await r.blob();
    const nom = nomDepuisEntete(r.headers.get("content-disposition")) ?? "contrat.pdf";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { ok: true, nom };
  } catch {
    return { ok: false, erreur: "Téléchargement impossible : le serveur n'a pas répondu." };
  }
}

/** Le nom de fichier de l'en-tete Content-Disposition, version UTF-8 (`filename*`) d'abord. */
export function nomDepuisEntete(entete: string | null): string | null {
  if (!entete) return null;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(entete);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1]!);
    } catch {
      /* on retombe sur filename= */
    }
  }
  const ascii = /filename="([^"]+)"/i.exec(entete);
  return ascii ? ascii[1]! : null;
}
