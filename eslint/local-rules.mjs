// Règles ESLint locales (SPEC §3.1 et I18N-01).

/** Tout `x as T` doit être précédé d'un commentaire `// as: <raison>` (sauf `as const`). */
const justifiedAs = {
  meta: { type: 'problem', messages: { missing: '`as` non justifié : ajoute un commentaire `// as: <raison>` juste au-dessus.' }, schema: [] },
  create(context) {
    const source = context.sourceCode;
    return {
      TSAsExpression(node) {
        const ann = node.typeAnnotation;
        if (ann.type === 'TSTypeReference' && ann.typeName.type === 'Identifier' && ann.typeName.name === 'const') return;
        const line = node.loc.start.line;
        const justified = source
          .getAllComments()
          .some((c) => /\bas:\s*\S/.test(c.value) && c.loc.end.line >= line - 2 && c.loc.end.line <= line);
        if (!justified) context.report({ node, messageId: 'missing' });
      },
    };
  },
};

const TEXT_ATTRS = new Set(['alt', 'title', 'placeholder', 'aria-label', 'aria-description', 'label']);
const hasLetters = (s) => /\p{L}{2,}/u.test(s);

/** Aucune chaîne affichée en dur dans le JSX : passer par next-intl. */
const noLiteralJsxText = {
  meta: { type: 'problem', messages: { literal: 'Texte en dur dans le JSX : utilise une clé de traduction (next-intl).' }, schema: [] },
  create(context) {
    return {
      JSXText(node) {
        if (hasLetters(node.value)) context.report({ node, messageId: 'literal' });
      },
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier' || !TEXT_ATTRS.has(node.name.name)) return;
        const v = node.value;
        if (v?.type === 'Literal' && typeof v.value === 'string' && hasLetters(v.value)) {
          context.report({ node: v, messageId: 'literal' });
        }
      },
    };
  },
};

const plugin = { rules: { 'justified-as': justifiedAs, 'no-literal-jsx-text': noLiteralJsxText } };

export default plugin;
