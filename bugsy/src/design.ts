// Scenarios → runnable tests through Kane's assurance flow:
// context ingest → context review --approve → design tests (--max 1) per scenario → copy into tests_dir.
// Any pause that a single plain-words resume does not clear → caller falls back to prepared tests (announced).
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { designTests, ingest, reviewApprove, type StreamOptions } from './kane.ts';
import type { Scenario } from './types.ts';

const tokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !['the', 'and', 'can', 'uc', 'use', 'case'].includes(t)),
  );

/** Greedy best-overlap assignment of use-case refs to scenarios. */
export function assignUseCases(scenarios: Scenario[], useCases: string[]): Map<string, string> {
  const pairs: { s: string; u: string; score: number }[] = [];
  for (const s of scenarios) {
    const st = tokens(`${s.id} ${s.title}`);
    for (const u of useCases) {
      const ut = tokens(u);
      let score = 0;
      for (const t of ut) if (st.has(t)) score++;
      pairs.push({ s: s.id, u, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  const out = new Map<string, string>();
  const usedU = new Set<string>();
  for (const p of pairs) {
    if (out.has(p.s) || usedU.has(p.u)) continue;
    out.set(p.s, p.u);
    usedU.add(p.u);
  }
  return out;
}

export type DesignOutcome =
  | { ok: true; files: string[] }
  | { ok: false; reason: string };

export async function designFromScenarios(opts: {
  root: string;
  requirementsFile: string;
  testsDir: string;
  scenarios: Scenario[];
  log: (m: string) => void;
}): Promise<DesignOutcome> {
  const s: StreamOptions = { cwd: opts.root };
  opts.log(`  Kane: context ingest ${opts.requirementsFile}`);
  const ing = await ingest(opts.requirementsFile, s, 'Use the document as written: one use case per scenario section, with the listed steps and expected text.');
  if (ing.paused) return { ok: false, reason: 'ingest paused twice' };
  if (ing.exit_code !== 0) return { ok: false, reason: `ingest exit ${ing.exit_code}: ${ing.errors.join('; ')}` };
  if (!ing.useCases.length) return { ok: false, reason: 'ingest minted no use cases' };
  opts.log(`  Kane: ${ing.useCases.length} use case(s): ${ing.useCases.join(', ')}`);

  const rv = await reviewApprove(ing.useCases, s);
  if (rv.exit_code !== 0) return { ok: false, reason: `review --approve exit ${rv.exit_code}` };

  const map = assignUseCases(opts.scenarios, ing.useCases);
  const dst = resolve(opts.root, opts.testsDir);
  mkdirSync(dst, { recursive: true });
  const files: string[] = [];
  for (const sc of opts.scenarios) {
    const uc = map.get(sc.id);
    if (!uc) return { ok: false, reason: `no use case for ${sc.id}` };
    opts.log(`  Kane: design tests --use-case ${uc} --max 1  (${sc.id})`);
    const message = `Steps, in this order, in one browser session: ${sc.steps.join('; ')}. Expected: ${sc.expected.join('; ')}.`;
    const d = await designTests(uc, s, { max: 1, message });
    if (d.paused) return { ok: false, reason: `design for ${sc.id} paused twice` };
    if (d.exit_code !== 0) return { ok: false, reason: `design for ${sc.id} exit ${d.exit_code}: ${d.errors.join('; ')}` };
    if (!d.tests.length) return { ok: false, reason: `design for ${sc.id} wrote no test file` };
    const target = resolve(dst, `${sc.id}_test.md`);
    copyFileSync(d.tests[0]!, target);
    files.push(target);
  }
  return { ok: true, files };
}
