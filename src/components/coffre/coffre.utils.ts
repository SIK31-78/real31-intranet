import type { NiveauForce, RoleMembre, ScopeCoffre, SecretClair } from "@/lib/domain/coffre";

// Types et constantes de PRESENTATION partages par les morceaux du coffre-fort.
// Les regles (force du mot de passe, recherche, impact d'une reinitialisation) vivent
// dans le domaine coffre.

export interface SecretOuvert {
  id: string;
  clair: SecretClair;
}
export interface CoffreOuvert {
  id: string;
  nom: string;
  vaultKey: CryptoKey;
  secrets: SecretOuvert[];
  role: RoleMembre;
  scope: ScopeCoffre;
}

// Genere un mot de passe maitre robuste (alphabet sans caracteres ambigus : pas de
// l/I/1/O/0). 20 caracteres tires de crypto.getRandomValues -> 4 classes, "fort".
export function genererMotDePasseFort(longueur = 20): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*?-_=+";
  const arr = new Uint32Array(longueur);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => alphabet[n % alphabet.length]).join("");
}

export const FORCE_STYLE: Record<NiveauForce, { libelle: string; barre: string; texte: string; pct: string }> = {
  faible: { libelle: "Faible", barre: "bg-err-500", texte: "text-err-700", pct: "w-1/3" },
  moyen: { libelle: "Moyen", barre: "bg-warn-500", texte: "text-warn-700", pct: "w-2/3" },
  fort: { libelle: "Fort", barre: "bg-ok-500", texte: "text-ok-700", pct: "w-full" },
};

export const champClasse =
  "w-full h-9 px-3 rounded-lg border border-line bg-surface shadow-1 text-body text-ink placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-green-600";

export const LIBELLE_SCOPE: Record<ScopeCoffre, string> = {
  network: "Reseau",
  service: "Service",
  agency: "Agence",
  personal: "Personnel",
};

export const LIBELLE_ACTION: Record<string, string> = {
  create: "Ajout",
  update: "Modification",
  delete: "Suppression",
  import: "Import",
};
