import { describe, expect, it } from "vitest";
import type { MailEntrant } from "@/lib/domain/mes-emails";
import { htmlImpressionMail } from "./imprimer-mail";

const mail = {
  id: "m1",
  de: "Alice <b>Test</b>",
  expediteurEmail: "alice@example.test",
  destinataires: ["bob@example.test"],
  copie: [],
  objet: "Sujet & <script>",
  date: "2026-11-04",
  corps: "Bonjour\n<img src=x onerror=alert(1)>",
  attachments: [{}],
} as unknown as MailEntrant;

describe("htmlImpressionMail", () => {
  it("échappe l'objet, l'expéditeur et le corps", () => {
    const html = htmlImpressionMail(mail, null);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("Sujet &amp; &lt;script&gt;");
    expect(html).toContain("&lt;img src=x");
  });

  it("liste les pièces jointes chargées, sinon n'annonce que leur nombre", () => {
    const avec = htmlImpressionMail(mail, [{ id: "p", nom: "facture.pdf", taille: 2500 } as never]);
    expect(avec).toContain("facture.pdf");
    expect(avec).toContain("3 Ko");
    expect(htmlImpressionMail(mail, null)).toContain("Pièces jointes</strong> : 1");
  });

  it("n'a pas de bloc pièces jointes sans pièce", () => {
    expect(htmlImpressionMail({ ...mail, attachments: [] }, null)).not.toContain('class="pj"');
  });
});
