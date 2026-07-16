"use client";

// ZONE "Documents annexes" de l'ecran de reprise. En plus des documents canoniques, l'ancien
// syndic transmet des documents VARIABLES mais precieux (liste coproprietaires avec emails,
// courriers, avis de mutation...). Le pipeline annexes en a extrait : le TYPE, un RESUME, des
// CONTACTS (email/telephone) et des precisions (remontees en notes de vigilance ailleurs).
//
// Ici on montre : (1) la liste des annexes analysees, (2) les CONTACTS rapproches aux owners du
// jeu, avec par contact : Valider (ecrit email/telephone sur l'owner), Corriger (choisir un autre
// owner) ou Ignorer. La validation reutilise le mecanisme de corrections (owner.modifier) cote
// serveur (transactionnel + journalise). AUCUNE mutation eStale.
//
// PII : nom/email/telephone s'affichent (app interne) mais ne partent jamais dans un log.

import { useState, useTransition } from "react";
import { FileText, Mail, Phone, Check, X, UserPlus } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { JeuDeDonnees } from "@/lib/reprise/domain/patrimoine";
import type { AnnexeAnalysee, ContactRapproche } from "@/lib/reprise/domain/rapprochement-contacts";
import { validerContactAnnexeAction, ignorerContactAnnexeAction } from "./actions";

const STATUT_TON: Record<ContactRapproche["statut"], "ok" | "warn" | "neutral"> = {
  sur: "ok",
  ambigu: "warn",
  inconnu: "neutral",
};
const STATUT_LABEL: Record<ContactRapproche["statut"], string> = {
  sur: "correspondance sure",
  ambigu: "a confirmer",
  inconnu: "aucun owner apparie",
};

