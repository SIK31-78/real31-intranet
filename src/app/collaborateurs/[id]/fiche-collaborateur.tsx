"use client";

// La fiche d'un collaborateur : son portefeuille (reaffectable copro par copro), ses
// habilitations, et le depart - qui reaffecte tout le portefeuille avant de desactiver.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, ShieldCheck, Undo2 } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input, Select } from "@/components/ui/field";
import { Section } from "@/components/ui/section";
import { Table, Thead, Tbody, Th, Tr, Td } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { formatJour } from "@/lib/services/facturation/format";
import { DETAIL_FONCTION, FONCTIONS, LIBELLE_HABILITATION, LIBELLE_ROLE_TABLE, type EquipeCopro, type Fonction, type RoleEquipe, type RoleTable } from "@/lib/domain/collaborateur";
import type { FicheCollaborateur as Fiche } from "@/lib/services/collaborateurs/collaborateurs";
import { annulerDepartAction, departAction, fonctionAction, habilitationAction, reaffecterAction } from "@/app/collaborateurs/actions";

const ROLES: { role: RoleEquipe; titre: string; cle: keyof Fiche["portefeuille"] }[] = [
  { role: "gestionnaire", titre: "Gestionnaire de", cle: "gestionnaire" },
  { role: "assistant", titre: "Assistant de", cle: "assistant" },
  { role: "comptable", titre: "Comptable de", cle: "comptable" },
];

