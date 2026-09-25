// Annuaire Linkus (standard téléphonique Yeastar) : les copropriétaires ESTALE et leurs
// contacts, pour qu'un client ESTALE soit reconnu à l'appel comme un client Crypto.
//
// Format : le modèle CSV fourni par l'agence (colonnes Yeastar « Company Contacts »),
// UTF-8 avec BOM, une ligne par personne, « NOM Prénom » dans Last Name, répertoire
// real31_Phonebook en dernière colonne. Doc Yeastar : un contact déjà présent dans le
// PBX est rejeté à l'import (« duplicated part cannot be imported ») et le reste passe,
// d'où le choix de Sekou (25/09/2026) d'exporter tout le monde à chaque fois.
//
// Un numéro n'apparaît qu'UNE fois dans le fichier (couple, copropriétaire de plusieurs
// lots) : sinon Linkus afficherait deux noms sur le même appel.

export const REPERTOIRE_LINKUS = "real31_Phonebook";

/** La copro de test ESTALE : jamais dans l'annuaire. */
const COPROS_EXCLUES = new Set(["SE999"]);

export const COLONNES_LINKUS = [
  "First Name", "Last Name", "Company Name", "Email", "Business Number", "Business Number 2",
  "Business Fax", "Mobile", "Mobile 2", "Home", "Home 2", "Home Fax", "Other", "ZIP Code",
  "Street", "City", "State", "Country", "Remark", "Organization", "Job Title", "Position",
  "Industry", "Supervisor", "Phonebook",
] as const;

export type ContactProprietaire = {
  lastname: string | null;
  firstname: string | null;
  company: string | null;
  phone: string | null;
  tenant: boolean;
};

export type ProprietaireAnnuaire = {
  lastname: string;
  firstname: string | null;
  companyName: string | null;
  isPro: boolean;
  phone: string | null;
  mobile: string | null;
  contacts: ContactProprietaire[];
};

export type CoproAnnuaire = { reference: string; proprietaires: ProprietaireAnnuaire[] };

export type LigneLinkus = {
  nom: string;
  mobiles: string[];
  fixes: string[];
  locataire: boolean;
};

export type BilanAnnuaire = {
  copros: number;
  lignes: number;
  locataires: number;
  proprietairesSansNumero: number;
  numerosEnDouble: number;
};

/** "+33 6 12 34 56 78" -> "0612345678". null si vide ou bouche-trou (06 00 00 00 00). */
export function normaliserNumero(brut: string | null | undefined): string | null {
  if (!brut) return null;
  let n = brut.replace(/[^\d+]/g, "");
  if (n.startsWith("+33")) n = "0" + n.slice(3);
  else if (n.startsWith("0033")) n = "0" + n.slice(4);
  if (/^0[67]0{8}$/.test(n)) return null;
  // Linkus accepte 31 caractères au plus par numéro ; en dessous de 8 chiffres ce n'est pas un numéro.
  if (n.replace(/\D/g, "").length < 8 || n.length > 31) return null;
  return n;
}

const estMobile = (n: string) => /^0[67]/.test(n);

/** « NOM Prénom » (nom en capitales), sinon la raison sociale. */
export function nomAffiche(lastname: string | null, firstname: string | null, societe: string | null): string {
  const nom = [(lastname ?? "").trim().toUpperCase(), (firstname ?? "").trim()].filter(Boolean).join(" ");
  return (nom || (societe ?? "").trim()).replace(/\s+/g, " ");
}

const refNormalisee = (ref: string) => {
  const m = ref.trim().toUpperCase().match(/^([A-Z]+)0*(\d+)$/);
  return m ? `${m[1]}${m[2]}` : ref.trim().toUpperCase();
};

export function construireAnnuaire(copros: CoproAnnuaire[]): { lignes: LigneLinkus[]; bilan: BilanAnnuaire } {
  const vus = new Set<string>();
  const lignes: LigneLinkus[] = [];
  const bilan: BilanAnnuaire = { copros: 0, lignes: 0, locataires: 0, proprietairesSansNumero: 0, numerosEnDouble: 0 };

  const ajouter = (nom: string, bruts: (string | null)[], locataire: boolean) => {
    const numeros = [...new Set(bruts.map(normaliserNumero).filter((n): n is string => !!n))];
    const neufs = numeros.filter((n) => !vus.has(n));
    bilan.numerosEnDouble += numeros.length - neufs.length;
    if (!nom || neufs.length === 0) return;
    neufs.forEach((n) => vus.add(n));
    lignes.push({ nom, mobiles: neufs.filter(estMobile), fixes: neufs.filter((n) => !estMobile(n)), locataire });
    if (locataire) bilan.locataires++;
  };

  // Ordre fixe : sur un numéro partagé, c'est toujours le même nom qui gagne d'un export à l'autre.
  const tries = [...copros].sort((a, b) => a.reference.localeCompare(b.reference));
  for (const copro of tries) {
    if (COPROS_EXCLUES.has(refNormalisee(copro.reference))) continue;
    bilan.copros++;
    for (const p of copro.proprietaires) {
      if (!normaliserNumero(p.mobile) && !normaliserNumero(p.phone)) bilan.proprietairesSansNumero++;
      const nom = p.isPro && p.companyName?.trim() ? p.companyName.trim() : nomAffiche(p.lastname, p.firstname, p.companyName);
      ajouter(nom, [p.mobile, p.phone], false);
      for (const c of p.contacts) ajouter(nomAffiche(c.lastname, c.firstname, c.company), [c.phone], c.tenant);
    }
  }

  lignes.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  bilan.lignes = lignes.length;
  return { lignes, bilan };
}

const champCsv = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Le fichier CSV attendu par Linkus (BOM UTF-8, virgules, fins de ligne CRLF). */
export function versCsvLinkus(lignes: LigneLinkus[]): string {
  const corps = lignes.map((l) => {
    const r: Record<(typeof COLONNES_LINKUS)[number], string> = Object.fromEntries(
      COLONNES_LINKUS.map((c) => [c, ""]),
    ) as Record<(typeof COLONNES_LINKUS)[number], string>;
    r["Last Name"] = l.nom;
    r["Mobile"] = l.mobiles[0] ?? "";
    r["Mobile 2"] = l.mobiles[1] ?? "";
    r["Business Number"] = l.fixes[0] ?? "";
    r["Business Number 2"] = l.fixes[1] ?? "";
    r["Other"] = [...l.mobiles.slice(2), ...l.fixes.slice(2)][0] ?? "";
    r["Remark"] = l.locataire ? "Locataire" : "";
    r["Phonebook"] = REPERTOIRE_LINKUS;
    return COLONNES_LINKUS.map((c) => champCsv(r[c])).join(",");
  });
  return "﻿" + [COLONNES_LINKUS.join(","), ...corps].join("\r\n") + "\r\n";
}
