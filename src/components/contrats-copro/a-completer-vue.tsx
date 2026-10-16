"use client";

// L'onglet « À compléter » de /contrats-copro (REA-333, points 15 et 16 du plan) : par copro,
// ce qui manque pour que ses suivis tiennent debout (échéance, compteurs, immatriculation,
// appareils, fournisseur…), plus la fiche immeuble incomplète. Chaque ligne se corrige SUR
// PLACE quand c'est possible : un champ, un bouton, et la ligne disparaît au rafraîchissement.
// Ce qui ne se saisit pas ici (conseil syndical, fiche immeuble) renvoie à la fiche.
//
// Les droits d'écriture (ADR-041) sont vérifiés par les actions : hors de son portefeuille,
// l'enregistrement répond par un message, l'écran ne devine pas à l'avance.

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { Rows } from "@/components/ui/list-rows";
import { Section } from "@/components/ui/section";
import { Stat } from "@/components/ui/stat";
import { useToast } from "@/components/ui/toast";
import { LIBELLE_RUBRIQUE_A_COMPLETER, type ItemACompleter, type RubriqueACompleter } from "@/lib/domain/contrats-copro/a-completer";
import { LIBELLE_SUJET } from "@/lib/domain/contrats-copro/types";
import { normaliserTexte } from "@/lib/domain/cles/normaliser";
import type { VuePerimetre } from "@/lib/domain/perimetre-ecriture";
import type { ACompleterParCopro } from "@/lib/services/contrats-copro/types";
import type { ImmeubleACompleter } from "@/lib/services/contrats-copro/immeuble";
import {
  corrigerContratAction,
  creerAppareilAction,
  definirEcheanceAction,
  demarrerSuiviAction,
  modifierAppareilAction,
} from "@/app/contrats-copro/actions";

type Rubrique = RubriqueACompleter | "immeuble";
type FiltreRubrique = "toutes" | Rubrique;

const LIBELLE_RUBRIQUE: Record<Rubrique, string> = { ...LIBELLE_RUBRIQUE_A_COMPLETER, immeuble: "Fiche immeuble" };
const RUBRIQUES: readonly Rubrique[] = [
  "assurance",
  "gaz",
  "ctq_ascenseur",
  "ctq_vmc",
  "a_demarrer",
  "appareil",
  "compteur",
  "immatriculation",
  "conseil_syndical",
  "echeance_aberrante",
  "immeuble",
];
const COMPTEURS = ["ascenseurs", "chaudieres", "vmcGaz"] as const;
type ChampCompteur = (typeof COMPTEURS)[number];
/** Au-delà, on demande d'affiner (vue cabinet). */
const MAX_COPROS = 60;

interface Groupe {
  coproCode: string;
  coproNom: string;
  gestionnaire?: string;
  items: ItemACompleter[];
  /** Champs du registre national encore vides, libellés. */
  immeuble: string[];
}

function fusionner(groupes: ACompleterParCopro[], immeubles: ImmeubleACompleter[]): Groupe[] {
  const parCode = new Map<string, Groupe>();
  for (const g of groupes) {
    parCode.set(g.coproCode, { coproCode: g.coproCode, coproNom: g.coproNom, ...(g.gestionnaire ? { gestionnaire: g.gestionnaire } : {}), items: g.items, immeuble: [] });
  }
  for (const i of immeubles) {
    const existant = parCode.get(i.coproCode);
    if (existant) existant.immeuble = i.manquants;
    else parCode.set(i.coproCode, { coproCode: i.coproCode, coproNom: i.coproNom, ...(i.gestionnaire ? { gestionnaire: i.gestionnaire } : {}), items: [], immeuble: i.manquants });
  }
  return [...parCode.values()].sort((a, b) => taille(b) - taille(a) || a.coproCode.localeCompare(b.coproCode));
}

function taille(g: Groupe): number {
  return g.items.length + (g.immeuble.length > 0 ? 1 : 0);
}

function corpus(g: Groupe): string {
  return normaliserTexte(
    [g.coproCode, g.coproNom, g.gestionnaire, ...g.items.map((i) => `${LIBELLE_RUBRIQUE[i.rubrique]} ${i.libelle}`), g.immeuble.length > 0 ? `fiche immeuble ${g.immeuble.join(" ")}` : ""]
      .filter(Boolean)
      .join(" "),
  );
}

function lienFiche(coproCode: string): string {
  return `/copropriete/${encodeURIComponent(coproCode)}?onglet=contrats`;
}

