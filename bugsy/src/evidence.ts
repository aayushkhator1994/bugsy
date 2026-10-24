// Read a sealed Kane evidence pack (.evidence = zip) and write a REDACTED export:
// evidence/<execution_id>/run.yaml, failure.yaml, <label>/result.yaml, <label>/<n>-failure.yaml,
// <label>/<n>-screenshot.png. Never HAR, never console logs, never actions/run logs.
import AdmZip from 'adm-zip';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import type { EvidenceTest, KaneMember } from './types.ts';

const TEST_RE = /^tests\/([^/]+)\/(.+)$/;
const STEP_RE = /^steps\/(\d+)(?:-[^/]*)?\/(screenshot\.(?:png|jpe?g)|failure\.yaml)$/;

/** Allow-list: the only entry names that may leave the pack. */
export function isExportable(entry: string): boolean {
  if (entry === 'run.yaml' || entry === 'failure.yaml') return true;
  const m = TEST_RE.exec(entry);
  if (!m) return false;
  const rest = m[2]!;
  return rest === 'result.yaml' || STEP_RE.test(rest);
}

export function redactText(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 3) out = out.split(s).join('***');
  return out;
}

function safeYaml(text: string): any {
  try {
    return parseYaml(text);
  } catch {
    return undefined;
  }
}

/** "S2" from ".../S2_other_reads_by_url_test.md" or "S2_other_reads_by_url". */
export function scenarioLabel(nameOrPath: string): string | undefined {
  const m = /(?:^|[\/_\-\s])(S\d+)(?=[_\-\s.]|$)/i.exec(basename(nameOrPath)) ?? /^(S\d+)/i.exec(basename(nameOrPath));
  return m ? m[1]!.toUpperCase() : undefined;
}

interface PackTest {
  id: string;
  result?: any;
  resultText?: string;
  testMd?: string;
  steps: Map<number, { screenshot?: Buffer; screenshotExt?: string; failureText?: string; failure?: any }>;
}

function readPack(zip: AdmZip): { runYaml?: string; failureYaml?: string; tests: Map<string, PackTest> } {
  const tests = new Map<string, PackTest>();
  let runYaml: string | undefined;
  let failureYaml: string | undefined;
  for (const e of zip.getEntries()) {
    if (e.isDirectory) continue;
    const name = e.entryName.replace(/\\/g, '/');
    if (name === 'run.yaml') runYaml = e.getData().toString('utf8');
    else if (name === 'failure.yaml') failureYaml = e.getData().toString('utf8');
    const m = TEST_RE.exec(name);
    if (!m) continue;
    const id = m[1]!;
    const rest = m[2]!;
    const t: PackTest = tests.get(id) ?? { id, steps: new Map() };
    tests.set(id, t);
    if (rest === 'result.yaml') {
      t.resultText = e.getData().toString('utf8');
      t.result = safeYaml(t.resultText);
    } else if (rest === 'test.md') {
      t.testMd = e.getData().toString('utf8');
    } else {
      const s = STEP_RE.exec(rest);
      if (!s) continue;
      const n = Number(s[1]);
      const step = t.steps.get(n) ?? {};
      if (s[2]!.startsWith('screenshot.')) {
        step.screenshot = e.getData();
        step.screenshotExt = s[2]!.slice('screenshot.'.length);
      }
      else {
        step.failureText = e.getData().toString('utf8');
        step.failure = safeYaml(step.failureText);
      }
      t.steps.set(n, step);
    }
  }
  return { runYaml, failureYaml, tests };
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  return typeof v === 'string' ? v : JSON.stringify(v);
}

function testStatus(t: PackTest): string {
  const r = t.result ?? {};
  return String(r.status ?? r.verdict?.status ?? r.verdict ?? r.result ?? 'unknown');
}

function failedStep(t: PackTest): number | undefined {
  const steps: any[] = Array.isArray(t.result?.steps) ? t.result.steps : [];
  const f = steps.find((s) => s && /fail|broken|error/i.test(String(s.status)));
  if (f && Number.isFinite(Number(f.ordinal))) return Number(f.ordinal);
  const withFailure = [...t.steps].filter(([, s]) => s.failureText).map(([n]) => n);
  return withFailure.length ? Math.min(...withFailure) : undefined;
}

/** Separate the recorded assertion outcome from the later model's automation-bug diagnosis.
 * This never turns a broken test into a pass, and never changes the sealed pack or raw status.
 */
