import { tDynamic } from '@/i18n/dynamic';
import clsx from 'clsx';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/Layout';
import type { ZoneTreeNode } from '../service';
import styles from './ZoneTree.module.scss';

export async function ZoneTree({ gardenId, nodes }: { gardenId: string; nodes: ZoneTreeNode[] }) {
  return <ul className={styles.tree} data-testid="zone-tree">{nodes.map((n) => <ZoneNode key={n.id} gardenId={gardenId} node={n} />)}</ul>;
}

async function ZoneNode({ gardenId, node }: { gardenId: string; node: ZoneTreeNode }) {
  const t = await getTranslations('zones');
  const tt = await getTranslations('zoneTypes');
  const te = await getTranslations('environments');
  const f = await getFormatter();
  const typeLabel = node.typeIsCustom ? node.typeLabel : tDynamic(tt, node.typeCode, node.typeLabel);
  return (
    <li data-testid={`zone-node-${node.id}`} data-depth={node.depth}>
      <div className={clsx(styles.node, node.archived && styles.archived)}>
        <Link href={`/app/jardins/${gardenId}/zones/${node.id}`} className={styles.name}>{node.name}</Link>
        <Badge>{typeLabel}</Badge>
        {node.archived ? <Badge>{t('archived')}</Badge> : null}
        <span className={styles.meta}>
          {te(node.effectiveEnvironment)}
          {node.surface.m2 !== null ? ` · ${f.number(node.surface.m2, { maximumFractionDigits: 2 })} m²` : ''}
        </span>
      </div>
      {node.children.length > 0 ? (
        <ul className={styles.children}>{node.children.map((c) => <ZoneNode key={c.id} gardenId={gardenId} node={c} />)}</ul>
      ) : null}
    </li>
  );
}
