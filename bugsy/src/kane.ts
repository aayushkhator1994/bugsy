// Kane CLI adapter: `testrun run` (optionally through `kanehack report`) with NDJSON parsing,
// plus the assurance flow (context ingest → review → design tests) with pause handling.
// Interprets nothing: verdicts live in verdict.ts.
import { execa } from 'execa';
import { existsSync, mkdirSync, createWriteStream, readdirSync, statSync, type WriteStream } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import type { KaneMember, KaneRunResult, MemberStatus } from './types.ts';

export const KANE_BIN = process.env.BUGSY_KANE_BIN || 'kane-cli';
const KANE_ENV = { KANE_CLI_USER_AGENT: 'bugsy' };

// ---------------------------------------------------------------- NDJSON parsing

/** Parse one stdout line. Returns null for blank / non-JSON / non-object lines. */
export function parseLine(line: string): Record<string, any> | null {
  const t = line.trim();
  if (!t.startsWith('{')) return null;
  try {
    const v = JSON.parse(t);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export interface TestrunState {
  execution_id: string | null;
  members: KaneMember[];
  overall_status?: string;
  totals?: Record<string, number>;
  done: boolean;
  plan_invalid?: { path: string; failure?: string }[];
  errors: string[];
  unknown_types: Set<string>;
}

export function newTestrunState(): TestrunState {
  return { execution_id: null, members: [], done: false, errors: [], unknown_types: new Set() };
}

const STATUSES: MemberStatus[] = ['passed', 'failed', 'broken', 'interrupted'];

/** Fold one parsed event into the state. Unknown event types are tolerated (recorded, ignored). */
export function applyTestrunEvent(state: TestrunState, ev: Record<string, any>): void {
  switch (ev.type) {
    case 'testrun_start':
      if (typeof ev.execution_id === 'string') state.execution_id ??= ev.execution_id;
      return;
    case 'testrun_plan':
      if (ev.valid === false) {
        state.plan_invalid = (ev.members ?? [])
          .filter((m: any) => m?.failure)
          .map((m: any) => ({ path: String(m.path), failure: String(m.failure) }));
      }
      return;
    case 'testrun_member_end':
    case 'testrun_authored_member_end': {
      const status = STATUSES.includes(ev.status) ? (ev.status as MemberStatus) : 'broken';
      const m: KaneMember = { path: String(ev.path ?? ''), status };
      if (ev.test_id) m.test_id = String(ev.test_id);
      if (typeof ev.duration_s === 'number') m.duration_s = ev.duration_s;
      if (ev.log_path) m.log_path = String(ev.log_path);
      if (ev.failure && typeof ev.failure === 'object') {
        m.failure = { message: String(ev.failure.message ?? '') };
        if (Number.isInteger(ev.failure.step_index)) m.failure.step_index = ev.failure.step_index;
      }
      if (ev.type === 'testrun_authored_member_end') m.authored = true;
      // A test may appear twice (replay then author pass): the later event wins, matched by file name.
      const key = basename(m.path);
      const i = state.members.findIndex((x) => basename(x.path) === key);
      if (i >= 0) state.members[i] = m;
      else state.members.push(m);
      return;
    }
    case 'testrun_summary':
      if (ev.execution?.id) state.execution_id = String(ev.execution.id);
      if (ev.totals && typeof ev.totals === 'object') state.totals = ev.totals;
      return;
    case 'testrun_done':
      state.done = true;
      if (ev.execution_id && !state.execution_id) state.execution_id = String(ev.execution_id);
      if (ev.overall_status) state.overall_status = String(ev.overall_status);
      return;
    case 'error':
      state.errors.push(String(ev.message ?? ev.code ?? 'error'));
      return;
    default:
      if (typeof ev.type === 'string') state.unknown_types.add(ev.type);
  }
}

/** Parse a whole captured stdout (used by tests and for re-reading saved logs). */
export function parseTestrunOutput(text: string): TestrunState {
  const st = newTestrunState();
  for (const line of text.split('\n')) {
    const ev = parseLine(line);
    if (ev) applyTestrunEvent(st, ev);
  }
  return st;
}

// ---------------------------------------------------------------- command building

export interface TestrunOptions {
  testsDir: string;
  phase: string; // scan | patch | self-check
  sha: string; // full or short sha
  match?: string;
  label?: string; // objective for kanehack
  report: boolean; // wrap with kanehack report
}

export function testrunArgs(o: TestrunOptions): string[] {
  const args = [
    'testrun', 'run', o.testsDir,
    '--parallel', '1',
    '--no-adaptive-heal',
    '--bug-detection', 'off',
    '--agent',
    '--name', `bugsy:${o.phase}:${o.sha.slice(0, 7)}`,
  ];
  if (o.match) args.push('--match', o.match);
  return args;
}

export async function onPath(bin: string): Promise<boolean> {
  const r = await execa('sh', ['-c', `command -v ${bin}`], { reject: false });
  return r.exitCode === 0 && r.stdout.trim().length > 0;
}

/** [file, args] for the run, wrapped as `kanehack report --objective … -- kane-cli …` when asked. */
export async function buildCommand(o: TestrunOptions): Promise<{ file: string; args: string[]; wrapped: boolean }> {
  const kane = testrunArgs(o);
  if (o.report && (await onPath('kanehack'))) {
    const label = o.label ?? `bugsy:${o.phase}`;
    const pre = ['report', '--objective', label];
    if (/^[0-9a-f]{7,40}$/.test(o.sha)) pre.push('--commit', o.sha);
    return { file: 'kanehack', args: [...pre, '--', KANE_BIN, ...kane], wrapped: true };
  }
  return { file: KANE_BIN, args: kane, wrapped: false };
}

export function packPath(cwd: string, executionId: string | null): string | null {
  if (!executionId) return null;
  const p = resolve(cwd, '.testmuai/evidence', `${executionId}.evidence`);
  return existsSync(p) ? p : null;
}

// ---------------------------------------------------------------- streaming runner

export interface StreamOptions {
  cwd: string;
  /** called for every parsed JSON event, for live narration */
  onEvent?: (ev: Record<string, any>) => void;
  /** raw stdout copy (useful to capture real fixtures) */
  rawLog?: string;
}

async function streamNdjson(
  file: string,
  args: string[],
  opts: StreamOptions,
  handle: (ev: Record<string, any>) => void,
): Promise<number> {
  let raw: WriteStream | undefined;
  if (opts.rawLog) {
    mkdirSync(resolve(opts.rawLog, '..'), { recursive: true });
    raw = createWriteStream(opts.rawLog);
  }
  const child = execa(file, args, {
    cwd: opts.cwd,
    stdin: { file: '/dev/null' },
    stderr: 'pipe',
    env: { ...process.env, ...KANE_ENV },
    reject: false,
    buffer: false,
    lines: false,
  });
  child.stderr?.on('data', () => {
    /* progress UI and the evidence hint live on stderr; not parsed */
  });
  let buf = '';
  const onLine = (line: string) => {
    raw?.write(line + '\n');
    const ev = parseLine(line);
    if (!ev) return;
    handle(ev);
    opts.onEvent?.(ev);
  };
  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data', (chunk: string) => {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      onLine(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  });
  const res = await child;
  if (buf) onLine(buf);
  raw?.end();
  if (res.failed && res.exitCode === undefined) {
    throw new Error(`could not start ${file}: ${res.shortMessage ?? res.message}`);
  }
  return res.exitCode ?? 1;
}

export async function runTestrun(o: TestrunOptions, s: StreamOptions): Promise<KaneRunResult & { state: TestrunState; wrapped: boolean }> {
  const { file, args, wrapped } = await buildCommand(o);
  const state = newTestrunState();
  const exit = await streamNdjson(file, args, s, (ev) => applyTestrunEvent(state, ev));
  return {
    execution_id: state.execution_id,
    members: state.members,
    exit_code: exit,
    pack_path: packPath(s.cwd, state.execution_id),
    overall_status: state.overall_status,
    totals: state.totals,
    state,
    wrapped,
  };
}

// ---------------------------------------------------------------- assurance flow

export interface AssuranceResult {
  exit_code: number;
  events: Record<string, any>[];
  done?: Record<string, any>;
  paused?: { sid: string; resume?: string; pending_questions?: any[] };
  minted: { cid?: string; logical_id?: string }[];
  errors: string[];
}

export function foldAssurance(events: Record<string, any>[], exit_code: number): AssuranceResult {
  const r: AssuranceResult = { exit_code, events, minted: [], errors: [] };
  for (const ev of events) {
    if (ev.type === 'done') r.done = ev;
    else if (ev.type === 'session_paused') r.paused = { sid: String(ev.sid), resume: ev.resume, pending_questions: ev.pending_questions };
    else if (ev.type === 'commit' && Array.isArray(ev.minted)) r.minted.push(...ev.minted);
    else if (ev.type === 'error' || ev.type === 'gate_refused') r.errors.push(String(ev.message ?? ev.code ?? ev.type));
  }
  return r;
}

export async function runAssurance(args: string[], s: StreamOptions): Promise<AssuranceResult> {
  const events: Record<string, any>[] = [];
  const exit = await streamNdjson(KANE_BIN, args, s, (ev) => events.push(ev));
  return foldAssurance(events, exit);
}

/** Minimal shell-words split for the verbatim `resume` command kane prints. */
export function shellSplit(cmd: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q: '"' | "'" | null = null;
  let has = false;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i]!;
    if (q) {
      if (c === q) q = null;
      else if (c === '\\' && q === '"' && i + 1 < cmd.length) cur += cmd[++i];
      else cur += c;
    } else if (c === '"' || c === "'") {
      q = c;
      has = true;
    } else if (/\s/.test(c)) {
      if (has || cur) out.push(cur);
      cur = '';
      has = false;
    } else {
      cur += c;
      has = true;
    }
  }
  if (has || cur) out.push(cur);
  return out;
}