export function FicheCollaborateur({ fiche }: { fiche: Fiche }) {
  const router = useRouter();
  const toast = useToast();
  const confirmer = useConfirm();
  const [pending, demarrer] = useTransition();
  const c = fiche.collaborateur;
  const [departOuvert, setDepartOuvert] = useState(false);
  const [departISO, setDepartISO] = useState(new Date().toISOString().slice(0, 10));
  const [remplacants, setRemplacants] = useState<{ gestionnaire: string; assistant: string; comptable: string }>({ gestionnaire: "", assistant: "", comptable: "" });
  const [noteDepart, setNoteDepart] = useState("");
  const [agenceRef, setAgenceRef] = useState(fiche.agences[0]?.code ?? "");
  const [fonction, setFonction] = useState<Fonction | "">((c.fonction as Fonction | undefined) ?? "");

  const collegue = (id: string | undefined) => fiche.collegues.find((x) => x.id === id)?.nomComplet ?? (id ? "?" : "—");

  function reaffecter(e: EquipeCopro, role: RoleEquipe, userId: string) {
    demarrer(async () => {
      const res = await reaffecterAction({ coproCode: e.code, role, userId: userId || null, depuis: c.id });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(`${e.code} : ${role} → ${userId ? collegue(userId) : "personne"}.`);
      router.refresh();
    });
  }

  async function depart() {
    const total = ROLES.reduce((n, r) => n + fiche.portefeuille[r.cle].length, 0);
    const ok = await confirmer({
      titre: `Départ de ${c.nomComplet} le ${formatJour(departISO)} ?`,
      message: `${total} copropriété${total > 1 ? "s" : ""} seront réaffectées, puis la personne passera inactive dans le référentiel et sortira des sélecteurs.`,
      confirmer: "Confirmer le départ",
      danger: true,
    });
    if (!ok) return;
    demarrer(async () => {
      const res = await departAction({ userId: c.id, departISO, remplacants: { gestionnaire: remplacants.gestionnaire || undefined, assistant: remplacants.assistant || undefined, comptable: remplacants.comptable || undefined }, note: noteDepart || undefined });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(`Départ noté, ${res.donnees?.reaffectees ?? 0} copropriété(s) réaffectée(s).`);
      setDepartOuvert(false);
      router.refresh();
    });
  }

  const habilitationsEnCours = c.habilitations.filter((h) => !h.jusquaISO);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">
      <div className="flex flex-col gap-5 min-w-0">
        {ROLES.map(({ role, titre, cle }) => {
          const lignes = fiche.portefeuille[cle];
          if (lignes.length === 0) return null;
          return (
            <Section key={role} id={`pf-${role}`} titre={`${titre} ${lignes.length} copropriété${lignes.length > 1 ? "s" : ""}`}>
              <Card>
                <CardBody className="p-0">
                  <Table>
                    <Thead>
                      <tr>
                        <Th>Copropriété</Th>
                        <Th>Gestionnaire</Th>
                        <Th>Assistant</Th>
                        <Th>Confier à</Th>
                      </tr>
                    </Thead>
                    <Tbody>
                      {lignes.map((e) => (
                        <Tr key={e.code}>
                          <Td principal><Link href={`/copros/${e.code}`} className="hover:underline"><span className="font-mono text-ink-2">{e.code}</span> {e.nom}</Link></Td>
                          <Td secondaire>{e.managerId === c.id ? <strong>{c.nomComplet}</strong> : collegue(e.managerId)}</Td>
                          <Td secondaire>{e.assistantId === c.id ? <strong>{c.nomComplet}</strong> : collegue(e.assistantId)}</Td>
                          <Td>
                            <Select value="" onChange={(ev) => ev.target.value && reaffecter(e, role, ev.target.value)} disabled={pending} largeur="auto">
                              <option value="">—</option>
                              {fiche.collegues.map((x) => <option key={x.id} value={x.id}>{x.nomComplet}</option>)}
                            </Select>
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </CardBody>
              </Card>
            </Section>
          );
        })}
        {ROLES.every((r) => fiche.portefeuille[r.cle].length === 0) && <p className="text-body text-ink-2">Aucune copropriété au portefeuille.</p>}
      </div>

      <Card>
        <div className="divide-y divide-line">
          <div className="flex flex-col gap-3 p-4">
            <h2 className="text-body font-medium text-ink">Fonction</h2>
            <p className="text-meta text-ink-3">Rôle au référentiel : {c.roleTable ? (LIBELLE_ROLE_TABLE[c.roleTable as RoleTable] ?? c.roleTable) : "—"}. La fonction intranet le précise et ouvrira ses outils ; la changer remet le rôle en cohérence.</p>
            <div className="flex items-end gap-2">
              <Field label="Fonction" htmlFor="fn" className="flex-1">
                <Select id="fn" value={fonction} onChange={(e) => setFonction(e.target.value as Fonction | "")}>
                  <option value="">—</option>
                  {FONCTIONS.map((f) => <option key={f} value={f}>{DETAIL_FONCTION[f].libelle}</option>)}
                </Select>
              </Field>
              <Button type="button" variant="secondary" size="sm" disabled={pending || !fonction || fonction === c.fonction} onClick={() => demarrer(async () => { const r = await fonctionAction({ userId: c.id, fonction }); if (!r.ok) return toast.err(r.erreur); toast.ok("Fonction enregistrée."); router.refresh(); })}>
                Enregistrer
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-3 p-4">
            <h2 className="text-body font-medium text-ink">Habilitations</h2>
            {habilitationsEnCours.length === 0 && <p className="text-meta text-ink-3">Aucune. Le rôle vient du référentiel.</p>}
            {habilitationsEnCours.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-2">
                <span className="text-body">Référent syndic <strong>{h.agence}</strong> <span className="text-meta text-ink-3">depuis le {formatJour(h.depuisISO)}</span></span>
                <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => demarrer(async () => { const r = await habilitationAction({ action: "clore", userId: c.id, id: h.id }); if (!r.ok) return toast.err(r.erreur); router.refresh(); })}>Retirer</Button>
              </div>
            ))}
            <div className="flex items-end gap-2">
              <Field label="Référent syndic de" htmlFor="hab-agence" hint={LIBELLE_HABILITATION.referent_syndic}>
                <Select id="hab-agence" value={agenceRef} onChange={(e) => setAgenceRef(e.target.value)} largeur="auto">
                  {fiche.agences.map((a) => <option key={a.id} value={a.code}>{a.code}</option>)}
                </Select>
              </Field>
              <Button type="button" variant="secondary" size="sm" disabled={pending || !agenceRef} onClick={() => demarrer(async () => { const r = await habilitationAction({ action: "ajouter", userId: c.id, type: "referent_syndic", agence: agenceRef }); if (!r.ok) return toast.err(r.erreur); toast.ok("Habilitation ajoutée."); router.refresh(); })}>
                <ShieldCheck strokeWidth={1.5} /> Ajouter
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 p-4">
            <h2 className="text-body font-medium text-ink">Départ</h2>
            {c.departISO ? (
              <>
                <p className="text-body text-ink-2">Parti le {formatJour(c.departISO)}.</p>
                <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => demarrer(async () => { const r = await annulerDepartAction(c.id); if (!r.ok) return toast.err(r.erreur); toast.ok("Départ annulé."); router.refresh(); })}>
                  <Undo2 strokeWidth={1.5} /> Annuler le départ
                </Button>
              </>
            ) : !departOuvert ? (
              <Button type="button" variant="danger" size="sm" onClick={() => setDepartOuvert(true)}><LogOut strokeWidth={1.5} /> Déclarer un départ</Button>
            ) : (
              <>
                <Field label="Le" htmlFor="dep-date"><Input id="dep-date" type="date" value={departISO} onChange={(e) => setDepartISO(e.target.value)} /></Field>
                {ROLES.filter((r) => fiche.portefeuille[r.cle].length > 0).map((r) => (
                  <Field key={r.role} label={`${fiche.portefeuille[r.cle].length} copropriété(s) en ${r.role} → confier à`} htmlFor={`dep-${r.role}`} requis>
                    <Select id={`dep-${r.role}`} value={remplacants[r.role]} onChange={(e) => setRemplacants({ ...remplacants, [r.role]: e.target.value })}>
                      <option value="">—</option>
                      {fiche.collegues.map((x) => <option key={x.id} value={x.id}>{x.nomComplet}</option>)}
                    </Select>
                  </Field>
                ))}
                <Field label="Note" htmlFor="dep-note"><Input id="dep-note" value={noteDepart} onChange={(e) => setNoteDepart(e.target.value)} placeholder="motif, remplaçant…" /></Field>
                <Callout ton="warn">La personne passera inactive dans le référentiel et sortira des sélecteurs. Ses copropriétés changeront de {ROLES.filter((r) => fiche.portefeuille[r.cle].length > 0).map((r) => r.role).join(" / ") || "responsable"}.</Callout>
                <div className="flex items-center justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setDepartOuvert(false)}>Annuler</Button>
                  <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={depart}>
                    {pending ? <Loader2 strokeWidth={1.5} className="animate-spin" /> : <LogOut strokeWidth={1.5} />} Confirmer le départ
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
