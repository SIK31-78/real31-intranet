"use client";

// Les bâtiments d'une copropriété (registre national) : une ligne par bâtiment, éditable en
// place (nom, année, étages, ascenseurs, étiquette énergie), un bouton pour en ajouter,
// « Pré-remplir » quand il en manque par rapport au nombre annoncé, suppression confirmée.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Pencil, Plus, Save, Trash2, WandSparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { ETIQUETTES_ENERGIE, LIBELLE_ETIQUETTE_ENERGIE, lettreBatiment, type Batiment } from "@/lib/domain/contrats-copro";
import { creerBatimentAction, modifierBatimentAction, prefillerBatimentsAction, supprimerBatimentAction } from "@/app/contrats-copro/actions-immeuble";

type Saisie = { nom: string; anneeConstruction: string; nombreEtages: string; nombreAscenseurs: string; etiquetteEnergie: string };

const VIDE: Saisie = { nom: "", anneeConstruction: "", nombreEtages: "", nombreAscenseurs: "", etiquetteEnergie: "" };

function depuis(b: Batiment): Saisie {
  return {
    nom: b.nom,
    anneeConstruction: b.anneeConstruction === null ? "" : String(b.anneeConstruction),
    nombreEtages: b.nombreEtages === null ? "" : String(b.nombreEtages),
    nombreAscenseurs: b.nombreAscenseurs === null ? "" : String(b.nombreAscenseurs),
    etiquetteEnergie: b.etiquetteEnergie ?? "",
  };
}

/** Un entier, null si vide, undefined si illisible. */
function entier(s: string): number | null | undefined {
  const t = s.trim();
  if (t === "") return null;
  if (!/^-?\d+$/.test(t)) return undefined;
  return Number(t);
}

function versPayload(s: Saisie): { nom: string; anneeConstruction: number | null; nombreEtages: number | null; nombreAscenseurs: number | null; etiquetteEnergie: string | null } | string {
  const annee = entier(s.anneeConstruction);
  const etages = entier(s.nombreEtages);
  const asc = entier(s.nombreAscenseurs);
  if (annee === undefined) return "L'année doit être un nombre entier.";
  if (etages === undefined) return "Le nombre d'étages doit être un nombre entier.";
  if (asc === undefined) return "Le nombre d'ascenseurs doit être un nombre entier.";
  if (!s.nom.trim()) return "Le bâtiment doit avoir un nom.";
  return { nom: s.nom.trim(), anneeConstruction: annee, nombreEtages: etages, nombreAscenseurs: asc, etiquetteEnergie: s.etiquetteEnergie === "" ? null : s.etiquetteEnergie };
}

function Cellules({ s, onChange, autoFocus }: { s: Saisie; onChange: (s: Saisie) => void; autoFocus?: boolean }) {
  return (
    <>
      <Td principal>
        <Input value={s.nom} onChange={(e) => onChange({ ...s, nom: e.target.value })} placeholder="Bâtiment A" aria-label="Nom" autoFocus={autoFocus} />
      </Td>
      <Td numeric>
        <Input value={s.anneeConstruction} onChange={(e) => onChange({ ...s, anneeConstruction: e.target.value })} inputMode="numeric" largeur="auto" className="w-20 text-right tabular-nums" aria-label="Année de construction" />
      </Td>
      <Td numeric>
        <Input value={s.nombreEtages} onChange={(e) => onChange({ ...s, nombreEtages: e.target.value })} inputMode="numeric" largeur="auto" className="w-16 text-right tabular-nums" aria-label="Étages" />
      </Td>
      <Td numeric>
        <Input value={s.nombreAscenseurs} onChange={(e) => onChange({ ...s, nombreAscenseurs: e.target.value })} inputMode="numeric" largeur="auto" className="w-16 text-right tabular-nums" aria-label="Ascenseurs" />
      </Td>
      <Td>
        <Select value={s.etiquetteEnergie} onChange={(e) => onChange({ ...s, etiquetteEnergie: e.target.value })} largeur="auto" aria-label="Étiquette énergie">
          <option value="">Non renseignée</option>
          {ETIQUETTES_ENERGIE.map((e) => (
            <option key={e} value={e}>
              {LIBELLE_ETIQUETTE_ENERGIE[e]}
            </option>
          ))}
        </Select>
      </Td>
    </>
  );
}

