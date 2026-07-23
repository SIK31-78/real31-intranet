// Pre-remplissage JETABLE de la page /nouveautes : insere les entrees « changelog » des
// grosses livraisons recentes, formulees POUR LES COLLABORATEURS (aucun jargon technique).
//
// IDEMPOTENT : chaque entree est testee par TITRE avant insert ; relancer le script ne
// duplique rien. Ecrit dans public.intranet_feedback via service_role (comme l'app), en
// statut 'livre' / type 'idee' / severite null / page null / auteur_initiales 'REAL31',
// avec un livre_at echelonne sur les derniers jours (ordre logique des livraisons).
//
// N'ecrit AUCUN secret. Lancer :  node --env-file=.env.local scripts/seed-nouveautes.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans l'env (--env-file=.env.local).");
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: "public" },
});

const TABLE = "intranet_feedback";

// Ordre logique des livraisons : la plus ancienne en premier, le bouton feedback en dernier
// (livraison la plus recente). livre_at echelonne sur les derniers jours -> le changelog
// (antechronologique) les presente dans le bon ordre.
const ENTREES = [
  {
    titre: "Nouvel accueil",
    description:
      "Votre page d'accueil réunit au même endroit vos assemblées à préparer, vos dossiers en cours et les points signalés.",
    livre_at: "2026-07-19T09:00:00Z",
  },
  {
    titre: "Espace comptable dédié",
    description:
      "Le pôle comptable a désormais son espace de vérification des comptes par copropriété, avec un fil d'échange direct avec le gestionnaire.",
    livre_at: "2026-07-20T09:00:00Z",
  },
  {
    titre: "Facturation de la gestion courante",
    description:
      "Facturation trimestrielle des honoraires de gestion, avec récapitulatif de contrôle avant tout envoi.",
    livre_at: "2026-07-21T09:00:00Z",
  },
  {
    titre: "Parcours d'assemblée clarifié",
    description:
      "La supervision d'AG affiche l'action du moment ; fini les boutons éparpillés, on sait toujours quoi faire et quand.",
    livre_at: "2026-07-22T09:00:00Z",
  },
  {
    titre: "Signalez un bug ou une idée",
    description:
      "Un bouton présent sur toutes les pages pour nous remonter ce qui bloque ou ce qui manque. Suivez ici ce qui arrive et ce qui vient d'être livré.",
    livre_at: "2026-07-23T09:00:00Z",
  },
];

async function existeParTitre(titre) {
  const { data, error } = await sb.from(TABLE).select("id").eq("titre", titre).limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

async function main() {
  let inserees = 0;
  let dejaLa = 0;

  for (const e of ENTREES) {
    let deja;
    try {
      deja = await existeParTitre(e.titre);
    } catch (err) {
      if (err.code === "42P01" || err.code === "PGRST205" || /could not find the table|schema cache/i.test(err.message ?? "")) {
        console.error("\nLa table intranet_feedback n'existe pas encore : passe d'abord supabase/sql/intranet_feedback.sql.");
        process.exit(1);
      }
      throw err;
    }

    if (deja) {
      dejaLa += 1;
      console.log(`  = déjà présent : ${e.titre}`);
      continue;
    }

    const { error } = await sb.from(TABLE).insert({
      type: "idee",
      titre: e.titre,
      description: e.description,
      statut: "livre",
      severite: null,
      page: null,
      auteur_initiales: "REAL31",
      livre_at: e.livre_at,
    });
    if (error) throw error;
    inserees += 1;
    console.log(`  + inséré : ${e.titre}`);
  }

  console.log(`\nRécap : ${inserees} entrée(s) insérée(s) / ${dejaLa} déjà présente(s).`);
}

main().catch((err) => {
  console.error("Échec du seed :", err.message ?? err);
  process.exit(1);
});
