import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, it } from 'vitest';
import local from '../../eslint/local-rules.mjs';

RuleTester.describe = describe;
RuleTester.it = it;
const tester = new RuleTester({ languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } } });

describe('règles ESLint locales', () => {
  describe('[I18N-01] pas de texte affiché en dur dans le JSX', () => {
    tester.run('no-literal-jsx-text', local.rules['no-literal-jsx-text'], {
      valid: ['const a = <p>{t("x")}</p>;', 'const b = <span> · </span>;', 'const c = <input placeholder={t("p")} />;'],
      invalid: [
        { code: 'const a = <p>Bonjour</p>;', errors: 1 },
        { code: 'const b = <img alt="Une tomate" />;', errors: 1 },
      ],
    });
  });

  describe('les `as` doivent être justifiés', () => {
    tester.run('justified-as', local.rules['justified-as'], {
      valid: ['const a = [1] as const;', '// as: raison\nconst b = x as string;'],
      invalid: [{ code: 'const b = x as string;', errors: 1 }],
    });
  });
});
