"use client";

// Formulaire PUBLIC de la fiche de renseignements. Deux temps :
//   1. VERROU : on demande le code personnel (imprime sur le courrier). Rien n'est affiche
//      avant : ni nom, ni copro (anti-enumeration). Honeypot cache anti-bot.
//   2. Apres code correct : soit le formulaire pre-rempli (si soumission possible), soit un
//      recapitulatif en lecture seule (fiche deja transmise / expiree).
//
// Aucune PII n'arrive au client avant la verification du code (le serveur ne renvoie la vue
// qu'apres). On reste volontairement sobre et autonome (pas d'AppShell : page publique).

import { useState } from "react";
import type { FormEvent } from "react";
import {
  verifierCodeAction,
  soumettreFicheAction,
  type FichePubliqueVue,
} from "./actions";
import type { DonneesSoumises } from "@/lib/reprise/domain/fiche-renseignements";

export function FichePublique({ token }: { token: string }) {
  const [vue, setVue] = useState<FichePubliqueVue | null>(null);
  const [code, setCode] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const deverrouiller = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setBusy(true);
    const r = await verifierCodeAction(token, code, honeypot);
    setBusy(false);
    if (r.ok) setVue(r.vue);
    else setErreur(r.message);
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: "24px 16px",
        background: "#f3f4f6",
      }}
    >
      <div style={{ width: "100%", maxWidth: 720 }}>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 20, color: "#0f5132" }}>REAL 31</div>
          <div style={{ fontSize: 13, color: "#475569" }}>Fiche de renseignements coproprietaire</div>
        </div>

        {!vue ? (
          <form onSubmit={deverrouiller} style={carte}>
            <p style={{ fontSize: 14, color: "#334155", marginTop: 0 }}>
              Saisissez le <strong>code personnel</strong> figurant sur votre courrier pour acceder a votre fiche.
            </p>
            <label style={label}>Code personnel</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="Ex : 4F7K2Q9C"
              style={{ ...input, letterSpacing: 2, textTransform: "uppercase", fontFamily: "monospace" }}
              required
            />
            {/* Honeypot : cache visuellement, doit rester vide (piege a bots). */}
            <input
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
            />
            {erreur && <p style={erreurStyle}>{erreur}</p>}
            <button type="submit" disabled={busy || code.trim().length === 0} style={boutonPrimaire}>
              {busy ? "Verification..." : "Acceder a ma fiche"}
            </button>
            <p style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 0 }}>
              Vous pouvez aussi completer le document papier et le renvoyer par courrier ou email a votre gestionnaire.
            </p>
          </form>
        ) : (
          <FicheDeverrouillee token={token} code={code} honeypot={honeypot} vue={vue} onRefresh={setVue} />
        )}
      </div>
    </main>
  );
}

function FicheDeverrouillee({
  token,
  code,
  honeypot,
  vue,
  onRefresh,
}: {
  token: string;
  code: string;
  honeypot: string;
  vue: FichePubliqueVue;
  onRefresh: (v: FichePubliqueVue) => void;
}) {
  if (!vue.soumissionPossible) {
    return (
      <div style={carte}>
        {vue.statut === "valide" || vue.statut === "soumis" ? (
          <>
            <div style={{ ...bandeau, background: "#f0fdf4", borderColor: "#16a34a", color: "#166534" }}>
              Votre fiche a bien ete transmise. Merci !
            </div>
            {vue.soumises && <Recap soumises={vue.soumises} />}
          </>
        ) : (
          <div style={{ ...bandeau, background: "#fef2f2", borderColor: "#dc2626", color: "#991b1b" }}>
            Ce lien a expire. Contactez votre gestionnaire pour recevoir un nouveau courrier.
          </div>
        )}
      </div>
    );
  }
  return <FormulaireFiche token={token} code={code} honeypot={honeypot} vue={vue} onRefresh={onRefresh} />;
}

