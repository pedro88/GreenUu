import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

/*
 * Une exécution e2e à la fois (audit de suivi, m4) : toutes partagent la base `greenu_test` et le port 3100, et une
 * seconde exécution réinitialiserait la base sous les pieds de la première. Le processus principal de Playwright prend
 * le verrou au chargement de la configuration et le rend à sa sortie ; un verrou dont le processus est mort est ignoré.
 * Les workers et `--list` ne le prennent pas.
 */

const LOCK = 'reports/.e2e.lock';

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

export function acquireE2eLock(): void {
  if (process.env.TEST_WORKER_INDEX !== undefined || process.argv.includes('--list')) return;
  if (existsSync(LOCK)) {
    const pid = Number(readFileSync(LOCK, 'utf8'));
    if (pid && pid !== process.pid && alive(pid)) {
      throw new Error(`Une exécution e2e tourne déjà (processus ${pid}) : elle partage la base greenu_test et le port 3100. Attendre sa fin, ou supprimer ${LOCK} si ce processus n'est pas Playwright.`);
    }
  }
  mkdirSync('reports', { recursive: true });
  writeFileSync(LOCK, String(process.pid));
  process.on('exit', () => {
    try {
      if (Number(readFileSync(LOCK, 'utf8')) === process.pid) rmSync(LOCK);
    } catch { /* déjà retiré */ }
  });
}
