/** Pratiques effectives d'une zone pour une saison (RG-GRD-06, RG-ZON-03). */

export type PracticeDeclaration = {
  practiceCode: string;
  zoneId: string | null; // null = déclaration au niveau du jardin
  seasonYear: number | null; // null = permanente
  excluded: boolean;
};

/**
 * `zoneChain` = IDs de la racine jusqu'à la zone elle-même (incluse).
 * Les déclarations sont appliquées dans l'ordre jardin → racine → … → zone : une exclusion plus
 * profonde retire la pratique, une déclaration plus profonde la réintroduit.
 */
export function effectivePractices(
  declarations: PracticeDeclaration[],
  zoneChain: string[],
  seasonYear: number,
): Set<string> {
  const applicable = declarations.filter((d) => d.seasonYear === null || d.seasonYear === seasonYear);
  const levels: (string | null)[] = [null, ...zoneChain];
  const result = new Set<string>();
  for (const level of levels) {
    for (const d of applicable) {
      if (d.zoneId !== level) continue;
      if (d.excluded) result.delete(d.practiceCode);
      else result.add(d.practiceCode);
    }
  }
  return result;
}