function FormulaireFiche({
  token,
  code,
  honeypot,
  vue,
  onRefresh,
}: {
  token: string;
  code: string;
  honeypot: string;
  vue: FichePubliqueVue;
  onRefresh: (v: FichePubliqueVue) => void;
}) {
  const c = vue.connues;
  const [f, setF] = useState<DonneesSoumises>({
    email: c.emailConnu ?? "",
    telFixe: c.telFixe ?? "",
    telPortable: c.telPortable ?? "",
    adrNum: c.adrNum ?? "",
    adrVoie: c.adrVoie ?? "",
    adrComplement: c.adrComplement ?? "",
    adrCodePostal: c.adrCodePostal ?? "",
    adrVille: c.adrVille ?? "",
    prelevement: "aucun",
  });
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof DonneesSoumises>(k: K, v: DonneesSoumises[K]) => setF((p) => ({ ...p, [k]: v }));

  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setBusy(true);
    // On purge les champs vides pour ne pas envoyer de chaines "" (zod optional).
    const donnees = Object.fromEntries(
      Object.entries(f).filter(([, v]) => v !== "" && v !== undefined),
    ) as unknown as DonneesSoumises;
    const r = await soumettreFicheAction(token, code, donnees, honeypot);
    setBusy(false);
    if (r.ok) {
      onRefresh({ ...vue, statut: "soumis", soumissionPossible: false, soumises: f });
    } else {
      setErreur(r.message);
    }
  };

  const nom = [c.civilite, c.nom, c.prenom].filter(Boolean).join(" ");

  return (
    <form onSubmit={soumettre} style={carte}>
      <p style={{ fontSize: 14, color: "#334155", marginTop: 0 }}>
        Bonjour <strong>{nom}</strong>. Verifiez et completez vos informations, puis validez. Votre email nous permet
        d&apos;activer votre extranet.
      </p>

      <Section titre="Vos coordonnees">
        <Champ label="Email" requis>
          <input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} style={input} required />
        </Champ>
        <Deux>
          <Champ label="Telephone fixe">
            <input value={f.telFixe ?? ""} onChange={(e) => set("telFixe", e.target.value)} style={input} />
          </Champ>
          <Champ label="Telephone portable">
            <input value={f.telPortable ?? ""} onChange={(e) => set("telPortable", e.target.value)} style={input} />
          </Champ>
        </Deux>
        <Deux>
          <Champ label="N°">
            <input value={f.adrNum ?? ""} onChange={(e) => set("adrNum", e.target.value)} style={input} />
          </Champ>
          <Champ label="Rue">
            <input value={f.adrVoie ?? ""} onChange={(e) => set("adrVoie", e.target.value)} style={input} />
          </Champ>
        </Deux>
        <Champ label="Complement d'adresse">
          <input value={f.adrComplement ?? ""} onChange={(e) => set("adrComplement", e.target.value)} style={input} />
        </Champ>
        <Deux>
          <Champ label="Code postal">
            <input value={f.adrCodePostal ?? ""} onChange={(e) => set("adrCodePostal", e.target.value)} style={input} />
          </Champ>
          <Champ label="Ville">
            <input value={f.adrVille ?? ""} onChange={(e) => set("adrVille", e.target.value)} style={input} />
          </Champ>
        </Deux>
      </Section>

      <Section titre="Occupation de votre lot">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {(["principale", "secondaire", "loue"] as const).map((o) => (
            <label key={o} style={radio}>
              <input
                type="radio"
                name="occupation"
                checked={f.occupation === o}
                onChange={() => set("occupation", o)}
              />
              {o === "principale" ? "Residence principale" : o === "secondaire" ? "Residence secondaire" : "Loue / occupe"}
            </label>
          ))}
        </div>
        {f.occupation === "loue" && (
          <Deux>
            <Champ label="Occupant (nom)">
              <input value={f.occupantNom ?? ""} onChange={(e) => set("occupantNom", e.target.value)} style={input} />
            </Champ>
            <Champ label="Occupant (telephone)">
              <input value={f.occupantTel ?? ""} onChange={(e) => set("occupantTel", e.target.value)} style={input} />
            </Champ>
          </Deux>
        )}
      </Section>

      <Section titre="Preferences">
        <label style={check}>
          <input
            type="checkbox"
            checked={f.recevoirParCourriel ?? false}
            onChange={(e) => set("recevoirParCourriel", e.target.checked)}
          />
          Recevoir mes appels de fonds et correspondances par courriel
        </label>
        <label style={check}>
          <input type="checkbox" checked={f.refuseLRE ?? false} onChange={(e) => set("refuseLRE", e.target.checked)} />
          Je refuse la Lettre Recommandee Electronique (LRE par defaut)
        </label>
        <Champ label="Prelevement automatique">
          <select
            value={f.prelevement ?? "aucun"}
            onChange={(e) => set("prelevement", e.target.value as DonneesSoumises["prelevement"])}
            style={input}
          >
            <option value="aucun">Aucun</option>
            <option value="trimestriel">Trimestriel</option>
            <option value="mensuel">Mensuel</option>
          </select>
        </Champ>
      </Section>

      <Section titre="Consentements">
        <label style={check}>
          <input
            type="checkbox"
            checked={f.consentPrestataires ?? false}
            onChange={(e) => set("consentPrestataires", e.target.checked)}
          />
          J&apos;autorise REAL 31 a transmettre mes coordonnees aux prestataires de la copropriete (jamais a des fins
          commerciales).
        </label>
        <label style={check}>
          <input
            type="checkbox"
            checked={f.consentActualites ?? false}
            onChange={(e) => set("consentActualites", e.target.checked)}
          />
          J&apos;accepte de recevoir les actualites de REAL 31 (facultatif, revocable).
        </label>
      </Section>

      <p style={{ fontSize: 11, color: "#94a3b8" }}>
        Donnees necessaires a la gestion de votre copropriete (RGPD) : droit d&apos;acces, rectification, effacement et
        opposition aupres de votre gestionnaire.
      </p>

      {erreur && <p style={erreurStyle}>{erreur}</p>}
      <button type="submit" disabled={busy} style={boutonPrimaire}>
        {busy ? "Envoi..." : "Valider et transmettre ma fiche"}
      </button>
    </form>
  );
}