export function ACompleterVue({
  groupes,
  immeubles,
  vue,
  rubriqueInitiale,
}: {
  groupes: ACompleterParCopro[];
  immeubles: ImmeubleACompleter[];
  vue: VuePerimetre;
  rubriqueInitiale?: string;
}) {
  const [q, setQ] = useState("");
  const [rubrique, setRubrique] = useState<FiltreRubrique>(
    rubriqueInitiale && (RUBRIQUES as readonly string[]).includes(rubriqueInitiale) ? (rubriqueInitiale as Rubrique) : "toutes",
  );
  const [gestionnaire, setGestionnaire] = useState("tous");

  const tous = useMemo(() => fusionner(groupes, immeubles).map((g) => ({ g, texte: corpus(g) })), [groupes, immeubles]);
  const gestionnaires = useMemo(
    () => [...new Set(tous.map(({ g }) => g.gestionnaire).filter((n): n is string => Boolean(n)))].sort((a, b) => a.localeCompare(b, "fr")),
    [tous],
  );

  const visibles = useMemo(() => {
    const termes = normaliserTexte(q).split(" ").filter(Boolean);
    const out: Groupe[] = [];
    for (const { g, texte } of tous) {
      if (gestionnaire !== "tous" && g.gestionnaire !== gestionnaire) continue;
      if (!termes.every((t) => texte.includes(t))) continue;
      if (rubrique === "toutes") out.push(g);
      else if (rubrique === "immeuble") {
        if (g.immeuble.length > 0) out.push({ ...g, items: [] });
      } else {
        const items = g.items.filter((i) => i.rubrique === rubrique);
        if (items.length > 0) out.push({ ...g, items, immeuble: [] });
      }
    }
    return out;
  }, [tous, q, rubrique, gestionnaire]);

  const compteurs = useMemo(() => {
    let manquants = 0;
    let douteuses = 0;
    for (const g of visibles) {
      for (const i of g.items) {
        if (i.rubrique === "echeance_aberrante") douteuses += 1;
        else manquants += 1;
      }
      manquants += g.immeuble.length;
    }
    return { copros: visibles.length, manquants, douteuses };
  }, [visibles]);

  const filtreActif = q.trim() !== "" || rubrique !== "toutes" || gestionnaire !== "tous";

  if (tous.length === 0) {
    return <EmptyState>Tout est complété sur ce périmètre</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Copropriétés concernées" valeur={String(compteurs.copros)} note={filtreActif ? "dans ce filtre" : undefined} />
        <Stat label="Champs manquants" valeur={String(compteurs.manquants)} />
        <Stat label="Échéances douteuses" valeur={String(compteurs.douteuses)} ton={compteurs.douteuses > 0 ? "warn" : "neutral"} note={compteurs.douteuses > 0 ? "héritées de l'ancien outil" : undefined} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-56">
          <Search strokeWidth={1.5} className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3 pointer-events-none" aria-hidden />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher : code, nom, gestionnaire, rubrique, champ…"
            aria-label="Rechercher une copropriété à compléter"
            autoComplete="off"
            className="pl-8"
          />
        </div>
        <Select largeur="auto" aria-label="Rubrique" value={rubrique} onChange={(e) => setRubrique(e.target.value as FiltreRubrique)}>
          <option value="toutes">Toutes les rubriques</option>
          {RUBRIQUES.map((r) => (
            <option key={r} value={r}>
              {LIBELLE_RUBRIQUE[r]}
            </option>
          ))}
        </Select>
        {vue !== "portefeuille" && gestionnaires.length > 1 && (
          <Select largeur="auto" aria-label="Voir les copropriétés de" value={gestionnaire} onChange={(e) => setGestionnaire(e.target.value)}>
            <option value="tous">Voir les copros de tous</option>
            {gestionnaires.map((n) => (
              <option key={n} value={n}>
                Voir les copros de {n}
              </option>
            ))}
          </Select>
        )}
      </div>

      {visibles.length === 0 ? (
        <EmptyState>Rien ne correspond à ces filtres</EmptyState>
      ) : (
        <>
          {visibles.slice(0, MAX_COPROS).map((g) => (
            <GroupeCopro key={g.coproCode} groupe={g} />
          ))}
          {visibles.length > MAX_COPROS && (
            <p className="text-meta text-ink-3">
              Les {MAX_COPROS} copropriétés les plus incomplètes sont affichées : affinez les filtres pour voir les {visibles.length - MAX_COPROS} autres.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function GroupeCopro({ groupe }: { groupe: Groupe }) {
  return (
    <Section
      id={`a-completer-${groupe.coproCode}`}
      titre={
        <>
          <span className="font-mono text-body font-normal text-ink-2">{groupe.coproCode}</span>
          <span>{groupe.coproNom}</span>
          {groupe.gestionnaire && <span className="text-body font-normal text-ink-2">· {groupe.gestionnaire}</span>}
        </>
      }
      compte={taille(groupe)}
      actions={
        <ButtonLink href={lienFiche(groupe.coproCode)} variant="ghost" size="sm">
          Fiche
          <ArrowRight strokeWidth={1.5} />
        </ButtonLink>
      }
    >
      <Rows>
        {groupe.items.map((item, k) => (
          <LigneItem key={`${item.rubrique}-${item.champ}-${item.cycleId ?? item.ascenseurId ?? k}`} item={item} />
        ))}
        {groupe.immeuble.length > 0 && (
          <Ligne rubrique="immeuble" libelle={`Registre national : ${groupe.immeuble.join(", ")}`}>
            <ButtonLink href={lienFiche(groupe.coproCode)} variant="secondary" size="sm">
              Compléter sur la fiche
            </ButtonLink>
          </Ligne>
        )}
      </Rows>
    </Section>
  );
}

function Ligne({ rubrique, libelle, children, sous }: { rubrique: Rubrique; libelle: string; children?: ReactNode; sous?: ReactNode }) {
  return (
    <li className="flex flex-col gap-1.5 px-4 py-1.5 min-h-9 text-body">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Badge ton={rubrique === "echeance_aberrante" ? "warn" : "neutral"} className="shrink-0">
          {LIBELLE_RUBRIQUE[rubrique]}
        </Badge>
        <span className="flex-1 min-w-48 text-ink">{libelle}</span>
        {children && <span className="flex items-center gap-1.5 flex-wrap">{children}</span>}
      </div>
      {sous}
    </li>
  );
}

// --- Une ligne et sa saisie en place -------------------------------------------------------

type Geste = () => Promise<{ ok: true; donnees?: unknown } | { ok: false; erreur: string }>;

/** Lance une action, affiche le résultat, rafraîchit la page (la ligne corrigée disparaît). */
function useGeste() {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const lancer = (geste: Geste, confirmation: string) =>
    demarrer(async () => {
      const res = await geste();
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(confirmation);
      router.refresh();
    });
  return { pending, lancer };
}

function LigneItem({ item }: { item: ItemACompleter }) {
  const { pending, lancer } = useGeste();
  const code = item.coproCode;
  const sujet = item.sujet ? LIBELLE_SUJET[item.sujet] : undefined;

  // Une échéance de cycle : assurance, gaz, VMC, et les échéances invraisemblables.
  if (item.champ === "echeanceISO" && item.sujet && item.cycleId) {
    const { sujet: s, cycleId } = item;
    const aberrante = item.rubrique === "echeance_aberrante";
    return (
      <Ligne
        rubrique={item.rubrique}
        libelle={item.libelle}
        sous={
          aberrante ? (
            <Callout ton="warn" className="py-1.5">
              Date héritée de l&apos;ancien outil, à corriger avant d&apos;armer les rappels.
            </Callout>
          ) : undefined
        }
      >
        <SaisieValeur
          type="date"
          libelle={`Échéance ${sujet ?? ""}`.trim()}
          initiale={item.valeurActuelle ?? ""}
          pending={pending}
          onValider={(v) => lancer(() => definirEcheanceAction({ coproCode: code, sujet: s, cycleId, echeanceISO: v }), "Échéance enregistrée.")}
        />
      </Ligne>
    );
  }

  if (item.rubrique === "immatriculation") {
    return (
      <Ligne rubrique={item.rubrique} libelle={item.libelle}>
        <SaisieValeur
          type="text"
          libelle="Numéro d'immatriculation"
          placeholder="AA1-234-567"
          pending={pending}
          onValider={(v) => lancer(() => corrigerContratAction({ coproCode: code, patch: { immatriculation: { numero: v, nonApplicable: false } } }), "Immatriculation enregistrée.")}
        />
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => lancer(() => corrigerContratAction({ coproCode: code, patch: { immatriculation: { nonApplicable: true } } }), "Copropriété marquée sans immatriculation.")}
        >
          Sans objet
        </Button>
      </Ligne>
    );
  }

  if (item.rubrique === "compteur" && (COMPTEURS as readonly string[]).includes(item.champ)) {
    const champ = item.champ as ChampCompteur;
    return (
      <Ligne rubrique={item.rubrique} libelle={item.libelle}>
        <SaisieValeur
          type="number"
          libelle={item.libelle}
          initiale={item.valeurActuelle ?? ""}
          pending={pending}
          onValider={(v) => lancer(() => corrigerContratAction({ coproCode: code, patch: { compteurs: { [champ]: Number(v) } } }), "Compteur enregistré.")}
        />
      </Ligne>
    );
  }

  if (item.rubrique === "assurance") {
    const champ = item.champ;
    if (champ === "compagnie" || champ === "numeroContrat" || champ === "courtier" || champ === "souscriptionISO") {
      return (
        <Ligne rubrique={item.rubrique} libelle={item.libelle}>
          <SaisieValeur
            type={champ === "souscriptionISO" ? "date" : "text"}
            libelle={item.libelle}
            placeholder={champ === "courtier" ? "nom du courtier, ou « en direct »" : undefined}
            pending={pending}
            onValider={(v) => lancer(() => corrigerContratAction({ coproCode: code, patch: { assurance: { [champ]: v } } }), "Assurance mise à jour.")}
          />
        </Ligne>
      );
    }
  }

  if (item.rubrique === "gaz") {
    const champ = item.champ;
    if (champ === "fournisseur" || champ === "montant") {
      return (
        <Ligne rubrique={item.rubrique} libelle={item.libelle}>
          <SaisieValeur
            type={champ === "montant" ? "number" : "text"}
            libelle={item.libelle}
            pending={pending}
            onValider={(v) => lancer(() => corrigerContratAction({ coproCode: code, patch: { gaz: { [champ]: champ === "montant" ? Number(v) : v } } }), "Contrat gaz mis à jour.")}
          />
        </Ligne>
      );
    }
    if (champ === "typePrix") {
      return (
        <Ligne rubrique={item.rubrique} libelle={item.libelle}>
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => lancer(() => corrigerContratAction({ coproCode: code, patch: { gaz: { typePrix: "fixe" } } }), "Type de prix enregistré.")}>
            Prix fixe
          </Button>
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => lancer(() => corrigerContratAction({ coproCode: code, patch: { gaz: { typePrix: "variable" } } }), "Type de prix enregistré.")}>
            Prix variable
          </Button>
        </Ligne>
      );
    }
  }

  if (item.rubrique === "appareil" && item.ascenseurId && (item.champ === "identifiant" || item.champ === "dernierCtqISO")) {
    const { ascenseurId, champ } = item;
    return (
      <Ligne rubrique={item.rubrique} libelle={item.libelle}>
        <SaisieValeur
          type={champ === "dernierCtqISO" ? "date" : "text"}
          libelle={item.libelle}
          pending={pending}
          onValider={(v) => lancer(() => modifierAppareilAction({ coproCode: code, ascenseurId, [champ]: v }), "Appareil mis à jour.")}
        />
      </Ligne>
    );
  }

  if (item.rubrique === "a_demarrer" && item.sujet) {
    const s = item.sujet;
    if (s === "ctq_ascenseur" && !item.ascenseurId) {
      return (
        <Ligne rubrique={item.rubrique} libelle={item.libelle}>
          <SaisieValeur
            type="text"
            libelle="Identifiant de l'appareil"
            placeholder="identifiant (facultatif)"
            bouton="Créer l'appareil"
            optionnelle
            pending={pending}
            onValider={(v) => lancer(() => creerAppareilAction({ coproCode: code, identifiant: v || null, ouvrirCycle: true }), "Appareil créé, suivi ouvert.")}
          />
        </Ligne>
      );
    }
    return (
      <Ligne rubrique={item.rubrique} libelle={item.libelle}>
        <Button
          variant="secondary"
          size="sm"
          loading={pending}
          onClick={() => lancer(() => demarrerSuiviAction({ coproCode: code, sujet: s, ...(item.ascenseurId ? { ascenseurId: item.ascenseurId } : {}) }), "Suivi démarré.")}
        >
          Démarrer le suivi
        </Button>
      </Ligne>
    );
  }

  // Conseil syndical sans adresse, et tout ce qui ne se saisit pas ici : la fiche.
  return (
    <Ligne rubrique={item.rubrique} libelle={item.libelle}>
      <ButtonLink href={lienFiche(code)} variant="secondary" size="sm">
        {item.rubrique === "conseil_syndical" ? "Voir le conseil syndical" : "Compléter sur la fiche"}
      </ButtonLink>
    </Ligne>
  );
}

/** Un champ et son bouton « Enregistrer », sur la ligne. */
function SaisieValeur({
  type,
  libelle,
  initiale = "",
  placeholder,
  bouton = "Enregistrer",
  optionnelle = false,
  pending,
  onValider,
}: {
  type: "text" | "date" | "number";
  libelle: string;
  initiale?: string;
  placeholder?: string;
  bouton?: string;
  /** Le bouton reste actif à vide (identifiant facultatif). */
  optionnelle?: boolean;
  pending: boolean;
  onValider: (valeur: string) => void;
}) {
  const [valeur, setValeur] = useState(initiale);
  const vide = valeur.trim() === "";
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (vide && !optionnelle) return;
        onValider(valeur.trim());
      }}
    >
      <Input
        type={type}
        largeur="auto"
        className={type === "number" ? "w-20" : type === "date" ? "w-36" : "w-44"}
        aria-label={libelle}
        value={valeur}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? 1 : undefined}
        placeholder={placeholder}
        onChange={(e) => setValeur(e.target.value)}
        disabled={pending}
      />
      <Button type="submit" variant="secondary" size="sm" loading={pending} disabled={vide && !optionnelle}>
        {bouton}
      </Button>
    </form>
  );
}
