// Adapter sortant "no-op" : ne cree rien (pas de Graph). Permet de cliquer le
// bouton sans erreur quand MAIL_SOURCE != graph (dev / demo sans boite reelle).

import type { MailOutboundProvider } from "@/lib/ports/mail-outbound-provider";

export class NoopMailOutboundProvider implements MailOutboundProvider {
  async citationReponse(): Promise<{ citationHtml: string; sujet: string }> {
    return { citationHtml: "", sujet: "" };
  }

  async creerBrouillon(p: { boite: string; internetMessageId: string; corps: string }): Promise<void> {
    console.log(`[mail-outbound:noop] brouillon simule pour ${p.internetMessageId} (${p.corps.length} car.)`);
  }

  async creerTransfert(p: { boite: string; internetMessageId: string; a: string[]; sujet: string; commentaire: string }): Promise<{ webLink?: string; internetMessageId?: string }> {
    console.log(`[mail-outbound:noop] transfert simule de ${p.internetMessageId} vers ${p.a.join(", ")} : ${p.sujet}`);
    return {};
  }

  async transferer(p: { internetMessageId: string; a: string[]; envoyer: boolean }): Promise<{ webLink?: string }> {
    // Pas de PII en log (RGPD) : nombre de destinataires seulement.
    console.log(`[mail-outbound:noop] transfert ${p.envoyer ? "envoye" : "en brouillon"} simule pour ${p.internetMessageId} (${p.a.length} dest.)`);
    return {};
  }

  async envoyer(p: {
    boite: string;
    internetMessageId: string;
    corps: string;
    a: string[];
    cc: string[];
    cci: string[];
  }): Promise<void> {
    // Pas de PII en log (RGPD) : seulement le nombre de destinataires, pas les adresses.
    console.log(`[mail-outbound:noop] envoi simule pour ${p.internetMessageId} (${p.a.length} dest.)`);
  }

  async creerBrouillonReponse(p: { internetMessageId: string; a: string[] }): Promise<{ webLink?: string }> {
    console.log(`[mail-outbound:noop] brouillon de reponse simule pour ${p.internetMessageId} (${p.a.length} dest.)`);
    return {};
  }

  async preparerBrouillonReponse(p: { internetMessageId: string; a: string[] }): Promise<{ id: string }> {
    console.log(`[mail-outbound:noop] brouillon de reponse simule pour ${p.internetMessageId} (${p.a.length} dest.)`);
    return { id: "noop-brouillon" };
  }

  async ajouterPieceJointe(p: { octets: Uint8Array }): Promise<void> {
    console.log(`[mail-outbound:noop] piece jointe simulee (${p.octets.byteLength} octets)`);
  }

  async ouvrirSessionUpload(): Promise<{ uploadUrl: string }> {
    return { uploadUrl: "noop://session" };
  }

  async envoyerTranche(p: { debut: number; octets: Uint8Array; taille: number }): Promise<{ fini: boolean }> {
    return { fini: p.debut + p.octets.byteLength >= p.taille };
  }

  async supprimerBrouillon(p: { id: string }): Promise<void> {
    console.log(`[mail-outbound:noop] suppression du brouillon ${p.id} simulee`);
  }

  async creerBrouillonNeuf(p: {
    boite: string;
    sujet: string;
    corps: string;
    a?: string[];
    cc?: string[];
    cci?: string[];
    piecesJointes?: { nom: string }[];
  }): Promise<{ webLink?: string }> {
    // No-op tracable : pas de Graph, donc pas de webLink (le bouton UI degradera).
    console.log(`[mail-outbound:noop] brouillon neuf simule (${p.corps.length} car., ${p.piecesJointes?.length ?? 0} PJ)`);
    return {};
  }

  async envoyerBrouillon(p: { boite: string; id: string }): Promise<void> {
    console.log(`[mail-outbound:noop] envoi du brouillon ${p.id} simule (${p.boite})`);
  }

  async envoyerNeuf(p: {
    boite: string;
    a: string[];
    cc: string[];
    cci: string[];
    sujet: string;
    corps: string;
    corpsHtml?: string;
    piecesJointes?: { nom: string }[];
  }): Promise<void> {
    // Pas de PII en log (RGPD) : nombre de destinataires seulement, jamais les adresses.
    console.log(`[mail-outbound:noop] mail neuf simule (${p.a.length} dest., ${p.corps.length} car., ${p.piecesJointes?.length ?? 0} PJ)`);
  }
}
