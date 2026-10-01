import type { Rule } from 'eslint';

declare const plugin: { rules: Record<'justified-as' | 'no-literal-jsx-text', Rule.RuleModule> };
export default plugin;
