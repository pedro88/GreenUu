import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import styles from './Markdown.module.scss';

/**
 * Markdown des contenus communautaires (GUI-01) : le HTML brut n'est jamais interprété et l'arbre est assaini
 * (schéma GitHub de rehype-sanitize). Aucun script ne peut s'exécuter, la CSP à nonce reste la seconde barrière.
 */
export function Markdown({ children }: { children: string }) {
  return <div className={styles.md} data-testid="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} skipHtml>{children}</ReactMarkdown></div>;
}
