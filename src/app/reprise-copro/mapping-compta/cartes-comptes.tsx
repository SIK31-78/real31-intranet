"use client";

// CARTES ET TABLES DES COMPTES de la revue du mapping (refonte 2026-08, extraites de
// revue-mapping-vue.tsx) : section homonymes (coproprietaires a comptes multiples), carte
// d'une entree A TRAITER (choix du candidat / cible manuelle / compte separe / parti /
// ignorer), carte d'une creation a confirmer, accordeons et tables des comptes resolus,
// et la vue "grand livre" depliable d'un compte source.

import { useState } from "react";
import {
  Check,
  Ban,
  ChevronDown,
  Database,
  Undo2,
  BookOpen,
  Split,
  Users,
  UserMinus,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { GrandLivreCompte } from "@/lib/reprise/domain/ecriture";
import type { CandidatCompte, GroupeHomonymes } from "@/lib/reprise/domain/mapping-compta";
import type { DecisionMapping, EntreeMappingResolue } from "@/lib/reprise/domain/decisions-mapping";
import { CATEGORIE_LABEL, STATUT_LABEL, montantEuro } from "./vues-mapping";

// --- Section "Coproprietaires a comptes multiples" (groupes homonymes) ------
//
// Un coproprietaire apparait sur plusieurs comptes 450 source (meme nom, tous 4501,
// indiscernables). On les presente ENSEMBLE avec leur grand livre depliable + leurs soldes
// pour decider en connaissance de cause : valider / choisir une cible / creer un compte SEPARE
// (pas de fusion silencieuse) / ignorer. L'appariement auto est desactive cote domaine.

export function SectionHomonymes({
  groupes,
  entreeParCompte,
  coproprietaires,
  partis,
  grandLivre,
  nomDe,
  onTrancher,
  onAnnuler,
}: {
  groupes: GroupeHomonymes[];
  entreeParCompte: Map<string, EntreeMappingResolue>;
  coproprietaires: CandidatCompte[];
  partis: CandidatCompte[];
  grandLivre: Record<string, GrandLivreCompte>;
  nomDe: (n?: string) => string;
  onTrancher: (compteSource: string, decision: DecisionMapping) => void;
  onAnnuler: (compteSource: string) => void;
}) {
  return (
    <section>
      <div className="flex items-center gap-2">
        <Users strokeWidth={1.5} className="w-4 h-4 text-ink-3" />
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">
          Coproprietaires a comptes multiples
        </h3>
        <Badge ton="warn" dot>
          {groupes.length} groupe(s)
        </Badge>
      </div>
      <p className="mt-0.5 text-[12px] text-ink-3">
        Un meme nom porte plusieurs comptes 450 (indiscernables). Appariement automatique desactive :
        tranche chaque compte (valider, choisir une cible, ou creer un compte separe). Deplie le grand
        livre pour voir les ecritures avant de decider.
      </p>

      <div className="mt-3 flex flex-col gap-4">
        {groupes.map((g, i) => {
          const membres = g.comptes.map((c) => entreeParCompte.get(c)).filter((e): e is EntreeMappingResolue => !!e);
          const nomGroupe = membres.find((m) => m.intitule)?.intitule ?? "(nom absent)";
          return (
            <div key={i} className="rounded-md border border-warn-500/30 bg-warn-50/30 p-3">
              <div className="flex items-center gap-2">
                <Split strokeWidth={1.5} className="w-4 h-4 text-warn-700" />
                <span className="text-[13px] font-medium text-ink">{nomGroupe}</span>
                <Badge ton="neutral">{membres.length} comptes</Badge>
              </div>
              <div className="mt-2.5 flex flex-col gap-3">
                {membres.map((e) =>
                  e.decision ? (
                    <MembreHomonymeResolu
                      key={e.compteSource}
                      entree={e}
                      grandLivreCompte={grandLivre[e.compteSource]}
                      nomDe={nomDe}
                      onAnnuler={onAnnuler}
                    />
                  ) : (
                    <EntreeATraiter
                      key={e.compteSource}
                      entree={e}
                      candidats={coproprietaires}
                      partis={partis}
                      grandLivreCompte={grandLivre[e.compteSource]}
                      nomDe={nomDe}
                      onTrancher={onTrancher}
                    />
                  ),
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Un compte homonyme deja tranche : rappel compact de la decision + Annuler + grand livre. */
function MembreHomonymeResolu({
  entree: e,
  grandLivreCompte,
  nomDe,
  onAnnuler,
}: {
  entree: EntreeMappingResolue;
  grandLivreCompte?: GrandLivreCompte;
  nomDe: (n?: string) => string;
  onAnnuler: (compteSource: string) => void;
}) {
  const action = e.action;
  const ownerSepare = action?.type === "creer_compte_separe" ? action.ownerNomenclature : undefined;
  return (
    <div className="rounded-md border border-line bg-surface px-3.5 py-2.5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[12px] text-ink-2">{e.compteSource}</span>
            <Badge ton={e.ignore ? "neutral" : "ok"} dot>
              {e.ignore ? "ignore" : STATUT_LABEL[e.statut]}
            </Badge>
            {e.decision?.type === "coproprietaire_parti" && (
              <Badge ton="brand">Parti -&gt; {e.cible?.nomenclature ?? ""}</Badge>
            )}
          </div>
          {ownerSepare ? (
            <p className="mt-1 text-[12px] text-ink-3">
              Compte separe rattache a <span className="font-mono text-ink-2">{ownerSepare}</span>
              {nomDe(ownerSepare) && <span> - {nomDe(ownerSepare)}</span>}
            </p>
          ) : e.cible ? (
            <p className="mt-1 text-[12px] text-ink-3">
              Cible : <span className="font-mono text-ink-2">{e.cible.nomenclature}</span>
              {nomDe(e.cible.nomenclature) && <span> - {nomDe(e.cible.nomenclature)}</span>}
            </p>
          ) : null}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => onAnnuler(e.compteSource)}>
          <Undo2 strokeWidth={1.5} /> Annuler
        </Button>
      </div>
      <VueGrandLivreCompte compte={grandLivreCompte} />
    </div>
  );
}

// --- Carte d'une entree A TRAITER (warning / non mappe) ---------------------

export function EntreeATraiter({
  entree,
  candidats,
  partis,
  grandLivreCompte,
  nomDe,
  onTrancher,
}: {
  entree: EntreeMappingResolue;
  candidats: CandidatCompte[];
  /** Cibles 46x/47x existantes (pour la decision "coproprietaire parti"). Optionnel. */
  partis?: CandidatCompte[];
  grandLivreCompte?: GrandLivreCompte;
  nomDe: (n?: string) => string;
  onTrancher: (compteSource: string, decision: DecisionMapping) => void;
}) {
  const [motifOuvert, setMotifOuvert] = useState(false);
  const [motif, setMotif] = useState("");
  const cs = entree.compteSource;
  const estFournisseur = entree.categorie === "fournisseur";
  const estCoproprietaire = entree.categorie === "coproprietaire";

  return (
    <div className="rounded-md border border-line bg-surface p-3.5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-ink-2">{cs}</span>
            <Badge ton="neutral">{CATEGORIE_LABEL[entree.categorie]}</Badge>
            <Badge ton={entree.statut === "warning_appariement" ? "warn" : "err"} dot>
              {STATUT_LABEL[entree.statut]}
            </Badge>
          </div>
          {entree.intitule && <p className="mt-1 text-[13px] text-ink">{entree.intitule}</p>}
        </div>
        {entree.confiance !== undefined && (
          <div className="text-right shrink-0">
            <div className="text-[11px] text-ink-4 uppercase tracking-wide">Score</div>
            <div className="font-mono text-[13px] text-ink-2">{entree.confiance.toFixed(2)}</div>
          </div>
        )}
      </div>

      {/* Candidat propose (warnings) */}
      {entree.cible && (
        <div className="mt-2 rounded-md border border-line bg-surface-2 px-3 py-2 text-[12.5px]">
          <span className="text-ink-3">Candidat eStale : </span>
          <span className="font-mono text-ink-2">{entree.cible.nomenclature}</span>
          {nomDe(entree.cible.nomenclature) && <span className="text-ink"> - {nomDe(entree.cible.nomenclature)}</span>}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {entree.cible && (
          <Button type="button" variant="primary" size="sm" onClick={() => onTrancher(cs, { type: "valider_candidat" })}>
            <Check strokeWidth={2} /> Valider le candidat
          </Button>
        )}

        <SelectCible
          candidats={candidats}
          onChoisir={(nomenclature) => onTrancher(cs, { type: "choisir_cible", nomenclature })}
        />

        {estFournisseur && (
          <Button type="button" variant="secondary" size="sm" onClick={() => onTrancher(cs, { type: "creer_fournisseur" })}>
            <Database strokeWidth={1.5} /> Marquer a creer
          </Button>
        )}

        {estCoproprietaire && (
          <SelectCompteSepare
            candidats={candidats}
            onChoisir={(owner) => onTrancher(cs, { type: "creer_compte_separe", owner })}
          />
        )}

        {estCoproprietaire && (
          <CoproprietaireParti
            partis={partis ?? []}
            onChoisir={(nomenclature) => onTrancher(cs, { type: "coproprietaire_parti", nomenclature })}
          />
        )}

        <Button type="button" variant="danger" size="sm" onClick={() => setMotifOuvert((v) => !v)}>
          <Ban strokeWidth={1.5} /> Ignorer
        </Button>
      </div>

      {motifOuvert && (
        <div className="mt-2 flex items-center gap-2">
          <input
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Motif (obligatoire, trace)"
            className="flex-1 h-8 px-2.5 rounded-md border border-line bg-surface text-[13px] text-ink"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={motif.trim().length === 0}
            onClick={() => onTrancher(cs, { type: "ignorer", motif: motif.trim() })}
          >
            Confirmer l&apos;ignore
          </Button>
        </div>
      )}

      <VueGrandLivreCompte compte={grandLivreCompte} />
    </div>
  );
}

function SelectCible({
  candidats,
  onChoisir,
}: {
  candidats: CandidatCompte[];
  onChoisir: (nomenclature: string) => void;
}) {
  return (
    <select
      value=""
      onChange={(e) => {
        if (e.target.value) onChoisir(e.target.value);
      }}
      className="h-[26px] rounded-sm border border-line bg-surface px-2 text-[12px] text-ink max-w-[240px]"
      aria-label="Choisir un autre compte eStale"
    >
      <option value="">Choisir un autre compte...</option>
      {candidats.map((c) => (
        <option key={c.nomenclature} value={c.nomenclature}>
          {c.nomenclature} - {c.intitule}
        </option>
      ))}
    </select>
  );
}

/**
 * Selecteur du compte 450 owner eStale auquel RATTACHER un compte separe (pour un coproprietaire
 * a comptes multiples : on cree un compte a part, on ne fusionne pas). L'owner designe fournit la
 * cle de repartition du sous-compte cree a l'import (Inc. 3).
 */
function SelectCompteSepare({
  candidats,
  onChoisir,
}: {
  candidats: CandidatCompte[];
  onChoisir: (owner: string) => void;
}) {
  return (
    <select
      value=""
      onChange={(e) => {
        if (e.target.value) onChoisir(e.target.value);
      }}
      className="h-[26px] rounded-sm border border-line bg-surface px-2 text-[12px] text-ink max-w-[240px]"
      aria-label="Creer un compte separe rattache a un owner eStale"
    >
      <option value="">Compte separe rattache a...</option>
      {candidats.map((c) => (
        <option key={c.nomenclature} value={c.nomenclature}>
          {c.nomenclature} - {c.intitule}
        </option>
      ))}
    </select>
  );
}

/**
 * Decision "COPROPRIETAIRE PARTI" (a vendu en cours d'exercice, introuvable dans eStale) : imputer
 * ses ecritures a un compte dedie. Deux voies : (a) choisir un compte 46x/47x DEJA dans eStale
 * (ex. un 461-005 cree par la comptable) ; (b) saisir une nomenclature a creer, pre-remplie "471"
 * (standard cabinet decide par Sekou : 471xxx "Coproprietaires partis"). Numero jamais fige : le
 * suffixe est complete/edite par le gestionnaire.
 */
function CoproprietaireParti({
  partis,
  onChoisir,
}: {
  partis: CandidatCompte[];
  onChoisir: (nomenclature: string) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [nouveau, setNouveau] = useState("471");
  return (
    <div className="relative">
      <Button type="button" variant="secondary" size="sm" onClick={() => setOuvert((v) => !v)}>
        <UserMinus strokeWidth={1.5} /> Coproprietaire parti
      </Button>
      {ouvert && (
        <div className="absolute z-10 mt-1 w-[290px] rounded-md border border-line bg-surface p-2.5 shadow-md">
          <p className="text-[11px] text-ink-3">
            Le titulaire a vendu : imputer ses ecritures a un compte dedie 47x (standard) ou 46x existant.
          </p>
          {partis.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  onChoisir(e.target.value);
                  setOuvert(false);
                }
              }}
              className="mt-2 h-[26px] w-full rounded-sm border border-line bg-surface px-2 text-[12px] text-ink"
              aria-label="Choisir un compte 46x/47x existant"
            >
              <option value="">Compte 46x/47x existant...</option>
              {partis.map((c) => (
                <option key={c.nomenclature} value={c.nomenclature}>
                  {c.nomenclature} - {c.intitule}
                </option>
              ))}
            </select>
          )}
          <div className="mt-2 flex items-center gap-1.5">
            <input
              value={nouveau}
              onChange={(e) => setNouveau(e.target.value)}
              placeholder="471xxx"
              className="h-[26px] flex-1 rounded-sm border border-line bg-surface px-2 text-[12px] font-mono text-ink"
              aria-label="Nomenclature du compte coproprietaires partis"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={nouveau.trim().length === 0}
              onClick={() => {
                onChoisir(nouveau.trim());
                setOuvert(false);
              }}
            >
              <Check strokeWidth={2} /> Valider
            </Button>
          </div>
          <p className="mt-1.5 text-[10.5px] text-ink-4">
            Standard cabinet : 471xxx &laquo; Coproprietaires partis &raquo;. Numero a completer/editer.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * ALERTE ROUGE "grand livre AVANT repartition" : des comptes de classe 6/7 portent un solde
 * anterieur non nul (apres cloture+repartition ils repartent a zero) -> mauvais grand livre.
 * Bloquant strict (l'import reste desactive, pretAImporter=false). PII-free (numeros + montants).
 */
// --- Vue "grand livre" d'un compte source (accordeon, replie par defaut) -----------

/**
 * Grand livre d'UN compte source. Deux modes (regle Sekou) :
 *   - bloc A (classes 4/5) : lignes presentes -> accordeon depliable, tableau date / libelle /
 *     piece / debit / credit + total (replie par defaut, scroll interne si long) ;
 *   - classes reportees (6, 1/2/3/7) : lignes videes cote serveur -> on controle les SOLDES du
 *     compte (bandeau statique D / C / solde), pas chaque ligne.
 * Ne fait AUCUN fetch : tout vient de l'analyse deja faite (data.grandLivre). PII : les libelles
 * peuvent porter des noms (affiches, jamais logues).
 */
function VueGrandLivreCompte({
  compte,
  initialementOuvert = false,
}: {
  compte?: GrandLivreCompte;
  initialementOuvert?: boolean;
}) {
  const [ouvert, setOuvert] = useState(initialementOuvert);
  if (!compte || compte.nbLignes === 0) return null;

  // Mode "soldes seulement" (classes reportees) : bandeau statique, pas de detail ligne a ligne.
  if (compte.lignes.length === 0) {
    return (
      <div className="mt-2.5 rounded-md border border-line bg-surface-2 px-3 py-1.5 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-2">
          <BookOpen strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-4" />
          Soldes du compte
          <Badge ton="neutral">{compte.nbLignes} ecriture(s)</Badge>
        </span>
        <span className="font-mono text-[11.5px] text-ink-3">
          D {montantEuro(compte.totalDebit) || "0,00"} / C {montantEuro(compte.totalCredit) || "0,00"} / solde{" "}
          {compte.solde.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-2.5 rounded-md border border-line bg-surface-2">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left"
        aria-expanded={ouvert}
      >
        <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-2">
          <BookOpen strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-4" />
          Grand livre du compte
          <Badge ton="neutral">{compte.nbLignes} ecriture(s)</Badge>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="font-mono text-[11.5px] text-ink-3">
            D {montantEuro(compte.totalDebit) || "0,00"} / C {montantEuro(compte.totalCredit) || "0,00"}
          </span>
          <ChevronDown
            strokeWidth={1.5}
            className={cn("w-4 h-4 text-ink-4 transition-transform", ouvert && "rotate-180")}
          />
        </span>
      </button>
      {ouvert && (
        <div className="border-t border-line max-h-[280px] overflow-auto">
          <table className="w-full text-[12px]">
            <thead className="text-left text-[10.5px] uppercase text-ink-4 sticky top-0 bg-surface-2">
              <tr>
                <th className="px-2.5 py-1 font-medium">Date</th>
                <th className="px-2 font-medium">Libelle</th>
                <th className="px-2 font-medium">Piece</th>
                <th className="px-2 font-medium text-right">Debit</th>
                <th className="px-2.5 font-medium text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {compte.lignes.map((l, i) => (
                <tr key={i} className="border-t border-line/60">
                  <td className="px-2.5 py-1 font-mono text-ink-3 whitespace-nowrap align-top">{l.date}</td>
                  <td className="px-2 text-ink-2 align-top">{l.libelle}</td>
                  <td className="px-2 font-mono text-ink-4 align-top whitespace-nowrap">{l.piece ?? ""}</td>
                  <td className="px-2 font-mono text-ink-2 text-right align-top whitespace-nowrap">{montantEuro(l.debit)}</td>
                  <td className="px-2.5 font-mono text-ink-2 text-right align-top whitespace-nowrap">{montantEuro(l.credit)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-surface">
                <td className="px-2.5 py-1 text-[11px] uppercase text-ink-4" colSpan={3}>
                  Total compte
                </td>
                <td className="px-2 font-mono text-ink text-right whitespace-nowrap">{montantEuro(compte.totalDebit) || "0,00"}</td>
                <td className="px-2.5 font-mono text-ink text-right whitespace-nowrap">{montantEuro(compte.totalCredit) || "0,00"}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// --- Carte d'une entree ACTION (creation) -----------------------------------

export function EntreeAction({
  entree,
  candidats,
  grandLivreCompte,
  nomDe,
  onTrancher,
  onAnnuler,
}: {
  entree: EntreeMappingResolue;
  candidats: CandidatCompte[];
  grandLivreCompte?: GrandLivreCompte;
  nomDe: (n?: string) => string;
  onTrancher: (compteSource: string, decision: DecisionMapping) => void;
  onAnnuler: (compteSource: string) => void;
}) {
  const cs = entree.compteSource;
  const decisionType = entree.decision?.type;
  const confirme = decisionType === "creer_fournisseur" || decisionType === "creer_compte_separe";
  const estFournisseur = entree.categorie === "fournisseur";
  const action = entree.action;
  const ownerSepare = action?.type === "creer_compte_separe" ? action.ownerNomenclature : undefined;

  return (
    <div className="rounded-md border border-line bg-surface px-3.5 py-2.5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-ink-2">{cs}</span>
            <Badge ton="neutral">{CATEGORIE_LABEL[entree.categorie]}</Badge>
            {confirme && (
              <Badge ton="ok" dot>
                confirme
              </Badge>
            )}
          </div>
          {entree.intitule && <p className="mt-1 text-[13px] text-ink">{entree.intitule}</p>}
          <p className="mt-0.5 text-[12px] text-ink-3">
            {action?.type === "creer_fournisseur"
              ? "Fournisseur a creer dans eStale."
              : action?.type === "creer_sous_compte"
                ? `Sous-compte d'attente a creer (${action.parent}${action.suffix} - ${action.nom}).`
                : action?.type === "creer_compte_separe"
                  ? "Compte 450 separe a creer dans eStale (coproprietaire a comptes multiples, pas de fusion)."
                  : "Creation planifiee."}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {estFournisseur && !confirme && (
            <>
              <Button type="button" variant="secondary" size="sm" onClick={() => onTrancher(cs, { type: "creer_fournisseur" })}>
                <Check strokeWidth={2} /> Confirmer
              </Button>
              <SelectCible
                candidats={candidats}
                onChoisir={(nomenclature) => onTrancher(cs, { type: "choisir_cible", nomenclature })}
              />
            </>
          )}
          {confirme && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onAnnuler(cs)}>
              <Undo2 strokeWidth={1.5} /> Annuler
            </Button>
          )}
        </div>
      </div>
      {ownerSepare && (
        <p className="mt-1 text-[12px] text-ink-3">
          Rattache a : <span className="font-mono text-ink-2">{ownerSepare}</span>
          {nomDe(ownerSepare) && <span> - {nomDe(ownerSepare)}</span>}
        </p>
      )}
      {nomDe(entree.cible?.nomenclature) && (
        <p className="mt-1 text-[12px] text-ink-3">
          Cible : <span className="font-mono text-ink-2">{entree.cible?.nomenclature}</span> - {nomDe(entree.cible?.nomenclature)}
        </p>
      )}
      <VueGrandLivreCompte compte={grandLivreCompte} />
    </div>
  );
}

export function Accordeon({
  titre,
  compte,
  ton,
  children,
}: {
  titre: string;
  compte: number;
  ton: "ok" | "info" | "neutral";
  children: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div className="rounded-md border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left"
        aria-expanded={ouvert}
      >
        <span className="flex items-center gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">{titre}</span>
          <Badge ton={ton} dot>
            {compte}
          </Badge>
        </span>
        <ChevronDown
          strokeWidth={1.5}
          className={cn("w-4 h-4 text-ink-4 transition-transform", ouvert && "rotate-180")}
        />
      </button>
      {ouvert && <div className="border-t border-line px-2 py-2">{children}</div>}
    </div>
  );
}

export function TableEntrees({
  entrees,
  grandLivre,
  nomDe,
  onAnnuler,
}: {
  entrees: EntreeMappingResolue[];
  grandLivre: Record<string, GrandLivreCompte>;
  nomDe: (n?: string) => string;
  onAnnuler: (compteSource: string) => void;
}) {
  if (entrees.length === 0) {
    return <p className="px-2 py-3 text-[12.5px] text-ink-3">Aucun compte dans ce groupe.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead className="text-left text-[11px] uppercase text-ink-4">
          <tr>
            <th className="px-2 py-1 font-medium">Compte</th>
            <th className="px-2 font-medium">Categorie</th>
            <th className="px-2 font-medium">Cible eStale</th>
            <th className="px-2 font-medium">Statut</th>
            <th className="px-2 font-medium text-right">Solde</th>
            <th className="px-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {entrees.map((e) => (
            <LigneTable
              key={e.compteSource}
              entree={e}
              grandLivreCompte={grandLivre[e.compteSource]}
              nomDe={nomDe}
              onAnnuler={onAnnuler}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Une ligne de la table + son grand livre depliable (colonne pleine largeur en dessous). */
function LigneTable({
  entree: e,
  grandLivreCompte,
  nomDe,
  onAnnuler,
}: {
  entree: EntreeMappingResolue;
  grandLivreCompte?: GrandLivreCompte;
  nomDe: (n?: string) => string;
  onAnnuler: (compteSource: string) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  // Detail ligne a ligne consultable = bloc A seulement (les classes reportees arrivent sans
  // lignes : on controle leur SOLDE, affiche en colonne - regle Sekou).
  const consultable = !!grandLivreCompte && grandLivreCompte.lignes.length > 0;
  return (
    <>
      <tr className="border-t border-line">
        <td className="px-2 py-1.5 font-mono text-ink-2 align-top">
          <span className="inline-flex items-center gap-1.5">
            {consultable && (
              <button
                type="button"
                onClick={() => setOuvert((v) => !v)}
                className="text-ink-4 hover:text-green-700"
                aria-label="Voir les ecritures du compte"
                aria-expanded={ouvert}
              >
                <ChevronDown strokeWidth={1.5} className={cn("w-3.5 h-3.5 transition-transform", ouvert && "rotate-180")} />
              </button>
            )}
            {e.compteSource}
          </span>
        </td>
        <td className="px-2 text-ink align-top">{CATEGORIE_LABEL[e.categorie]}</td>
        <td className="px-2 align-top">
          {e.cible ? (
            <span>
              <span className="font-mono text-ink-2">{e.cible.nomenclature}</span>
              {nomDe(e.cible.nomenclature) && <span className="text-ink-3"> - {nomDe(e.cible.nomenclature)}</span>}
            </span>
          ) : (
            <span className="text-ink-4">-</span>
          )}
        </td>
        <td className="px-2 align-top">
          <span className="inline-flex items-center gap-1.5">
            {STATUT_LABEL[e.statut]}
            {e.decision?.type === "coproprietaire_parti" ? (
              <Badge ton="brand">Parti -&gt; {e.cible?.nomenclature ?? ""}</Badge>
            ) : (
              e.decision && <Badge ton="brand">{e.ignore ? "ignore" : "manuel"}</Badge>
            )}
          </span>
        </td>
        <td className="px-2 align-top text-right font-mono text-ink-2 whitespace-nowrap">
          {grandLivreCompte
            ? grandLivreCompte.solde.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : "-"}
        </td>
        <td className="px-2 align-top text-right">
          {e.decision && (
            <button
              type="button"
              onClick={() => onAnnuler(e.compteSource)}
              className="inline-flex items-center gap-1 text-[12px] text-ink-4 hover:text-green-700"
            >
              <Undo2 strokeWidth={1.5} className="w-3.5 h-3.5" /> annuler
            </button>
          )}
        </td>
      </tr>
      {ouvert && consultable && (
        <tr>
          <td colSpan={6} className="px-2 pb-2">
            <VueGrandLivreCompte compte={grandLivreCompte} initialementOuvert />
          </td>
        </tr>
      )}
    </>
  );
}