export function ListeBatiments({ coproCode, batiments, nombreBatiments, peutEcrire }: { coproCode: string; batiments: Batiment[]; nombreBatiments: number | null; peutEcrire: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const confirmer = useConfirm();
  const [pending, demarrer] = useTransition();
  const [enEdition, setEnEdition] = useState<{ id: string; s: Saisie } | null>(null);
  const [nouveau, setNouveau] = useState<Saisie | null>(null);

  const manquants = nombreBatiments === null ? 0 : Math.max(0, nombreBatiments - batiments.length);
  const lettres = manquants > 0 ? `${lettreBatiment(batiments.length)}${manquants > 1 ? ` à ${lettreBatiment(batiments.length + manquants - 1)}` : ""}` : "";

  function apres(message: string) {
    toast.ok(message);
    setEnEdition(null);
    setNouveau(null);
    router.refresh();
  }

  function creer() {
    if (!nouveau) return;
    const p = versPayload(nouveau);
    if (typeof p === "string") return toast.err(p);
    demarrer(async () => {
      const res = await creerBatimentAction({ coproCode, ...p });
      if (!res.ok) return toast.err(res.erreur);
      apres(`${p.nom} ajouté.`);
    });
  }

  function enregistrer() {
    if (!enEdition) return;
    const p = versPayload(enEdition.s);
    if (typeof p === "string") return toast.err(p);
    demarrer(async () => {
      const res = await modifierBatimentAction({ coproCode, batimentId: enEdition.id, ...p });
      if (!res.ok) return toast.err(res.erreur);
      apres(`${p.nom} enregistré.`);
    });
  }

  async function supprimer(b: Batiment) {
    if (!(await confirmer({ titre: `Supprimer ${b.nom} ?`, message: "La ligne disparaît de la fiche immeuble ; le journal garde la trace de la suppression.", confirmer: "Supprimer", danger: true }))) return;
    demarrer(async () => {
      const res = await supprimerBatimentAction({ coproCode, batimentId: b.id });
      if (!res.ok) return toast.err(res.erreur);
      apres(`${b.nom} supprimé.`);
    });
  }

  function prefiller() {
    demarrer(async () => {
      const res = await prefillerBatimentsAction({ coproCode });
      if (!res.ok) return toast.err(res.erreur);
      const n = res.donnees?.crees ?? 0;
      apres(`${n} bâtiment${n > 1 ? "s" : ""} créé${n > 1 ? "s" : ""} : à compléter ligne par ligne.`);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-body font-semibold text-ink">
          Bâtiments
          <span className="ml-2 font-normal text-ink-2 tabular-nums">{batiments.length}{nombreBatiments !== null && nombreBatiments !== batiments.length ? ` sur ${nombreBatiments} annoncés` : ""}</span>
        </span>
        {peutEcrire && (
          <span className="flex items-center gap-1.5">
            {manquants > 0 && (
              <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={prefiller} title={`Crée ${manquants} bâtiment${manquants > 1 ? "s" : ""} (${lettres}) à compléter ensuite`}>
                <WandSparkles strokeWidth={1.5} /> Pré-remplir {lettres}
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" disabled={pending || nouveau !== null} onClick={() => setNouveau({ ...VIDE, nom: `Bâtiment ${lettreBatiment(batiments.length)}` })}>
              <Plus strokeWidth={1.5} /> Ajouter un bâtiment
            </Button>
          </span>
        )}
      </div>

      {batiments.length === 0 && !nouveau ? (
        <EmptyState icone={Building2} compact>
          Aucun bâtiment saisi.
        </EmptyState>
      ) : (
        <Table dense>
          <Thead>
            <tr>
              <Th>Nom</Th>
              <Th numeric>Année</Th>
              <Th numeric>Étages</Th>
              <Th numeric>Ascenseurs</Th>
              <Th>Étiquette énergie</Th>
              {peutEcrire && <Th numeric> </Th>}
            </tr>
          </Thead>
          <Tbody>
            {batiments.map((b) =>
              enEdition?.id === b.id ? (
                <Tr key={b.id}>
                  <Cellules s={enEdition.s} onChange={(s) => setEnEdition({ id: b.id, s })} autoFocus />
                  <Td numeric>
                    <span className="flex items-center justify-end gap-1">
                      <Button type="button" variant="primary" size="sm" loading={pending} onClick={enregistrer}>
                        <Save strokeWidth={1.5} /> Enregistrer
                      </Button>
                      <Button type="button" variant="ghost" size="sm" iconOnly aria-label="Annuler" disabled={pending} onClick={() => setEnEdition(null)}>
                        <X strokeWidth={1.5} />
                      </Button>
                    </span>
                  </Td>
                </Tr>
              ) : (
                <Tr key={b.id}>
                  <Td principal>{b.nom}</Td>
                  <Td numeric secondaire={b.anneeConstruction === null}>{b.anneeConstruction ?? "à renseigner"}</Td>
                  <Td numeric secondaire={b.nombreEtages === null}>{b.nombreEtages ?? "à renseigner"}</Td>
                  <Td numeric secondaire={b.nombreAscenseurs === null}>{b.nombreAscenseurs ?? "à renseigner"}</Td>
                  <Td secondaire={b.etiquetteEnergie === null}>{b.etiquetteEnergie ? (LIBELLE_ETIQUETTE_ENERGIE as Record<string, string>)[b.etiquetteEnergie] ?? b.etiquetteEnergie : "à renseigner"}</Td>
                  {peutEcrire && (
                    <Td numeric>
                      <span className="flex items-center justify-end gap-1">
                        <Button type="button" variant="ghost" size="sm" iconOnly aria-label={`Modifier ${b.nom}`} disabled={pending} onClick={() => setEnEdition({ id: b.id, s: depuis(b) })}>
                          <Pencil strokeWidth={1.5} />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" iconOnly aria-label={`Supprimer ${b.nom}`} disabled={pending} onClick={() => supprimer(b)}>
                          <Trash2 strokeWidth={1.5} />
                        </Button>
                      </span>
                    </Td>
                  )}
                </Tr>
              ),
            )}
            {nouveau && (
              <Tr>
                <Cellules s={nouveau} onChange={setNouveau} autoFocus />
                <Td numeric>
                  <span className="flex items-center justify-end gap-1">
                    <Button type="button" variant="primary" size="sm" loading={pending} onClick={creer}>
                      <Save strokeWidth={1.5} /> Créer
                    </Button>
                    <Button type="button" variant="ghost" size="sm" iconOnly aria-label="Annuler" disabled={pending} onClick={() => setNouveau(null)}>
                      <X strokeWidth={1.5} />
                    </Button>
                  </span>
                </Td>
              </Tr>
            )}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