function Recap({ soumises }: { soumises: DonneesSoumises }) {
  const lignes: [string, string][] = [
    ["Email", soumises.email],
    ["Telephone fixe", soumises.telFixe ?? ""],
    ["Telephone portable", soumises.telPortable ?? ""],
    ["Occupation", soumises.occupation ?? ""],
  ].filter(([, v]) => v) as [string, string][];
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>Recapitulatif transmis</div>
      {lignes.map(([k, v]) => (
        <div key={k} style={{ fontSize: 13, color: "#475569", padding: "2px 0" }}>
          <span style={{ color: "#94a3b8" }}>{k} : </span>
          {v}
        </div>
      ))}
    </div>
  );
}

// --- Petits blocs de mise en page (styles inline : page autonome) ---------------

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12, margin: "0 0 12px" }}>
      <legend style={{ fontSize: 12, fontWeight: 700, color: "#0f5132", padding: "0 6px" }}>{titre}</legend>
      {children}
    </fieldset>
  );
}
function Champ({ label, requis, children }: { label: string; requis?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={labelStyle}>
        {label} {requis && <span style={{ color: "#dc2626" }}>*</span>}
      </label>
      {children}
    </div>
  );
}
function Deux({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{children}</div>;
}

const carte: React.CSSProperties = {
  position: "relative",
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 20,
  boxShadow: "0 1px 3px rgba(0,0,0,.08)",
};
const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, color: "#475569", marginBottom: 4 };
const label = labelStyle;
const input: React.CSSProperties = {
  width: "100%",
  height: 36,
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "0 10px",
  fontSize: 14,
  color: "#0f172a",
  background: "#fff",
};
const boutonPrimaire: React.CSSProperties = {
  width: "100%",
  height: 42,
  border: 0,
  borderRadius: 8,
  background: "#0f5132",
  color: "#fff",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
  margin: "6px 0 10px",
};
const erreurStyle: React.CSSProperties = { color: "#dc2626", fontSize: 13, margin: "4px 0" };
const bandeau: React.CSSProperties = { border: "1px solid", borderRadius: 8, padding: "10px 12px", fontSize: 14 };
const radio: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#334155" };
const check: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  fontSize: 13,
  color: "#334155",
  margin: "6px 0",
};
