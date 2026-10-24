// Exercises the git steps of patch and self-check in a throwaway repo (never the project repo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execa } from 'execa';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as git from '../src/git.ts';

async function repo() {
  const root = mkdtempSync(join(tmpdir(), 'bugsy-git-'));
  const g = (...a: string[]) => execa('git', a, { cwd: root });
  await g('init', '-q');
  await g('config', 'user.email', 't@t');
  await g('config', 'user.name', 't');
  mkdirSync(join(root, 'app/src/routes'), { recursive: true });
  writeFileSync(join(root, 'app/src/routes/invoices.ts'), 'const q = "SELECT * FROM invoices WHERE id = ?";\n');
  writeFileSync(join(root, 'other.txt'), 'x\n');
  await g('add', '-A');
  await g('commit', '-q', '-m', 'A');
  return { root, g };
}

const DIFF = `--- a/app/src/routes/invoices.ts
+++ b/app/src/routes/invoices.ts
@@ -1 +1 @@
-const q = "SELECT * FROM invoices WHERE id = ?";
+const q = "SELECT * FROM invoices WHERE id = ? AND owner_id = ?";
`;

test('patch: check, apply, commit only touched files; refusal restores', async () => {
  const { root, g } = await repo();
  assert.deepEqual(await git.diffFiles(root, DIFF), ['app/src/routes/invoices.ts']);
  assert.equal((await git.applyCheck(root, DIFF)).ok, true);
  assert.equal((await git.applyCheck(root, 'garbage')).ok, false);

  // refusal path
  await git.apply(root, DIFF);
  await git.unapply(root, DIFF, ['app/src/routes/invoices.ts']);
  // bugsy/.run is created by writeDiff in this temp repo; ignore it for the cleanliness check
  const tracked = (await git.porcelain(root)).filter((l) => !l.startsWith('??'));
  assert.deepEqual(tracked, []);

  // green path; an unrelated dirty file must not be committed
  writeFileSync(join(root, 'other.txt'), 'dirty\n');
  await git.apply(root, DIFF);
  const B = await git.commitFiles(root, ['app/src/routes/invoices.ts'], 'fix(authz): S2_other_reads_by_url — test');
  const shown = (await g('show', '--name-only', '--format=', B)).stdout.trim();
  assert.equal(shown, 'app/src/routes/invoices.ts');
  assert.equal(await git.findFixCommit(root, 'S2_other_reads_by_url'), B);
  await g('checkout', '--', 'other.txt');
});

test('self-check: revert --no-commit then restore leaves history and tree intact', async () => {
  const { root, g } = await repo();
  writeFileSync(join(root, 'app/src/routes/invoices.ts'), 'patched\n');
  await g('commit', '-q', '-am', 'fix(authz): S2_x — B');
  const B = await git.headSha(root);
  await git.revertNoCommit(root, B);
  assert.match(readFileSync(join(root, 'app/src/routes/invoices.ts'), 'utf8'), /SELECT/);
  await git.restoreHead(root);
  assert.equal(readFileSync(join(root, 'app/src/routes/invoices.ts'), 'utf8'), 'patched\n');
  assert.equal(await git.headSha(root), B);
  assert.deepEqual(await git.porcelain(root), []);
});

test('self-check restore keeps uncommitted report changes untouched', async () => {
  const { root, g } = await repo();
  writeFileSync(join(root, 'report.json'), 'v1\n');
  await g('add', 'report.json');
  await g('commit', '-q', '-m', 'report v1');
  writeFileSync(join(root, 'app/src/routes/invoices.ts'), 'patched\n');
  await g('commit', '-q', '-am', 'fix(authz): S2_x — B');
  const B = await git.headSha(root);
  writeFileSync(join(root, 'report.json'), 'v2 (uncommitted)\n');
  await git.revertNoCommit(root, B);
  assert.match(readFileSync(join(root, 'app/src/routes/invoices.ts'), 'utf8'), /SELECT/);
  await git.restoreHead(root);
  assert.equal(readFileSync(join(root, 'app/src/routes/invoices.ts'), 'utf8'), 'patched\n');
  assert.equal(readFileSync(join(root, 'report.json'), 'utf8'), 'v2 (uncommitted)\n');
  assert.deepEqual(await git.porcelain(root), [' M report.json']);
});
