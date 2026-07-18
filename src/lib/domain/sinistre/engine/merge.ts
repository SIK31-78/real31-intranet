/**
 * Moteur de fusion des courriers - interprète la syntaxe des gabarits.
 *
 * Syntaxe (CLAUDE.md §2) :
 * {{champ}} variable simple
 * {{#si condition}}…{{/si}} bloc conditionnel (imbricable)
 *
 * Le moteur ne connaît AUCUN champ ni condition en particulier : il les
 * découvre dans le gabarit. Ajouter un courrier ne nécessite aucun code.
 */

export type FieldValues = Record<string, string>;
export type Conditions = Record<string, boolean>;

// --- AST -------------------------------------------------------------------

interface TextNode {
  kind: 'text';
  value: string;
}
interface FieldNode {
  kind: 'field';
  name: string;
}
interface IfNode {
  kind: 'if';
  condition: string;
  children: TemplateNode[];
}
export type TemplateNode = TextNode | FieldNode | IfNode;

// [\s\S] au lieu du flag `s` (dotAll) : evite d'exiger target es2018+ cote hote.
const TOKEN_RE = /\{\{\s*([\s\S]*?)\s*\}\}/g;

/**
 * Analyse un gabarit en AST. Lève si les blocs `{{#si}}`/`{{/si}}` sont
 * déséquilibrés (filet de sécurité : validate-data le vérifie déjà au build).
 */
export function parseTemplate(gabarit: string): TemplateNode[] {
  const root: TemplateNode[] = [];
  const stack: TemplateNode[][] = [root];
  const conditions: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const pushText = (text: string) => {
    if (text.length === 0) return;
    stack[stack.length - 1]!.push({ kind: 'text', value: text });
  };

  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(gabarit)) !== null) {
    pushText(gabarit.slice(lastIndex, match.index));
    lastIndex = TOKEN_RE.lastIndex;
    const inner = match[1]!.trim();

    if (inner.startsWith('#si')) {
      const condition = inner.slice(3).trim();
      const node: IfNode = { kind: 'if', condition, children: [] };
      stack[stack.length - 1]!.push(node);
      stack.push(node.children);
      conditions.push(condition);
    } else if (inner === '/si') {
      if (stack.length === 1) {
        throw new Error('Bloc « {{/si}} » sans « {{#si}} » correspondant.');
      }
      stack.pop();
      conditions.pop();
    } else {
      stack[stack.length - 1]!.push({ kind: 'field', name: inner });
    }
  }
  pushText(gabarit.slice(lastIndex));

  if (stack.length !== 1) {
    throw new Error(`Bloc « {{#si ${conditions[conditions.length - 1]}}} » non fermé.`);
  }
  return root;
}

// --- Découverte des champs / conditions -----------------------------------

/** Tous les champs `{{champ}}` du gabarit (ordre d'apparition, sans doublon). */
export function extractFields(gabarit: string): string[] {
  return uniqueFields(parseTemplate(gabarit), () => true);
}

/** Toutes les conditions `{{#si …}}` du gabarit (sans doublon). */
export function extractConditions(gabarit: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (ns: TemplateNode[]) => {
    for (const n of ns) {
      if (n.kind === 'if') {
        if (!seen.has(n.condition)) {
          seen.add(n.condition);
          out.push(n.condition);
        }
        walk(n.children);
      }
    }
  };
  walk(parseTemplate(gabarit));
  return out;
}

/**
 * Champs effectivement présents dans le rendu compte tenu des conditions
 * actives. Un champ d'un bloc `{{#si}}` désactivé n'est pas requis.
 */
export function activeFields(gabarit: string, conditions: Conditions): string[] {
  return uniqueFields(parseTemplate(gabarit), (cond) => Boolean(conditions[cond]));
}

// --- Rendu -----------------------------------------------------------------

/** Fusionne le gabarit avec les valeurs et conditions fournies. */
export function render(gabarit: string, values: FieldValues, conditions: Conditions): string {
  const renderNodes = (ns: TemplateNode[]): string =>
    ns
      .map((n) => {
        switch (n.kind) {
          case 'text':
            return n.value;
          case 'field':
            return values[n.name] ?? '';
          case 'if':
            return conditions[n.condition] ? renderNodes(n.children) : '';
        }
      })
      .join('');
  return renderNodes(parseTemplate(gabarit));
}

// --- Complétude / export ---------------------------------------------------

/** Un champ est « vide » s'il est absent ou ne contient que des espaces. */
export function isEmpty(value: string | undefined): boolean {
  return value === undefined || value.trim().length === 0;
}

/**
 * Champs requis non renseignés : champs présents dans les portions actives du
 * gabarit dont la valeur est vide. Tant que la liste n'est pas vide, l'export
 * (copier / imprimer) doit rester désactivé (CLAUDE.md §6.5).
 */
export function missingRequiredFields(
  gabarit: string,
  values: FieldValues,
  conditions: Conditions,
): string[] {
  return activeFields(gabarit, conditions).filter((f) => isEmpty(values[f]));
}

/** Vrai si tous les champs requis (actifs) sont renseignés. */
export function canExport(gabarit: string, values: FieldValues, conditions: Conditions): boolean {
  return missingRequiredFields(gabarit, values, conditions).length === 0;
}

// --- Interne ---------------------------------------------------------------

function uniqueFields(
  ast: TemplateNode[],
  condActive: (condition: string) => boolean,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (ns: TemplateNode[]) => {
    for (const n of ns) {
      if (n.kind === 'field') {
        if (!seen.has(n.name)) {
          seen.add(n.name);
          out.push(n.name);
        }
      } else if (n.kind === 'if' && condActive(n.condition)) {
        walk(n.children);
      }
    }
  };
  walk(ast);
  return out;
}
