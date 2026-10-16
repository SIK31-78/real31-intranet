"use client";

// La section « CTQ ascenseur » : un bloc par appareil (identifiant, dernier contrôle, le cycle
// en cours et ses étapes), l'action groupée quand il y a plusieurs appareils, les devis portés
// par la copro, les documents. « Ajouter un appareil » crée l'ascenseur et son premier cycle.

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, Check, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { DataList, DataRow } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { Choix, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { Section } from "@/components/ui/section";
import { SectionRepliable } from "@/components/ui/section-repliable";
import { useToast } from "@/components/ui/toast";
import { ETAPES, LIBELLE_SUJET, type Ascenseur, type DonneesOffresMailCs } from "@/lib/domain/contrats-copro";
import type { CycleVue, SuiviCopro } from "@/lib/services/contrats-copro/types";
import { creerAppareilAction, daterEtapeGroupeeAction, modifierAppareilAction } from "@/app/contrats-copro/actions";
import { cyclesEnCours, cyclesPasses, jour, ouNull, pluriel } from "./commun";
import { BoutonCompteurs } from "./contrat-courant";
import { CycleBloc } from "./cycle-bloc";
import { BoutonDemarrerSuivi } from "./demarrer-suivi";
import { DevisSujet } from "./devis";
import { DocumentsSujet, type CibleDepot } from "./documents";
import { BoutonMailCs } from "./mail-cs";

const SUJET = "ctq_ascenseur" as const;

export function SectionAscenseurs({ suivi, aujourdhuiISO }: { suivi: SuiviCopro; aujourdhuiISO: string }) {
  const { coproCode, peutEcrire, contrat } = suivi;
  const { appareils, devis, devisRetenuId, documents, concerne } = suivi.ctqAscenseur;
  const [ajout, setAjout] = useState(false);
  const id = "contrats-ctq-ascenseur";
  const titre = LIBELLE_SUJET[SUJET];
  const declares = contrat.compteurs.ascenseurs;

  if (!concerne) {
    return (
      <SectionRepliable id={id} titre={titre} resume="Non concerné">
        <Callout ton="neutral" titre="Non concerné" actions={<BoutonCompteurs coproCode={coproCode} contrat={contrat} peutEcrire={peutEcrire} />}>
          {declares === null ? "Nombre d'ascenseurs jamais renseigné" : `${pluriel(declares, "ascenseur")} déclaré${declares > 1 ? "s" : ""}`}
        </Callout>
      </SectionRepliable>
    );
  }

  const enCoursTous = appareils.flatMap((a) => cyclesEnCours(a.cycles));
  const donneesMail: DonneesOffresMailCs = { devis, devisRetenuId };
  const nbDevis = devis.filter((d) => !d.supprimeeLeISO).length;
  const cibles: CibleDepot[] = [{ type: "copro", id: coproCode, libelle: "La copropriété" }, ...devis.filter((d) => !d.supprimeeLeISO).map((d) => ({ type: "devis_ctq" as const, id: d.id, libelle: `Devis ${d.prestataire}` }))];

  const actions: ReactNode = (
    <>
      {peutEcrire && suivi.mailActif && nbDevis > 0 && <BoutonMailCs coproCode={coproCode} sujet={SUJET} donnees={donneesMail} />}
      {peutEcrire && (
        <Button type="button" variant="secondary" size="sm" onClick={() => setAjout(true)}>
          <Plus strokeWidth={1.5} /> Ajouter un appareil
        </Button>
      )}
    </>
  );

  return (
    <Section id={id} titre={titre} compte={appareils.length || undefined} actions={actions}>
      <div className="grid grid-cols-1 gap-4 items-start lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-4 min-w-0">
          {peutEcrire && appareils.length >= 2 && enCoursTous.length > 0 && <ActionGroupee coproCode={coproCode} aujourdhuiISO={aujourdhuiISO} nombre={enCoursTous.length} />}

          {appareils.length === 0 ? (
            <Card>
              <CardBody>
                <EmptyState
                  icone={ArrowUpDown}
                  action={
                    peutEcrire ? (
                      <Button type="button" variant="secondary" onClick={() => setAjout(true)}>
                        <Plus strokeWidth={1.5} /> Ajouter un appareil
                      </Button>
                    ) : undefined
                  }
                >
                  {declares ? `${pluriel(declares, "ascenseur")} déclaré${declares > 1 ? "s" : ""}, aucun appareil créé` : "Aucun appareil créé"}
                </EmptyState>
              </CardBody>
            </Card>
          ) : (
            appareils.map((a) => <CarteAppareil key={a.ascenseur.id} coproCode={coproCode} appareil={a.ascenseur} cycles={a.cycles} peutEcrire={peutEcrire} aujourdhuiISO={aujourdhuiISO} />)
          )}

          <DevisSujet coproCode={coproCode} sujet={SUJET} devis={devis} devisRetenuId={devisRetenuId} peutEcrire={peutEcrire} aujourdhuiISO={aujourdhuiISO} />
          <DocumentsSujet coproCode={coproCode} sujet={SUJET} documents={documents} peutEcrire={peutEcrire} depotActif={suivi.depotActif} cibles={cibles} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Appareils</CardTitle>
            <BoutonCompteurs coproCode={coproCode} contrat={contrat} peutEcrire={peutEcrire} libelle="Corriger" />
          </CardHeader>
          <CardBody padding="sm">
            <DataList align="left">
              <DataRow label="Déclarés">{declares === null ? <span className="font-normal text-ink-3">jamais renseigné</span> : String(declares)}</DataRow>
              <DataRow label="Suivis" ton={declares !== null && declares !== appareils.length ? "warn" : undefined}>
                {String(appareils.length)}
              </DataRow>
              <DataRow label="Contrôles en cours">{String(enCoursTous.length)}</DataRow>
            </DataList>
          </CardBody>
        </Card>
      </div>
      {ajout && <ModaleAppareil coproCode={coproCode} aujourdhuiISO={aujourdhuiISO} onFermer={() => setAjout(false)} />}
    </Section>
  );
}

// --- Un appareil ------------------------------------------------------------------------------

function CarteAppareil({ coproCode, appareil, cycles, peutEcrire, aujourdhuiISO }: { coproCode: string; appareil: Ascenseur; cycles: CycleVue[]; peutEcrire: boolean; aujourdhuiISO: string }) {
  const [edition, setEdition] = useState(false);
  const enCours = cyclesEnCours(cycles);
  const passes = cyclesPasses(cycles);
  // L'historique est trié du plus récent au plus ancien : seul le premier clos se re-clôture.
  const dernierClosId = passes.find((v) => v.cycle.statut === "clos")?.cycle.id ?? null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <ArrowUpDown strokeWidth={1.5} aria-hidden />
          {appareil.identifiant ?? <span className="font-normal text-ink-3">Appareil sans identifiant</span>}
          <span className="font-normal text-ink-2">· dernier contrôle {appareil.dernierCtqISO ? `le ${jour(appareil.dernierCtqISO)}` : "inconnu"}</span>
        </CardTitle>
        {peutEcrire && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setEdition(true)}>
            <Pencil strokeWidth={1.5} /> Modifier
          </Button>
        )}
      </CardHeader>
      <CardBody padding="sm" className="flex flex-col gap-3">
        {enCours.length === 0 ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-body text-ink-2">Aucun contrôle en cours.</span>
            {peutEcrire && <BoutonDemarrerSuivi coproCode={coproCode} sujet={SUJET} ascenseurId={appareil.id} />}
          </div>
        ) : (
          enCours.map((v) => <CycleBloc key={v.cycle.id} coproCode={coproCode} sujet={SUJET} vue={v} peutEcrire={peutEcrire} aujourdhuiISO={aujourdhuiISO} encadre={false} />)
        )}
        {appareil.notes && <p className="text-meta text-ink-2 whitespace-pre-line">{appareil.notes}</p>}
        {passes.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer select-none text-body text-ink-2 hover:text-ink list-none [&::-webkit-details-marker]:hidden rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600">
              Historique ({passes.length})
            </summary>
            <div className="mt-2 flex flex-col gap-3 border-t border-line pt-3">
              {passes.map((v) => (
                <CycleBloc key={v.cycle.id} coproCode={coproCode} sujet={SUJET} vue={v} peutEcrire={peutEcrire} aujourdhuiISO={aujourdhuiISO} encadre={false} reClotureAutorisee={v.cycle.id === dernierClosId} />
              ))}
            </div>
          </details>
        )}
      </CardBody>
      {edition && <ModaleAppareil coproCode={coproCode} appareil={appareil} aujourdhuiISO={aujourdhuiISO} onFermer={() => setEdition(false)} />}
    </Card>
  );
}

