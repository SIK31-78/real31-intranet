"use client";

// Les gestes du comptoir sur un trousseau : Sortir / Enregistrer le retour / Réserver
// (un seul primaire, celui du cycle), et le menu « ⋯ » (prolonger, annuler une
// réservation, introuvable / retrouvé, retirer). Les modales tiennent en trois champs.

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, LogIn, LogOut, MoreHorizontal, Printer } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { Field, Input, Select, Textarea, Choix } from "@/components/ui/field";
import { Callout } from "@/components/ui/callout";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { LIBELLE_CONFORMITE, LIBELLE_TYPE_ELEMENT, type ConformiteRetour, type EtatTrousseau, type Pret, type Reservation, type Trousseau } from "@/lib/domain/cles/types";
import { plusJours } from "@/lib/domain/cles/etat";
import { formatDateLongue } from "@/lib/format-date";
import { ChoixEntreprise } from "./choix-entreprise";
import {
  annulerReservationAction,
  chargerEntreprisesAction,
  enregistrerRetourAction,
  marquerAction,
  prolongerAction,
  reserverAction,
  sortirAction,
  type EntrepriseChoix,
} from "@/app/cles/actions";

type Geste = "sortir" | "retour" | "reserver" | "prolonger" | "annuler" | "introuvable" | "retrouve" | "retire" | null;

export function ActionsTrousseau({
  trousseau,
  etat,
  pret,
  reservations,
  aujourdhuiISO,
  peutOperer,
  direction,
  compact = false,
}: {
  trousseau: Trousseau;
  etat: EtatTrousseau;
  pret: Pret | null;
  /** Reservations prevues a venir (ou du jour). */
  reservations: Reservation[];
  aujourdhuiISO: string;
  peutOperer: boolean;
  direction: boolean;
  compact?: boolean;
}) {
  const [geste, setGeste] = useState<Geste>(null);
  const [menu, setMenu] = useState(false);
  const [entreprises, setEntreprises] = useState<EntrepriseChoix[] | null>(null);

  useEffect(() => {
    if ((geste === "sortir" || geste === "reserver") && entreprises === null) {
      chargerEntreprisesAction().then(setEntreprises);
    }
  }, [geste, entreprises]);

  if (!peutOperer) return null;
  const sortable = etat === "en_agence" || etat === "reserve";
  const dehors = etat === "sorti" || etat === "en_retard";
  const retire = etat === "retire";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {sortable && (
        <Button variant="primary" size={compact ? "sm" : "md"} onClick={() => setGeste("sortir")}>
          <LogOut strokeWidth={1.5} /> Sortir
        </Button>
      )}
      {dehors && (
        <Button variant="primary" size={compact ? "sm" : "md"} onClick={() => setGeste("retour")}>
          <LogIn strokeWidth={1.5} /> Enregistrer le retour
        </Button>
      )}
      {!retire && (
        <Button variant="secondary" size={compact ? "sm" : "md"} onClick={() => setGeste("reserver")}>
          <CalendarClock strokeWidth={1.5} /> Réserver
        </Button>
      )}
      {dehors && pret && !compact && (
        <ButtonLink href={`/cles/prets/${pret.id}/attestation`} variant="secondary" size="md">
          <Printer strokeWidth={1.5} /> Attestation
        </ButtonLink>
      )}
      <div className="relative">
        <Button variant="ghost" size={compact ? "sm" : "md"} iconOnly aria-label="Autres gestes" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
          <MoreHorizontal strokeWidth={1.5} />
        </Button>
        {menu && (
          <ul role="menu" className="absolute right-0 z-20 mt-1 min-w-56 rounded-lg border border-line bg-surface shadow-2 py-1 text-body" onMouseLeave={() => setMenu(false)}>
            {dehors && <Item onClick={() => { setMenu(false); setGeste("prolonger"); }}>Reporter la date de retour</Item>}
            {reservations.length > 0 && <Item onClick={() => { setMenu(false); setGeste("annuler"); }}>Annuler une réservation</Item>}
            {etat !== "introuvable" && !retire && <Item onClick={() => { setMenu(false); setGeste("introuvable"); }}>Déclarer introuvable</Item>}
            {etat === "introuvable" && <Item onClick={() => { setMenu(false); setGeste("retrouve"); }}>Déclarer retrouvé</Item>}
            {direction && !retire && !dehors && <Item onClick={() => { setMenu(false); setGeste("retire"); }} danger>Retirer le trousseau</Item>}
            <li className="px-3 py-1.5 text-meta text-ink-3">Modifier la fiche : bouton « Modifier » en haut de page.</li>
          </ul>
        )}
      </div>

      {geste === "sortir" && (
        <ModaleSortie trousseau={trousseau} reservations={reservations} entreprises={entreprises} setEntreprises={setEntreprises} aujourdhuiISO={aujourdhuiISO} onFermer={() => setGeste(null)} />
      )}
      {geste === "retour" && pret && <ModaleRetour trousseau={trousseau} pret={pret} onFermer={() => setGeste(null)} />}
      {geste === "reserver" && (
        <ModaleReservation trousseau={trousseau} entreprises={entreprises} setEntreprises={setEntreprises} aujourdhuiISO={aujourdhuiISO} onFermer={() => setGeste(null)} />
      )}
      {geste === "prolonger" && pret && <ModaleProlongation trousseau={trousseau} pret={pret} aujourdhuiISO={aujourdhuiISO} onFermer={() => setGeste(null)} />}
      {geste === "annuler" && <ModaleAnnulation trousseau={trousseau} reservations={reservations} onFermer={() => setGeste(null)} />}
      {(geste === "introuvable" || geste === "retrouve" || geste === "retire") && <ModaleMarquage trousseau={trousseau} marquage={geste} onFermer={() => setGeste(null)} />}
    </div>
  );
}