/** argv (without the kane-cli binary) that resumes a paused session with a plain-words message. */
export function resumeArgs(paused: { sid: string; resume?: string }, fallback: string[], message: string): string[] {
  let args = paused.resume ? shellSplit(paused.resume) : [...fallback, '--resume', paused.sid, '--mode', 'agent'];
  if (args[0] && /(^|\/)kane-cli$/.test(args[0])) args = args.slice(1);
  if (!args.includes('--mode')) args.push('--mode', 'agent');
  return [...args, '--message', message];
}

/** Run an assurance command; on exit 3 resume once with `message`; a second pause returns paused. */
async function withOneResume(
  args: string[],
  resumeVerb: string[],
  message: string | undefined,
  s: StreamOptions,
): Promise<AssuranceResult & { paused_twice: boolean }> {
  const first = await runAssurance(args, s);
  if (first.exit_code !== 3 || !first.paused) return { ...first, paused_twice: false };
  if (!message) return { ...first, paused_twice: true };
  const second = await runAssurance(resumeArgs(first.paused, resumeVerb, message), s);
  const merged = { ...second, minted: [...first.minted, ...second.minted] };
  return { ...merged, paused_twice: second.exit_code === 3 };
}

/** `kane-cli context ingest <file> --mode agent` (lands + extracts). Returns minted use-case ids. */
export async function ingest(file: string, s: StreamOptions, message?: string) {
  const r = await withOneResume(['context', 'ingest', file, '--mode', 'agent'], ['context', 'extract'], message, s);
  const useCases = r.minted
    .map((m) => m.logical_id ?? m.cid)
    .filter((x): x is string => !!x && /^uc[-_]/i.test(x));
  return { ...r, paused: r.paused_twice, pausedSession: r.paused, useCases };
}

