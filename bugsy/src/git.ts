// Thin git wrappers. Used only by `bugsy patch` and `bugsy self-check`, when the owner runs them.
import { execa } from 'execa';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

async function git(root: string, args: string[], input?: string) {
  return execa('git', args, { cwd: root, reject: false, input });
}

export async function headSha(root: string): Promise<string> {
  const r = await git(root, ['rev-parse', 'HEAD']);
  return r.exitCode === 0 ? r.stdout.trim() : 'nogit';
}

export const short = (sha: string) => sha.slice(0, 7);

export async function porcelain(root: string): Promise<string[]> {
  const r = await git(root, ['status', '--porcelain']);
  if (r.exitCode !== 0) throw new Error(`git status failed: ${r.stderr}`);
  return r.stdout.split('\n').filter(Boolean);
}

export async function isClean(root: string): Promise<boolean> {
  return (await porcelain(root)).length === 0;
}

/** Files with local changes (tracked) among `files`. */
export async function dirtyAmong(root: string, files: string[]): Promise<string[]> {
  if (!files.length) return [];
  const r = await git(root, ['status', '--porcelain', '--', ...files]);
  return r.stdout.split('\n').filter(Boolean).map((l) => l.slice(3));
}

// Patchers sometimes miscount hunk header line numbers; every apply uses --recount so the hunk
// bodies (context, - and + lines) decide, and a wrong count alone does not reject a correct change.
function writeDiff(root: string, diff: string): string {
  const p = resolve(root, 'bugsy/.run/patch.diff');
  mkdirSync(resolve(p, '..'), { recursive: true });
  writeFileSync(p, diff.endsWith('\n') ? diff : diff + '\n');
  return p;
}

/** Paths a diff touches (via `git apply --numstat`, which does not modify anything). */
export async function diffFiles(root: string, diff: string): Promise<string[]> {
  const p = writeDiff(root, diff);
  const r = await git(root, ['apply', '--recount', '--numstat', p]);
  if (r.exitCode !== 0) return [];
  return r.stdout
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t')[2]!)
    .filter(Boolean);
}

export async function applyCheck(root: string, diff: string): Promise<{ ok: boolean; error: string }> {
  const p = writeDiff(root, diff);
  const r = await git(root, ['apply', '--recount', '--check', p]);
  return { ok: r.exitCode === 0, error: r.stderr.trim() };
}

export async function apply(root: string, diff: string): Promise<void> {
  const p = writeDiff(root, diff);
  const r = await git(root, ['apply', '--recount', p]);
  if (r.exitCode !== 0) throw new Error(`git apply failed: ${r.stderr}`);
}

/** Undo an applied diff (handles new files too), then restore tracked files from HEAD. */
export async function unapply(root: string, diff: string, files: string[]): Promise<void> {
  const p = writeDiff(root, diff);
  await git(root, ['apply', '--recount', '-R', p]);
  await checkoutFiles(root, files);
}

export async function checkoutFiles(root: string, files: string[]): Promise<void> {
  if (!files.length) return;
  await git(root, ['checkout', '--', ...files]);
}

/** Commit exactly `files` (never `add -A`). Returns the new HEAD sha. */
export async function commitFiles(root: string, files: string[], message: string): Promise<string> {
  const add = await git(root, ['add', '--', ...files]);
  if (add.exitCode !== 0) throw new Error(`git add failed: ${add.stderr}`);
  const c = await git(root, ['commit', '-m', message, '--', ...files]);
  if (c.exitCode !== 0) throw new Error(`git commit failed: ${c.stderr || c.stdout}`);
  return headSha(root);
}

export async function revertNoCommit(root: string, sha: string): Promise<void> {
  const r = await git(root, ['revert', '--no-commit', sha]);
  if (r.exitCode !== 0) throw new Error(`git revert --no-commit ${short(sha)} failed: ${r.stderr}`);
}

/** Undo an in-progress `revert --no-commit`; falls back to restoring HEAD's tracked files. */
export async function restoreHead(root: string): Promise<void> {
  const a = await git(root, ['revert', '--abort']);
  if (a.exitCode !== 0) {
    await git(root, ['reset', '-q', 'HEAD', '--', '.']);
    await git(root, ['checkout', '--', '.']);
  }
}

/** The last commit whose subject starts with `fix(authz): <scenario>` (the patch commit B). */
export async function findFixCommit(root: string, scenario?: string): Promise<string | null> {
  const grep = scenario ? `^fix(authz): ${scenario}` : '^fix(authz): ';
  const r = await git(root, ['log', '-n', '1', '--format=%H', '--fixed-strings', `--grep=${grep.replace(/^\^/, '')}`]);
  const sha = r.stdout.trim();
  return sha || null;
}
