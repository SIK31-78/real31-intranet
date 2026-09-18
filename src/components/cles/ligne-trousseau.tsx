import { Row } from "@/components/ui/list-rows";
import { PastilleEtat, detailEtat } from "./pastille-etat";
import type { TrousseauResume } from "@/lib/services/cles/lecture";
import { formatDateLongue } from "@/lib/format-date";

// Une ligne de trousseau, la meme partout : numero · biens · etat.
export function LigneTrousseau({ resume, secondaire }: { resume: TrousseauResume; secondaire?: React.ReactNode }) {
  const t = resume.trousseau;
  const biens = resume.biens.map((b) => `${b.coproCode ? `${b.coproCode} · ` : ""}${b.libelle}`).join(" · ");
  const prochaine = resume.reservations[0];
  return (
    <Row
      href={`/cles/trousseaux/${t.id}`}
      ton={resume.etat === "en_retard" ? "err" : resume.etat === "sorti" ? "warn" : undefined}
      avant={t.numero}
      principal={t.libelle || biens || t.numero}
      secondaire={
        secondaire ?? (
          <>
            {t.libelle ? biens : ""}
            {t.emplacement && <span className="text-ink-3"> · {t.emplacement}</span>}
            {prochaine && resume.etat !== "sorti" && resume.etat !== "en_retard" && (
              <span className="text-ink-2"> · réservé le {formatDateLongue(prochaine.debutISO)}{prochaine.entrepriseNom ? ` par ${prochaine.entrepriseNom}` : ""}</span>
            )}
          </>
        )
      }
      droite={
        <PastilleEtat
          etat={resume.etat}
          detail={detailEtat({ etat: resume.etat, entrepriseNom: resume.pret?.entrepriseNom, joursDehors: resume.joursDehors, joursRetard: resume.joursRetard, type: resume.pret?.type, contactNom: resume.pret?.contact?.nom })}
        />
      }
    />
  );
}