// --- Dater une étape pour tous les ascenseurs ---------------------------------------------------

function ActionGroupee({ coproCode, aujourdhuiISO, nombre }: { coproCode: string; aujourdhuiISO: string; nombre: number }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const etapes = ETAPES[SUJET].filter((e) => !e.terminale);
  const [etape, setEtape] = useState(etapes[0].cle);
  const [date, setDate] = useState(aujourdhuiISO);

  function enregistrer() {
    demarrer(async () => {
      const res = await daterEtapeGroupeeAction({ coproCode, etape, dateISO: date });
      if (!res.ok) return toast.err(res.erreur);
      const libelle = etapes.find((e) => e.cle === etape)?.libelle ?? etape;
      toast.ok(`« ${libelle} » datée du ${jour(date)} sur ${pluriel(res.donnees?.nombre ?? nombre, "ascenseur")}.`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2/40 px-3 py-2">
      <label htmlFor="groupee-etape" className="text-body text-ink-2">
        Dater une étape pour tous les ascenseurs
      </label>
      <Select id="groupee-etape" largeur="auto" value={etape} onChange={(e) => setEtape(e.target.value)}>
        {etapes.map((e) => (
          <option key={e.cle} value={e.cle}>
            {e.libelle}
          </option>
        ))}
      </Select>
      <Input type="date" largeur="auto" className="w-40" max={aujourdhuiISO} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date de l'étape" />
      <Button type="button" variant="secondary" size="sm" loading={pending} disabled={!date || date > aujourdhuiISO} onClick={enregistrer}>
        <Check strokeWidth={1.5} /> Enregistrer
      </Button>
    </div>
  );
}

// --- Créer / modifier un appareil ---------------------------------------------------------------

function ModaleAppareil({ coproCode, appareil, aujourdhuiISO, onFermer }: { coproCode: string; appareil?: Ascenseur; aujourdhuiISO: string; onFermer: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [identifiant, setIdentifiant] = useState(appareil?.identifiant ?? "");
  const [dernierCtq, setDernierCtq] = useState(appareil?.dernierCtqISO ?? "");
  const [notes, setNotes] = useState(appareil?.notes ?? "");
  const [ouvrirCycle, setOuvrirCycle] = useState(true);

  function valider() {
    demarrer(async () => {
      const champs = { identifiant: ouNull(identifiant), dernierCtqISO: ouNull(dernierCtq), notes: ouNull(notes) };
      const res = appareil ? await modifierAppareilAction({ coproCode, ascenseurId: appareil.id, ...champs }) : await creerAppareilAction({ coproCode, ...champs, ouvrirCycle });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(appareil ? "Appareil modifié." : `Appareil ${identifiant.trim() || "sans identifiant"} créé.`);
      onFermer();
      router.refresh();
    });
  }

  return (
    <Modal titre={appareil ? "Modifier l'appareil" : "Ajouter un appareil"} onFermer={onFermer} size="sm">
      <ModalBody>
        <div className="flex flex-col gap-3">
          <Field label="Identifiant" htmlFor="app-identifiant" hint="Référence chez l'ascensoriste (OTIS-1204-A, cage B…).">
            <Input id="app-identifiant" value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} autoFocus autoComplete="off" />
          </Field>
          <Field label="Dernier contrôle quinquennal" htmlFor="app-ctq" hint={appareil ? "Changer la date recale l'échéance du cycle en cours s'il n'a pas encore d'étape." : "L'échéance du premier cycle en découle (dans 5 ans)."}>
            <Input id="app-ctq" type="date" max={aujourdhuiISO} value={dernierCtq} onChange={(e) => setDernierCtq(e.target.value)} />
          </Field>
          <Field label="Notes (facultatif)" htmlFor="app-notes">
            <Textarea id="app-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {!appareil && <Choix type="checkbox" checked={ouvrirCycle} onChange={(e) => setOuvrirCycle(e.target.checked)} label="Ouvrir le suivi du prochain contrôle" />}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onFermer}>
          Annuler
        </Button>
        <Button variant="primary" loading={pending} onClick={valider}>
          {appareil ? "Enregistrer" : "Créer l'appareil"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
