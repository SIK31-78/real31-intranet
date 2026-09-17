// Une reponse HTTP qui porte un PDF a telecharger. Le nom de fichier est accentue (« Contrat
// de syndic - 2 av de l'Abbé Roussel - … ») : `filename*` en UTF-8 pour les navigateurs
// d'aujourd'hui, `filename` en ASCII en secours.

export function reponsePdf(pdf: Buffer, nom: string): Response {
  const ascii = nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/"/g, "'");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nom)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