function Item({ children, onClick, danger = false }: { children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <li role="none">
      <button type="button" role="menuitem" onClick={onClick} className={`flex w-full items-center px-3 min-h-8 text-left hover:bg-surface-2 ${danger ? "text-err-700" : "text-ink"}`}>
        {children}
      </button>
    </li>
  );
}

function Composition({ trousseau }: { trousseau: Pick<Trousseau, "composition"> }) {
  if (trousseau.composition.length === 0) return null;
  return (
    <p className="text-body text-ink-2">
      Composition : {trousseau.composition.map((e) => `${e.quantite} ${LIBELLE_TYPE_ELEMENT[e.type]}${e.quantite > 1 ? "s" : ""}${e.libelle ? ` (${e.libelle})` : ""}`).join(", ")}
    </p>
  );
}

function ModaleSortie({ trousseau, reservations, entreprises, setEntreprises, aujourdhuiISO, onFermer }: {
  trousseau: Trousseau; reservations: Reservation[]; entreprises: EntrepriseChoix[] | null; setEntreprises: (e: EntrepriseChoix[]) => void; aujourdhuiISO: string; onFermer: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const resaDuJour = reservations.find((r) => r.debutISO <= plusJours(aujourdhuiISO, 1));
  const [type, setType] = useState<"entreprise" | "interne">("entreprise");
  // `undefined` = pas encore touche : la reservation du jour pre-remplit l'entreprise des
  // que la liste est la (derivation, pas d'effet). `null` = choix efface par l'utilisateur.
  const [choix, setChoix] = useState<EntrepriseChoix | null | undefined>(undefined);
  const preRempli = resaDuJour?.entrepriseId && entreprises ? entreprises.find((x) => x.id === resaDuJour.entrepriseId) ?? null : null;
  const entreprise = choix === undefined ? preRempli : choix;
  const setEntreprise = (e: EntrepriseChoix | null) => setChoix(e);
  const [contact, setContact] = useState(resaDuJour?.contact?.nom ?? "");
  const [retour, setRetour] = useState(resaDuJour?.finPrevueISO && resaDuJour.finPrevueISO >= aujourdhuiISO ? resaDuJour.finPrevueISO : aujourdhuiISO);
  const [motif, setMotif] = useState(resaDuJour?.motif ?? "");
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const pret = type === "interne" ? contact.trim().length > 0 : entreprise !== null;

  function valider(confirme = false) {
    demarrer(async () => {
      const res = await sortirAction({
        trousseauId: trousseau.id,
        type,
        entrepriseId: type === "entreprise" ? entreprise?.id : undefined,
        contact: contact.trim() ? { nom: contact.trim() } : undefined,
        retourPrevuLeISO: retour,
        motif: motif || undefined,
        reservationId: resaDuJour && resaDuJour.entrepriseId === entreprise?.id ? resaDuJour.id : undefined,
        confirme,
      });
      if (!res.ok) return toast.err(res.erreur);
      if (res.donnees?.confirmationRequise) return setConfirmation(res.donnees.confirmationRequise);
      toast.ok(`${trousseau.numero} sorti${entreprise ? ` — ${entreprise.nom}` : ""}, retour prévu le ${formatDateLongue(retour)}.`);
      onFermer();
      router.refresh();
    });
  }

  return (
    <Modal titre={`Sortir ${trousseau.numero}`} onFermer={onFermer} size="sm">
      <ModalBody>
        <div className="flex flex-col gap-3">
          <Composition trousseau={trousseau} />
          {resaDuJour && <Callout ton="info">Réservé{resaDuJour.entrepriseNom ? ` par ${resaDuJour.entrepriseNom}` : ""} du {formatDateLongue(resaDuJour.debutISO)} au {formatDateLongue(resaDuJour.finPrevueISO)}{resaDuJour.motif ? ` — ${resaDuJour.motif}` : ""}.</Callout>}
          <div className="flex gap-4">
            <Choix type="radio" name="type" checked={type === "entreprise"} onChange={() => setType("entreprise")} label="À une entreprise" />
            <Choix type="radio" name="type" checked={type === "interne"} onChange={() => { setType("interne"); setEntreprise(null); }} label="Usage interne" />
          </div>
          {type === "entreprise" ? (
            <Field label="Entreprise" htmlFor="sortie-entreprise" requis>
              {entreprises === null ? <p className="text-body text-ink-3">Chargement des entreprises…</p> : (
                <ChoixEntreprise id="sortie-entreprise" entreprises={entreprises} valeur={entreprise} onChoisir={(e) => { setEntreprise(e); setContact(e?.contacts.find((c) => c.principal)?.nom ?? e?.contacts[0]?.nom ?? ""); }} onCreee={(e) => setEntreprises([...entreprises, e])} />
              )}
            </Field>
          ) : null}
          <Field label={type === "interne" ? "Qui l'emporte" : "Personne qui vient (facultatif)"} htmlFor="sortie-contact" requis={type === "interne"}>
            <Input id="sortie-contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder={type === "interne" ? "Gestionnaire, assistante…" : "Nom du technicien"} autoComplete="off" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Retour prévu le" htmlFor="sortie-retour" requis>
              <Input id="sortie-retour" type="date" min={aujourdhuiISO} value={retour} onChange={(e) => setRetour(e.target.value)} />
            </Field>
            <Field label="Intervention (facultatif)" htmlFor="sortie-motif">
              <Input id="sortie-motif" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Fuite, ascenseur, fibre…" />
            </Field>
          </div>
          {confirmation && (
            <Callout ton="warn" titre="Confirmer ?" actions={<Button variant="secondary" size="sm" loading={pending} onClick={() => valider(true)}>Sortir quand même</Button>}>
              {confirmation}
            </Callout>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onFermer}>Annuler</Button>
        {!confirmation && (
          <Button variant="primary" loading={pending} disabled={!pret} onClick={() => valider(false)}>
            <LogOut strokeWidth={1.5} /> Sortir le trousseau
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
}

function ModaleRetour({ trousseau, pret, onFermer }: { trousseau: Trousseau; pret: Pret; onFermer: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [conformite, setConformite] = useState<ConformiteRetour>("complet");
  const [commentaire, setCommentaire] = useState("");
  const ok = conformite === "complet" || commentaire.trim().length > 0;

  function valider() {
    demarrer(async () => {
      const res = await enregistrerRetourAction({ trousseauId: trousseau.id, conformite, commentaire: commentaire || undefined });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(`${trousseau.numero} de retour en agence.`);
      onFermer();
      router.refresh();
    });
  }

  return (
    <Modal titre={`Retour de ${trousseau.numero}`} onFermer={onFermer} size="sm">
      <ModalBody>
        <div className="flex flex-col gap-3">
          <p className="text-body text-ink-2">
            Sorti {pret.type === "interne" ? "en interne" : pret.entrepriseNom ? `chez ${pret.entrepriseNom}` : ""}{pret.contact?.nom ? ` (${pret.contact.nom})` : ""} le {formatDateLongue(pret.sortiLeISO.slice(0, 10))}, retour prévu le {formatDateLongue(pret.retourPrevuLeISO)}.
          </p>
          <Composition trousseau={{ composition: pret.composition }} />
          <Field label="État du trousseau" htmlFor="retour-conformite">
            <Select id="retour-conformite" value={conformite} onChange={(e) => setConformite(e.target.value as ConformiteRetour)}>
              {(Object.keys(LIBELLE_CONFORMITE) as ConformiteRetour[]).map((c) => <option key={c} value={c}>{LIBELLE_CONFORMITE[c]}</option>)}
            </Select>
          </Field>
          <Field label={conformite === "complet" ? "Commentaire (facultatif)" : "Ce qui manque ou est abîmé"} htmlFor="retour-commentaire" requis={conformite !== "complet"}>
            <Textarea id="retour-commentaire" rows={2} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
          </Field>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onFermer}>Annuler</Button>
        <Button variant="primary" loading={pending} disabled={!ok} onClick={valider}><LogIn strokeWidth={1.5} /> Enregistrer le retour</Button>
      </ModalFooter>
    </Modal>
  );
}

function ModaleReservation({ trousseau, entreprises, setEntreprises, aujourdhuiISO, onFermer }: {
  trousseau: Trousseau; entreprises: EntrepriseChoix[] | null; setEntreprises: (e: EntrepriseChoix[]) => void; aujourdhuiISO: string; onFermer: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [entreprise, setEntreprise] = useState<EntrepriseChoix | null>(null);
  const [contact, setContact] = useState("");
  const [debut, setDebut] = useState(plusJours(aujourdhuiISO, 1));
  const [fin, setFin] = useState(plusJours(aujourdhuiISO, 1));
  const [motif, setMotif] = useState("");

  function valider() {
    demarrer(async () => {
      const res = await reserverAction({ trousseauId: trousseau.id, entrepriseId: entreprise!.id, contact: contact.trim() ? { nom: contact.trim() } : undefined, debutISO: debut, finPrevueISO: fin, motif: motif || undefined });
      if (!res.ok) return toast.err(res.erreur);
      if (res.donnees?.avertissement) toast.warn(res.donnees.avertissement);
      toast.ok(`${trousseau.numero} réservé pour ${entreprise!.nom} le ${formatDateLongue(debut)}.`);
      onFermer();
      router.refresh();
    });
  }

  return (
    <Modal titre={`Réserver ${trousseau.numero}`} onFermer={onFermer} size="sm">
      <ModalBody>
        <div className="flex flex-col gap-3">
          <Field label="Entreprise" htmlFor="resa-entreprise" requis>
            {entreprises === null ? <p className="text-body text-ink-3">Chargement des entreprises…</p> : (
              <ChoixEntreprise id="resa-entreprise" entreprises={entreprises} valeur={entreprise} onChoisir={(e) => { setEntreprise(e); setContact(e?.contacts.find((c) => c.principal)?.nom ?? ""); }} onCreee={(e) => setEntreprises([...entreprises, e])} />
            )}
          </Field>
          <Field label="Personne qui viendra (facultatif)" htmlFor="resa-contact">
            <Input id="resa-contact" value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="off" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Retrait le" htmlFor="resa-debut" requis>
              <Input id="resa-debut" type="date" min={aujourdhuiISO} value={debut} onChange={(e) => { setDebut(e.target.value); if (fin < e.target.value) setFin(e.target.value); }} />
            </Field>
            <Field label="Retour prévu le" htmlFor="resa-fin" requis>
              <Input id="resa-fin" type="date" min={debut} value={fin} onChange={(e) => setFin(e.target.value)} />
            </Field>
          </div>
          <Field label="Intervention (facultatif)" htmlFor="resa-motif">
            <Input id="resa-motif" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Fuite, ascenseur, fibre…" />
          </Field>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onFermer}>Annuler</Button>
        <Button variant="primary" loading={pending} disabled={!entreprise || !debut || !fin} onClick={valider}><CalendarClock strokeWidth={1.5} /> Réserver</Button>
      </ModalFooter>
    </Modal>
  );
}

function ModaleProlongation({ trousseau, pret, aujourdhuiISO, onFermer }: { trousseau: Trousseau; pret: Pret; aujourdhuiISO: string; onFermer: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [date, setDate] = useState(pret.retourPrevuLeISO >= aujourdhuiISO ? plusJours(pret.retourPrevuLeISO, 7) : plusJours(aujourdhuiISO, 7));
  const [motif, setMotif] = useState("");
  function valider() {
    demarrer(async () => {
      const res = await prolongerAction({ trousseauId: trousseau.id, retourPrevuLeISO: date, motif: motif || undefined });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(`Retour de ${trousseau.numero} reporté au ${formatDateLongue(date)}.`);
      onFermer();
      router.refresh();
    });
  }
  return (
    <Modal titre={`Reporter le retour de ${trousseau.numero}`} onFermer={onFermer} size="sm">
      <ModalBody>
        <div className="flex flex-col gap-3">
          <p className="text-body text-ink-2">Retour prévu aujourd&apos;hui le {formatDateLongue(pret.retourPrevuLeISO)}{pret.entrepriseNom ? `, chez ${pret.entrepriseNom}` : ""}.</p>
          <Field label="Nouvelle date de retour" htmlFor="prol-date" requis>
            <Input id="prol-date" type="date" min={aujourdhuiISO} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Motif (facultatif)" htmlFor="prol-motif">
            <Input id="prol-motif" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Chantier prolongé…" />
          </Field>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onFermer}>Annuler</Button>
        <Button variant="primary" loading={pending} disabled={!date} onClick={valider}>Reporter</Button>
      </ModalFooter>
    </Modal>
  );
}

function ModaleAnnulation({ trousseau, reservations, onFermer }: { trousseau: Trousseau; reservations: Reservation[]; onFermer: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [id, setId] = useState(reservations[0]?.id ?? "");
  const [motif, setMotif] = useState("");
  function valider() {
    demarrer(async () => {
      const res = await annulerReservationAction({ reservationId: id, trousseauId: trousseau.id, motif });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok("Réservation annulée.");
      onFermer();
      router.refresh();
    });
  }
  return (
    <Modal titre={`Annuler une réservation de ${trousseau.numero}`} onFermer={onFermer} size="sm">
      <ModalBody>
        <div className="flex flex-col gap-3">
          <Field label="Réservation" htmlFor="ann-resa">
            <Select id="ann-resa" value={id} onChange={(e) => setId(e.target.value)}>
              {reservations.map((r) => <option key={r.id} value={r.id}>{formatDateLongue(r.debutISO)}{r.entrepriseNom ? ` · ${r.entrepriseNom}` : ""}{r.motif ? ` · ${r.motif}` : ""}</option>)}
            </Select>
          </Field>
          <Field label="Motif" htmlFor="ann-motif" requis>
            <Input id="ann-motif" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Intervention reportée, annulée par l'entreprise…" />
          </Field>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onFermer}>Fermer</Button>
        <Button variant="danger" loading={pending} disabled={!id || !motif.trim()} onClick={valider}>Annuler la réservation</Button>
      </ModalFooter>
    </Modal>
  );
}

function ModaleMarquage({ trousseau, marquage, onFermer }: { trousseau: Trousseau; marquage: "introuvable" | "retrouve" | "retire"; onFermer: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const confirmer = useConfirm();
  const [pending, demarrer] = useTransition();
  const [motif, setMotif] = useState("");
  const titres = { introuvable: `Déclarer ${trousseau.numero} introuvable`, retrouve: `${trousseau.numero} retrouvé`, retire: `Retirer ${trousseau.numero}` };
  const textes = {
    introuvable: "Le trousseau sort des compteurs « en agence ». S'il est sorti, le prêt reste ouvert et l'entreprise en reste responsable.",
    retrouve: "Le trousseau redevient disponible.",
    retire: "Le trousseau est archivé : plus de sortie possible, l'historique est conservé. Réservé à la direction.",
  };
  function valider() {
    demarrer(async () => {
      if (marquage === "retire" && !(await confirmer({ titre: `Retirer ${trousseau.numero} ?`, message: "Cette action se voit au journal et n'est réversible que par la direction.", danger: true }))) return;
      const res = await marquerAction({ trousseauId: trousseau.id, marquage, motif: motif || undefined });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(marquage === "retrouve" ? `${trousseau.numero} retrouvé.` : marquage === "retire" ? `${trousseau.numero} retiré.` : `${trousseau.numero} déclaré introuvable.`);
      onFermer();
      router.refresh();
    });
  }
  return (
    <Modal titre={titres[marquage]} onFermer={onFermer} size="sm">
      <ModalBody>
        <div className="flex flex-col gap-3">
          <p className="text-body text-ink-2">{textes[marquage]}</p>
          <Field label="Commentaire (facultatif)" htmlFor="marq-motif">
            <Input id="marq-motif" value={motif} onChange={(e) => setMotif(e.target.value)} />
          </Field>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onFermer}>Annuler</Button>
        <Button variant={marquage === "retire" ? "destructive" : "primary"} loading={pending} onClick={valider}>Confirmer</Button>
      </ModalFooter>
    </Modal>
  );
}
