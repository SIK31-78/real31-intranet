// Cloture de l'ODJ en "reunion terminee" (demande Sekou 2026-07-28) : le CS preparatoire
// s'est tenu, le document est FIGE et le cycle passe a la supervision AG.
//
// PERIMETRE VOLONTAIREMENT ETROIT (brique 1). La cloture NE diffuse RIEN :
//   - elle ne genere pas de PDF (aucun generateur cote serveur aujourd'hui : le "PDF" de
//     l'ODJ est le rendu navigateur de /odj/<id>/imprimer) ;
//   - elle ne depose rien dans eStale (createFile est prouve mais pas construit : ni port
//     ni adapter, cf. docs/CHANTIER-signature-electronique-AG.md) ;
//   - elle NE COCHE PAS l'item de supervision "apcs.cr-cs-extranet" (Compte rendu CS
//     diffuse sur l'extranet). Le cocher serait MENTIR : rien n'a ete diffuse. C'est au
//     gestionnaire de le cocher quand il a reellement depose le document.
// Quand le depot automatique existera, c'est ICI que le cochage viendra se brancher, sur
// le modele de auto-cochage.ts -- et il sera alors VRAI.
//
// Elle fait EN REVANCHE avancer le cycle AG en marquant le jalon ODJ_CS (cf. plus bas) :
// ce n'est pas une diffusion, c'est l'enregistrement d'un fait interne deja acquis.
//
// Reversible : rouvrir un ODJ clos par erreur ne coute rien, puisque aucune ecriture
// externe n'a ete engagee.
//
// Passe par le routeur (ADR-001).

import { getCoproRepository, getJalonRepository, getOdjRepository } from "@/lib/adapters/router";
import { CLE_CLOTURE_ODJ, CLE_CS_GLISSE, ODJ_SANS_DATE } from "@/lib/ports/odj-repository";
import { formatCloture } from "@/lib/domain/odj";
import {
  doitGlisserCs,
  formatGlissementCs,
  parseGlissementCs,
} from "@/lib/domain/odj-glissement-cs";
import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";

/**
 * Clot ou rouvre l'ODJ d'une copro pour une date d'AG donnee.
 * `maintenantISO` est injecte (pas de `new Date()` cache dans le service) : le service
 * reste testable et l'horodatage vient d'un seul endroit.
 */
export async function cloturerOdj(params: {
  coproCode: string;
  agDateISO: string;
  clore: boolean;
  initiales: string;
  managerId: string;
  maintenantISO: string;
}): Promise<void> {
  const { coproCode, agDateISO, clore, initiales, managerId, maintenantISO } = params;
  await exigerPerimetre(coproCode, managerId);
  await getOdjRepository().setChamp(
    coproCode,
    agDateISO,
    CLE_CLOTURE_ODJ,
    clore ? formatCloture(maintenantISO, initiales) : null,
    initiales,
  );

  // La reunion du CS s'est tenue : sa date n'est plus "a venir". On la fait GLISSER de
  // "prochain CS" vers "dernier CS" (demande Sekou 2026-09-10 : la fiche du 4 Bleuets
  // annoncait un CS au 3 septembre alors qu'on etait le 10). Reversible comme le reste :
  // rouvrir l'ODJ remet les deux dates telles qu'elles etaient.
  // BEST-EFFORT, comme le jalon : le referentiel Copropriete est partage avec l'App A, un
  // refus de scope ne doit pas defaire la cloture (l'acte primaire).
  await glisserDateCs({ coproCode, agDateISO, clore, initiales, managerId, maintenantISO }).catch((e) =>
    console.warn(`[cloturer-odj] date de CS non glissee (${coproCode}) :`, (e as Error).message),
  );

  // "Reunion terminee" = le CS de validation de l'ODJ s'est tenu : c'est EXACTEMENT le
  // jalon ODJ_CS ("ODJ valide avec le Conseil Syndical"). Sans ce marquage, l'etape ODJ du
  // cycle (etapeFaite -> accompli.has("ODJ_CS")) ne passait JAMAIS : la frise restait bloquee
  // sur "ODJ" / "a confirmer" et la phase convocation ne se debloquait pas (bug remonte deux
  // fois par les collegues). Meme mecanique que conclureAg, qui marque TENUE.
  // Reouvrir l'ODJ remet le jalon "a faire" : la cloture reste reversible de bout en bout.
  // Sans date d'AG (ODJ prepare en avance, cle sentinelle), il n'y a pas de jalon a marquer.
  // BEST-EFFORT : un echec ici ne doit pas defaire la cloture (l'acte primaire).
  if (agDateISO !== ODJ_SANS_DATE) {
    await getJalonRepository()
      .marquer({
        coproCode,
        agDate: agDateISO,
        type: "ODJ_CS",
        statut: clore ? "accompli" : "a_faire",
        par: initiales,
      })
      .catch((e) =>
        console.warn(`[cloturer-odj] jalon ODJ_CS non marque (${coproCode}) :`, (e as Error).message),
      );
  }
}

/**
 * Deplace la date de CS au rythme de la cloture. Le marqueur est ecrit AVANT les dates :
 * si une ecriture de date echoue ensuite, la reouverture restaure des valeurs qui sont
 * deja en place (no-op) au lieu de laisser un glissement irreversible.
 */
async function glisserDateCs(params: {
  coproCode: string;
  agDateISO: string;
  clore: boolean;
  initiales: string;
  managerId: string;
  maintenantISO: string;
}): Promise<void> {
  const { coproCode, agDateISO, clore, initiales, managerId, maintenantISO } = params;
  const copros = getCoproRepository();
  const odj = getOdjRepository();

  if (clore) {
    const copro = await copros.findByCode(coproCode, managerId);
    if (!doitGlisserCs(copro?.prochaineCsDate, maintenantISO)) return;
    const glissee = (copro?.prochaineCsDate ?? "").slice(0, 10);
    await odj.setChamp(
      coproCode,
      agDateISO,
      CLE_CS_GLISSE,
      formatGlissementCs(glissee, copro?.derniereCsDate),
      initiales,
    );
    await copros.setDateEvenement(coproCode, "cs", "derniere", glissee, managerId);
    // On efface la prochaine date SANS passer par definirDateEvenement : celui-ci
    // deprojetterait l'evenement Outlook, or cette reunion a EU LIEU - elle doit rester
    // dans les agendas.
    await copros.setDateEvenement(coproCode, "cs", "prochaine", null, managerId);
    return;
  }

  // Reouverture : on annule le glissement, et RIEN d'autre. Sans marqueur (ODJ clos
  // avant cette regle, ou cloture qui n'avait rien fait glisser), on ne touche a rien.
  const etat = await odj.getEtat(coproCode, agDateISO);
  const glissement = parseGlissementCs(etat.find((e) => e.champId === CLE_CS_GLISSE)?.valeur);
  if (!glissement) return;
  await copros.setDateEvenement(coproCode, "cs", "prochaine", glissement.glissee, managerId);
  await copros.setDateEvenement(
    coproCode,
    "cs",
    "derniere",
    glissement.ancienneDerniere || null,
    managerId,
  );
  await odj.setChamp(coproCode, agDateISO, CLE_CS_GLISSE, null, initiales);
}
