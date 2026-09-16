"use client";

// Le bareme d'une annee, par famille, editable en ligne : on corrige un montant, on
// enregistre la ligne. Une ligne se cree en bas de sa famille, se supprime avec
// confirmation. « Ouvrir l'annee » copie la precedente, avec ou sans majoration.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input } from "@/components/ui/field";
import { Section } from "@/components/ui/section";
import { Table, Thead, Tbody, Th, Tr, Td } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { LIBELLE_FAMILLE, type FamilleBareme } from "@/lib/domain/facturation/bareme-admin";
import type { BaremeAnnee } from "@/lib/services/admin/bareme";
import { enregistrerTarifAction, ouvrirAnneeAction, supprimerTarifAction } from "@/app/admin/tarifs/actions";

const FAMILLES: FamilleBareme[] = ["forfait", "contrat", "prestations", "autres"];

export function TarifsAdminVue({ bareme }: { bareme: BaremeAnnee }) {
  const router = useRouter();
  const toast = useToast();
  const confirmer = useConfirm();
  const [pending, demarrer] = useTransition();
  const [majoration, setMajoration] = useState("0");
  // Les montants en cours d'edition, par identifiant (chaine, pour laisser taper une virgule).
  const [saisies, setSaisies] = useState<Record<string, { libelle: string; montant: string }>>({});
  const [nouvelle, setNouvelle] = useState<{ famille: FamilleBareme; identifiant: string; libelle: string; montant: string } | null>(null);

  const valeur = (id: string, champ: "libelle" | "montant", defaut: string) => saisies[id]?.[champ] ?? defaut;
  const modifie = (id: string, libelle: string, montant: number) => saisies[id] !== undefined && (saisies[id].libelle !== libelle || Number(saisies[id].montant.replace(",", ".")) !== montant);

  function enregistrer(identifiantPrestation: string, libelle: string, montant: string) {
    demarrer(async () => {
      const res = await enregistrerTarifAction({ annee: bareme.annee, identifiantPrestation, libelle, montantTtc: Number(montant.replace(",", ".")) });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(`${identifiantPrestation} ${bareme.annee} enregistré.`);
      setSaisies((s) => Object.fromEntries(Object.entries(s).filter(([k]) => k !== identifiantPrestation)));
      setNouvelle(null);
      router.refresh();
    });
  }

  async function supprimer(identifiantPrestation: string) {
    if (!(await confirmer({ titre: `Retirer ${identifiantPrestation} du barème ${bareme.annee} ?`, message: "Les contrats déjà enregistrés gardent leur tarif figé ; une facturation qui s'appuie sur le barème de l'année ne trouvera plus cette ligne.", confirmer: "Retirer", danger: true }))) return;
    demarrer(async () => {
      const res = await supprimerTarifAction({ annee: bareme.annee, identifiantPrestation });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok("Ligne retirée.");
      router.refresh();
    });
  }

  function ouvrir() {
    if (!bareme.precedente) return;
    const source = bareme.precedente;
    demarrer(async () => {
      const res = await ouvrirAnneeAction({ cible: bareme.annee, source, majorationPourcent: Number(majoration.replace(",", ".")) || 0 });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(`${res.donnees?.creees ?? 0} tarifs copiés de ${source} vers ${bareme.annee}.`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {bareme.lignes.length === 0 && bareme.precedente && (
        <Callout
          ton="info"
          titre={`Le barème ${bareme.annee} est vide`}
          actions={
            <span className="flex items-center gap-2">
              <Field label="Majoration %" htmlFor="ba-maj" inline><Input id="ba-maj" value={majoration} onChange={(e) => setMajoration(e.target.value)} largeur="auto" className="w-20 tabular-nums" /></Field>
              <Button type="button" variant="primary" size="sm" disabled={pending} onClick={ouvrir}><Copy strokeWidth={1.5} /> Copier {bareme.precedente}</Button>
            </span>
          }
        >
          Ouvrez-le en copiant {bareme.precedente}, tel quel ou majoré, puis retouchez les lignes.
        </Callout>
      )}
      {bareme.manquants.length > 0 && bareme.lignes.length > 0 && (
        <Callout ton="warn" titre={`${bareme.manquants.length} identifiant${bareme.manquants.length > 1 ? "s" : ""} attendu${bareme.manquants.length > 1 ? "s" : ""} par l'application, absent${bareme.manquants.length > 1 ? "s" : ""} en ${bareme.annee}`} actions={bareme.precedente ? <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={ouvrir}><Copy strokeWidth={1.5} /> Compléter depuis {bareme.precedente}</Button> : undefined}>
          {bareme.manquants.join(", ")}
        </Callout>
      )}

      {FAMILLES.map((famille) => {
        const lignes = bareme.lignes.filter((l) => l.famille === famille);
        if (lignes.length === 0 && famille !== "autres") return null;
        return (
          <Section
            key={famille}
            id={`bareme-${famille}`}
            titre={LIBELLE_FAMILLE[famille]}
            compte={lignes.length}
            actions={<Button type="button" variant="ghost" size="sm" onClick={() => setNouvelle({ famille, identifiant: "", libelle: "", montant: "" })}><Plus strokeWidth={1.5} /> Ligne</Button>}
          >
            <Card>
              <CardBody className="p-0">
                <Table>
                  <Thead>
                    <tr>
                      <Th>Identifiant</Th>
                      <Th>Libellé</Th>
                      <Th numeric>Montant TTC</Th>
                      <Th numeric>vs {bareme.precedente ?? "N-1"}</Th>
                      <Th numeric> </Th>
                    </tr>
                  </Thead>
                  <Tbody>
                    {lignes.map((l) => (
                      <Tr key={l.identifiantPrestation}>
                        <Td principal><span className="font-mono text-caption">{l.identifiantPrestation}</span></Td>
                        <Td>
                          <Input value={valeur(l.identifiantPrestation, "libelle", l.libelle)} onChange={(e) => setSaisies((s) => ({ ...s, [l.identifiantPrestation]: { libelle: e.target.value, montant: valeur(l.identifiantPrestation, "montant", String(l.montantTtc)) } }))} />
                        </Td>
                        <Td numeric>
                          <Input value={valeur(l.identifiantPrestation, "montant", String(l.montantTtc))} onChange={(e) => setSaisies((s) => ({ ...s, [l.identifiantPrestation]: { libelle: valeur(l.identifiantPrestation, "libelle", l.libelle), montant: e.target.value } }))} inputMode="decimal" largeur="auto" className="w-28 text-right tabular-nums" />
                        </Td>
                        <Td numeric className="tabular-nums text-ink-3">{l.ecartPourcent === null ? "nouveau" : l.ecartPourcent === 0 ? "=" : `${l.ecartPourcent > 0 ? "+" : ""}${l.ecartPourcent.toLocaleString("fr-FR")} %`}</Td>
                        <Td numeric>
                          <span className="flex items-center justify-end gap-1">
                            {modifie(l.identifiantPrestation, l.libelle, l.montantTtc) && (
                              <Button type="button" variant="primary" size="sm" disabled={pending} onClick={() => enregistrer(l.identifiantPrestation, valeur(l.identifiantPrestation, "libelle", l.libelle), valeur(l.identifiantPrestation, "montant", String(l.montantTtc)))}>
                                <Save strokeWidth={1.5} /> Enregistrer
                              </Button>
                            )}
                            <Button type="button" variant="ghost" size="sm" iconOnly aria-label="Retirer" disabled={pending} onClick={() => supprimer(l.identifiantPrestation)}><Trash2 strokeWidth={1.5} /></Button>
                          </span>
                        </Td>
                      </Tr>
                    ))}
                    {nouvelle?.famille === famille && (
                      <Tr>
                        <Td><Input value={nouvelle.identifiant} onChange={(e) => setNouvelle({ ...nouvelle, identifiant: e.target.value })} placeholder="Identifiant" className="font-mono" autoFocus /></Td>
                        <Td><Input value={nouvelle.libelle} onChange={(e) => setNouvelle({ ...nouvelle, libelle: e.target.value })} placeholder="Libellé imprimé" /></Td>
                        <Td numeric><Input value={nouvelle.montant} onChange={(e) => setNouvelle({ ...nouvelle, montant: e.target.value })} inputMode="decimal" largeur="auto" className="w-28 text-right tabular-nums" placeholder="0,00" /></Td>
                        <Td numeric className="text-ink-3">nouveau</Td>
                        <Td numeric>
                          <span className="flex items-center justify-end gap-1">
                            <Button type="button" variant="primary" size="sm" disabled={pending || !nouvelle.identifiant.trim() || !nouvelle.montant.trim()} onClick={() => enregistrer(nouvelle.identifiant.trim(), nouvelle.libelle, nouvelle.montant)}>
                              {pending ? <Loader2 strokeWidth={1.5} className="animate-spin" /> : <Save strokeWidth={1.5} />} Créer
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setNouvelle(null)}>Annuler</Button>
                          </span>
                        </Td>
                      </Tr>
                    )}
                  </Tbody>
                </Table>
                {lignes.length === 0 && !nouvelle && <p className="p-4 text-caption text-ink-3">Aucune ligne.</p>}
              </CardBody>
            </Card>
          </Section>
        );
      })}
    </div>
  );
}
