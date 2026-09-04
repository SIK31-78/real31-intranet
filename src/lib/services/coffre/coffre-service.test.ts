// Reinitialisation du coffre (mot de passe maitre oublie), via le service et
// les adapters mock du routeur. On y verifie surtout ce qui doit DISPARAITRE :
// une reinitialisation qui laisserait trainer des appartenances ou des coffres
// enrobes vers l'ancienne identite ferait planter l'ouverture - et laisser
// croire qu'on peut recuperer quelque chose serait pire encore.
import { describe, expect, it } from "vitest";
import {
  enrolerCollaborateur,
  getApercuCoffre,
  getSecretsCoffre,
  ajouterSecretCoffre,
  creerCoffrePartage,
  octroyerAcces,
  listerAnnuaire,
  reinitialiserIdentiteCoffre,
  changerMotDePasseMaitre,
} from "./coffre-service";
import type { BlobChiffreStocke, CleEnrobeeMembre } from "@/lib/domain/coffre";

// Le serveur ne voit que des blobs opaques : des chaines suffisent ici.
const blob = (s: string): BlobChiffreStocke => ({ iv: `iv-${s}`, ciphertext: `ct-${s}` });
const cle = (s: string): CleEnrobeeMembre => ({ ephemeralPublicKey: `eph-${s}`, iv: `iv-${s}`, ciphertext: `ct-${s}` });

describe("reinitialiserIdentiteCoffre", () => {
  it("repart d'une identite neuve : perso detruit, partage coupe, methodes purgees", async () => {
    // Dan s'enrole, met un secret dans son coffre perso.
    const dan = await enrolerCollaborateur({
      azureOid: "oid-dan",
      email: "dan@real31.fr",
      publicKey: "PUB-DAN-1",
      wrappedPrivateKey: blob("dan-1"),
      params: { salt: "sel-1", iterations: 600000 },
      coffrePerso: { nom: "Mes mots de passe", wrappedVaultKey: cle("dan-perso") },
    });
    await ajouterSecretCoffre(dan.coffreId, blob("secret-dan"), 1, dan.userId);
    expect(await getSecretsCoffre(dan.coffreId)).toHaveLength(1);

    // Eve cree un coffre reseau et y donne acces a Dan.
    const eve = await enrolerCollaborateur({
      azureOid: "oid-eve",
      email: "eve@real31.fr",
      publicKey: "PUB-EVE-1",
      wrappedPrivateKey: blob("eve-1"),
      params: { salt: "sel-eve", iterations: 600000 },
      coffrePerso: { nom: "Mes mots de passe", wrappedVaultKey: cle("eve-perso") },
    });
    const reseauId = await creerCoffrePartage("network", "Reseau", {
      userId: eve.userId,
      wrappedVaultKey: cle("eve-reseau"),
    });
    await octroyerAcces(reseauId, dan.userId, cle("dan-reseau"), eve.userId);
    expect((await getApercuCoffre("oid-dan")).coffres).toHaveLength(2);

    // Dan a oublie son mot de passe maitre : identite neuve.
    const { coffreId: nouveauPerso } = await reinitialiserIdentiteCoffre({
      userId: dan.userId,
      publicKey: "PUB-DAN-2",
      wrappedPrivateKey: blob("dan-2"),
      params: { salt: "sel-2", iterations: 600000 },
      coffrePerso: { nom: "Mes mots de passe", wrappedVaultKey: cle("dan-perso-2") },
    });

    const apres = await getApercuCoffre("oid-dan");

    // Un seul coffre : le nouveau perso, vide. L'ancien et ses secrets ont saute
    // (ils n'etaient plus dechiffrables par personne).
    expect(apres.coffres.map((c) => c.id)).toEqual([nouveauPerso]);
    expect(nouveauPerso).not.toBe(dan.coffreId);
    expect(await getSecretsCoffre(nouveauPerso)).toHaveLength(0);
    expect(await getSecretsCoffre(dan.coffreId)).toHaveLength(0);

    // Une seule methode de deverrouillage, portant le NOUVEAU blob : les
    // anciennes (mot de passe, passkey) enrobaient l'ancienne cle privee.
    expect(apres.deverrouillages).toHaveLength(1);
    expect(apres.deverrouillages[0].method).toBe("master_password");
    expect(apres.deverrouillages[0].wrappedPrivateKey).toEqual(blob("dan-2"));

    // Nouvelle cle publique dans l'annuaire (sinon on lui enroberait des cles
    // de coffre qu'il ne pourrait pas ouvrir).
    const annuaire = await listerAnnuaire();
    expect(annuaire.find((a) => a.id === dan.userId)?.publicKey).toBe("PUB-DAN-2");

    // Le coffre partage survit chez Eve : seul l'acces de Dan est coupe.
    const chezEve = await getApercuCoffre("oid-eve");
    expect(chezEve.coffres.map((c) => c.id)).toContain(reseauId);
  });
});

describe("changerMotDePasseMaitre", () => {
  it("remplace la methode mot de passe sans en laisser deux (l'ancienne serrure doit mourir)", async () => {
    const flo = await enrolerCollaborateur({
      azureOid: "oid-flo",
      email: "flo@real31.fr",
      publicKey: "PUB-FLO",
      wrappedPrivateKey: blob("flo-1"),
      params: { salt: "sel-1", iterations: 600000 },
      coffrePerso: { nom: "Mes mots de passe", wrappedVaultKey: cle("flo-perso") },
    });
    await ajouterSecretCoffre(flo.coffreId, blob("secret-flo"), 1, flo.userId);

    await changerMotDePasseMaitre(flo.userId, blob("flo-2"), { salt: "sel-2", iterations: 600000 });

    const apres = await getApercuCoffre("oid-flo");
    const parMdp = apres.deverrouillages.filter((d) => d.method === "master_password");
    expect(parMdp).toHaveLength(1);
    expect(parMdp[0].wrappedPrivateKey).toEqual(blob("flo-2"));
    // Rien n'a bouge cote donnees : meme coffre, meme secret.
    expect(apres.coffres.map((c) => c.id)).toEqual([flo.coffreId]);
    expect(await getSecretsCoffre(flo.coffreId)).toHaveLength(1);
  });
});