/** `kane-cli context review --approve <ids…>` (structured flags; reads its exit code, no `done`). */
export async function reviewApprove(ids: string[], s: StreamOptions) {
  if (!ids.length) return { exit_code: 0, stdout: '' };
  const r = await execa(KANE_BIN, ['context', 'review', '--approve', ...ids, '--json'], {
    cwd: s.cwd,
    stdin: { file: '/dev/null' },
    env: { ...process.env, ...KANE_ENV },
    reject: false,
  });
  return { exit_code: r.exitCode ?? 1, stdout: r.stdout };
}

function listTestFiles(dir: string): Map<string, number> {
  const m = new Map<string, number>();
  if (!existsSync(dir)) return m;
  for (const f of readdirSync(dir)) {
    if (f.endsWith('_test.md')) m.set(join(dir, f), statSync(join(dir, f)).mtimeMs);
  }
  return m;
}

/**
 * `kane-cli design tests --use-case <uc> --mode agent --max <n>`.
 * Exit 3 → resume once with `message` (e.g. the scenario's steps joined); a second pause → { paused: true }.
 * Returns the `_test.md` files the run wrote or changed under .testmuai/tests/.
 */
export async function designTests(useCaseRef: string, s: StreamOptions, opts: { max?: number; message?: string } = {}) {
  const testsDir = resolve(s.cwd, '.testmuai/tests');
  const before = listTestFiles(testsDir);
  const r = await withOneResume(
    ['design', 'tests', '--use-case', useCaseRef, '--mode', 'agent', '--max', String(opts.max ?? 1)],
    ['design', 'tests'],
    opts.message,
    s,
  );
  const after = listTestFiles(testsDir);
  const tests = [...after].filter(([p, t]) => before.get(p) !== t).map(([p]) => p);
  return { ...r, paused: r.paused_twice, tests };
}