function assertionBeforeRca(t: PackTest, member: KaneMember | undefined, executionId: string): EvidenceTest['assertion_before_rca'] {
  if (testStatus(t) !== 'broken' || member?.status !== 'failed') return undefined;
  if (t.result?.external_id?.execution_id !== executionId || !t.testMd) return undefined;
  const hash = 'sha256:' + createHash('sha256').update(t.testMd).digest('hex');
  if (t.result?.definition?.sha256 !== hash) return undefined;
  const steps: any[] = Array.isArray(t.result?.steps) ? t.result.steps : [];
  const last = steps.at(-1);
  if (steps.length < 2 || last?.status !== 'failed' || last.kind !== 'assert') return undefined;
  if (steps.slice(0, -1).some((s) => s?.status !== 'passed')) return undefined;
  const failure = t.steps.get(Number(last.ordinal));
  const f = failure?.failure;
  // A recorded step id is "<test step, 0-based>-<action within it>"; Kane's "assertion_failed: @ step N"
  // names the action N, and the stream's step_index is the 1-based test step.
  const at = /^(\d+)-(\d+)$/.exec(String(last.id ?? ''));
  const assertion = /^assertion_failed:\s*@ step (\d+)$/;
  const action = assertion.exec(String(f?.error?.message ?? ''))?.[1];
  if (!at || !action || Number(action) !== Number(at[2])) return undefined;
  if (!Number.isInteger(member.failure?.step_index) || Number(at[1]) + 1 !== member.failure?.step_index) return undefined;
  if (!assertion.test(member.failure?.message ?? '') || member.failure?.message !== f.error.message) return undefined;
  const category = f?.triage?.rca?.category;
  if (f?.error?.type !== 'replay_failure' || f.step !== last.id || f.status !== 'broken'
    || f.triage?.status !== 'triaged' || f.triage?.by?.kind !== 'agent'
    || typeof category !== 'string' || !category.startsWith('automation_bug/')
    || typeof f.triage?.rca?.root_cause !== 'string'
    || !failure?.screenshot) return undefined;
  return { step_index: member.failure!.step_index!, rca_category: category };
}

/** Which member (by file name) does this pack test belong to? */
export function matchMember(t: { id: string; result?: any; testMd?: string }, members: KaneMember[]): KaneMember | undefined {
  const byId = members.find((m) => m.test_id && m.test_id === t.id);
  if (byId) return byId;
  const fields = [t.result?.path, t.result?.file, t.result?.name, t.result?.title, t.result?.test?.path, t.id]
    .filter(Boolean)
    .map(String);
  for (const m of members) {
    const stem = basename(m.path).replace(/_test\.md$/, '');
    if (fields.some((f) => f.includes(stem))) return m;
  }
  for (const m of members) {
    const label = scenarioLabel(m.path);
    if (label && fields.some((f) => scenarioLabel(f) === label)) return m;
  }
  return undefined;
}

export interface ExportResult {
  dir: string;
  tests: (EvidenceTest & { member_path?: string })[];
}

/**
 * Open the pack, export the redacted subset to <root>/<exportDir>/<execution_id>/ and return per-test data.
 * Paths in the result are repo-relative (to `root`).
 */
export function exportEvidence(opts: {
  packPath: string;
  executionId: string;
  root: string;
  exportDir: string;
  members?: KaneMember[];
  secrets?: string[];
}): ExportResult {
  const zip = new AdmZip(opts.packPath);
  const pack = readPack(zip);
  const secrets = opts.secrets ?? [];
  const dir = resolve(opts.root, opts.exportDir, opts.executionId);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  if (pack.runYaml) writeFileSync(join(dir, 'run.yaml'), redactText(pack.runYaml, secrets));
  if (pack.failureYaml) writeFileSync(join(dir, 'failure.yaml'), redactText(pack.failureYaml, secrets));

  const out: ExportResult['tests'] = [];
  const used = new Set<string>();
  for (const t of pack.tests.values()) {
    const member = matchMember(t, opts.members ?? []);
    let label = (member && scenarioLabel(member.path)) || scenarioLabel(String(t.result?.path ?? t.result?.name ?? '')) || t.id;
    if (used.has(label)) label = `${label}-${t.id}`;
    used.add(label);
    const tdir = join(dir, label);
    mkdirSync(tdir, { recursive: true });
    if (t.resultText) writeFileSync(join(tdir, 'result.yaml'), redactText(t.resultText, secrets));

    const fstep = failedStep(t);
    let screenshot: string | undefined;
    for (const [n, s] of [...t.steps].sort((a, b) => a[0] - b[0])) {
      if (s.failureText) writeFileSync(join(tdir, `${n}-failure.yaml`), redactText(s.failureText, secrets));
      if (s.screenshot) {
        const p = join(tdir, `${n}-screenshot.${s.screenshotExt ?? 'png'}`);
        writeFileSync(p, s.screenshot);
        if (fstep === undefined || n === fstep) screenshot = relative(opts.root, p);
      }
    }
    const f = fstep !== undefined ? t.steps.get(fstep)?.failure : undefined;
    const rec: ExportResult['tests'][number] = {
      test_id: t.id,
      name: member ? basename(member.path).replace(/_test\.md$/, '') : undefined,
      member_path: member?.path,
      status: testStatus(t),
      screenshot,
    };
    const assertion = assertionBeforeRca(t, member, opts.executionId);
    if (assertion) rec.assertion_before_rca = assertion;
    if (fstep !== undefined) rec.failed_step = fstep;
    if (f !== undefined || (fstep !== undefined && t.steps.get(fstep)?.failureText)) {
      rec.failure = {
        error: redactText(str(f?.error?.message ?? f?.error) ?? '', secrets) || undefined,
        expected: str(f?.expected ?? f?.error?.expected),
        actual: str(f?.actual ?? f?.error?.actual ?? f?.page_state?.summary),
      };
    }
    out.push(rec);
  }
  return { dir, tests: out };
}

/** Test-step headings (## …) and bodies from a _test.md, for verdict step lookup. */
export function parseTestSteps(md: string): string[] {
  const body = md.replace(/^---\n[\s\S]*?\n---\n?/, '');
  const parts = body.split(/^## /m).slice(1);
  return parts.map((p) => p.replace(/```yaml[\s\S]*?```/g, '').replace(/\s+/g, ' ').trim());
}