export function DocumentsAnnexesBloc({
  dossierRef,
  jeu,
  annexes,
  contacts: contactsInit,
  onJeuChange,
}: {
  dossierRef: string;
  jeu: JeuDeDonnees;
  annexes: AnnexeAnalysee[];
  contacts: ContactRapproche[];
  onJeuChange: (jeu: JeuDeDonnees) => void;
}) {
  const [contacts, setContacts] = useState<ContactRapproche[]>(contactsInit);

  // Owners du jeu, pour l'affichage du nom rapproche + le selecteur "Corriger".
  const owners = jeu.owners.map((o) => ({
    id: o.id,
    nom: [o.civilite, o.nom, o.prenom].filter(Boolean).join(" ").trim() || o.id,
  }));
  const nomOwner = new Map(owners.map((o) => [o.id, o.nom]));

  const enAttente = contacts.filter((c) => !c.traite);
  const traites = contacts.filter((c) => c.traite);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents annexes</CardTitle>
        <span className="text-[11px] text-ink-4">
          Contacts & precisions extraits des documents variables (liste, courrier, mutation...)
        </span>
      </CardHeader>

      <div className="p-4 flex flex-col gap-4">
        {/* Liste des annexes analysees */}
        {annexes.length > 0 && (
          <section>
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">
              Annexes analysees ({annexes.length})
            </h3>
            <ul className="mt-2 flex flex-col gap-1.5">
              {annexes.map((a, i) => (
                <li key={`${a.nom}:${i}`} className="rounded-md border border-line bg-surface-2 px-3 py-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <FileText strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-4 shrink-0" />
                    <span className="text-[12.5px] text-ink truncate">{a.nom}</span>
                    <Badge ton="info">{a.typeDetecte}</Badge>
                  </div>
                  {a.resume && <p className="mt-1 text-[12px] text-ink-3">{a.resume}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Contacts rapproches - en attente de decision */}
        <section>
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">
            Contacts a rapprocher ({enAttente.length})
          </h3>
          <p className="mt-1 text-[12px] text-ink-3">
            Chaque contact d&apos;une annexe est rapproche d&apos;un coproprietaire du jeu. Valider ecrit son email
            et son telephone sur l&apos;owner (jeu local ; aucune ecriture eStale). Les precisions importantes
            remontent en notes de vigilance.
          </p>

          {enAttente.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2">
              {enAttente.map((c) => (
                <LigneContact
                  key={c.id}
                  dossierRef={dossierRef}
                  contact={c}
                  owners={owners}
                  onDone={(nouveauxContacts, nouveauJeu) => {
                    setContacts(nouveauxContacts);
                    if (nouveauJeu) onJeuChange(nouveauJeu);
                  }}
                />
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[12px] text-ink-3">
              {contacts.length > 0 ? "Tous les contacts ont ete traites." : "Aucun contact extrait des annexes."}
            </p>
          )}
        </section>

        {/* Contacts deja traites (valides / ignores) */}
        {traites.length > 0 && (
          <section>
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Traites ({traites.length})</h3>
            <ul className="mt-2 flex flex-col gap-1">
              {traites.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-[12px] text-ink-3">
                  <Badge ton={c.traite === "valide" ? "ok" : "neutral"} dot>
                    {c.traite === "valide" ? "reporte" : "ignore"}
                  </Badge>
                  <span className="truncate">{c.nom}</span>
                  {c.traite === "valide" && c.ownerId && (
                    <span className="text-ink-4 truncate">-&gt; {nomOwner.get(c.ownerId) ?? c.ownerId}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Card>
  );
}

function LigneContact({
  dossierRef,
  contact,
  owners,
  onDone,
}: {
  dossierRef: string;
  contact: ContactRapproche;
  owners: { id: string; nom: string }[];
  onDone: (contacts: ContactRapproche[], jeu?: JeuDeDonnees) => void;
}) {
  const [choix, setChoix] = useState<string>(contact.ownerId ?? "");
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const rienAReporter = !contact.email && !contact.telephone;

  const valider = () => {
    if (!choix) {
      toast.err("Choisis un coproprietaire a rattacher.");
      return;
    }
    startTransition(async () => {
      const r = await validerContactAnnexeAction(dossierRef, contact.id, choix);
      if (r.ok) {
        onDone(r.contacts, r.jeu);
        toast.ok("Email / telephone reporte sur le coproprietaire.");
      } else {
        toast.err(r.message);
      }
    });
  };

  const ignorer = () => {
    startTransition(async () => {
      const r = await ignorerContactAnnexeAction(dossierRef, contact.id);
      if (r.ok) {
        onDone(r.contacts);
        toast.ok("Contact ignore.");
      } else {
        toast.err(r.message);
      }
    });
  };

  return (
    <li className="rounded-md border border-line bg-surface p-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink truncate">{contact.nom}</p>
          <div className="mt-1 flex flex-col gap-0.5 text-[12px] text-ink-3">
            {contact.email && (
              <span className="inline-flex items-center gap-1.5">
                <Mail strokeWidth={1.5} className="w-3 h-3 text-ink-4" /> {contact.email}
              </span>
            )}
            {contact.telephone && (
              <span className="inline-flex items-center gap-1.5">
                <Phone strokeWidth={1.5} className="w-3 h-3 text-ink-4" /> {contact.telephone}
              </span>
            )}
            {rienAReporter && <span className="text-ink-4">Aucun email ni telephone a reporter.</span>}
          </div>
          <div className="mt-1.5">
            <Badge ton={STATUT_TON[contact.statut]} dot>
              {STATUT_LABEL[contact.statut]}
              {contact.confiance > 0 ? ` (${contact.confiance.toFixed(2)})` : ""}
            </Badge>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          {/* Corriger = choisir un autre owner (le selecteur EST la correction). */}
          <label className="flex items-center gap-1.5 text-[11px] text-ink-4">
            <UserPlus strokeWidth={1.5} className="w-3 h-3" />
            <select
              value={choix}
              onChange={(e) => setChoix(e.target.value)}
              className="h-8 max-w-[220px] rounded-md border border-line bg-surface px-2 text-[12px] text-ink"
            >
              <option value="">- choisir un coproprietaire -</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nom}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2">
            <Button type="button" variant="primary" onClick={valider} disabled={pending || rienAReporter}>
              <Check strokeWidth={1.75} /> {pending ? "..." : "Valider"}
            </Button>
            <Button type="button" variant="secondary" onClick={ignorer} disabled={pending}>
              <X strokeWidth={1.75} /> Ignorer
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}
