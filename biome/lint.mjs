import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const root = join(import.meta.dirname, '..');

// Lints `source` as if it sat at `relPath` in the repo, under a copy of the
// repo's Biome config outside it, so an override matching by path applies
// and a killed run leaves nothing in the repo. VCS is off because the copy
// is no git checkout.
export function lint(source, relPath) {
  const tmp = mkdtempSync(join(tmpdir(), 'biome-'));
  try {
    cpSync(join(root, 'biome.jsonc'), join(tmp, 'biome.jsonc'));
    cpSync(join(root, 'biome'), join(tmp, 'biome'), { recursive: true });
    const file = join(tmp, relPath);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, source);
    return spawnSync(
      join(root, 'node_modules/.bin/biome'),
      ['lint', '--vcs-enabled=false', relPath],
      { cwd: tmp, encoding: 'utf8' },
    );
  } finally {
    rmSync(tmp, { recursive: true });
  }
}
