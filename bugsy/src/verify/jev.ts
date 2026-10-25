// Independent plan verifier: TypeSafe's Jev judges what each leak_check actually tests.
// Jev makes the small judgments (one Noul per must_check kind per scenario); code below decides.
// All question wording and thresholds live in this module. The result is advisory: only the
// code coverage check (openai/schema.ts checkCoverage) blocks a scan.
import { noul, TypeSafeClient } from '@typesafe-ai/sdk';
import type { MustCheckKind, Scenario } from '../types.ts';
import type { Coverage } from '../openai/schema.ts';
import { logCall } from '../openai/log.ts';

// ---------- wording + thresholds (audit/edit here) ----------

export const VERIFIED_AT = 0.8;
export const MISMATCH_BELOW = 0.5;

export const QUESTIONS: Record<MustCheckKind, string> = {
  read_by_url:
    "Does `scenario` test that a signed-in user cannot view another user's invoice by opening that invoice's URL directly?",
  list: "Does `scenario` test that a signed-in user's invoice list does not show invoices owned by another user?",
  change: "Does `scenario` test that a signed-in user cannot change another user's invoice?",
  signed_out:
    'Does `scenario` test that after signing out, pressing the browser Back button does not show a page from the account?',
};

// ---------- types ----------

/** The slice of the SDK client used here, so tests can pass a mock. */
export interface JevClient {
  systemOne(req: { state: Record<string, unknown>; questions: Record<string, ReturnType<typeof noul>> }): Promise<{
    model?: string;
    answers: Record<string, { noul: number }>;
    usage?: unknown;
  }>;
}

/** scenario id -> kind -> Jev probability that the scenario tests that kind */
export type JevScores = Record<string, Partial<Record<MustCheckKind, number>>>;

export interface JevKindResult {
  verified: boolean;
  best: { scenario: string; score: number } | null;
}

export interface JevMismatch {
  scenario: string;
  kind: MustCheckKind;
  score: number;
}

export type JevResult =
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string }
  | { status: 'ok'; model?: string; kinds: Partial<Record<MustCheckKind, JevKindResult>>; mismatches: JevMismatch[]; scores: JevScores };

// ---------- decision (pure, in code) ----------

export function decideJev(scenarios: Scenario[], mustCheck: MustCheckKind[], scores: JevScores): Omit<Extract<JevResult, { status: 'ok' }>, 'status' | 'model'> {
  const leaks = scenarios.filter((s) => s.kind === 'leak_check');
  const kinds: Partial<Record<MustCheckKind, JevKindResult>> = {};
  for (const k of mustCheck) {
    let best: JevKindResult['best'] = null;
    for (const s of leaks) {
      const v = scores[s.id]?.[k];
      if (typeof v === 'number' && (!best || v > best.score)) best = { scenario: s.id, score: v };
    }
    kinds[k] = { verified: !!best && best.score >= VERIFIED_AT, best };
  }
  const mismatches: JevMismatch[] = [];
  for (const s of leaks)
    for (const k of mustCheck) {
      const v = scores[s.id]?.[k];
      if (s.checks?.includes(k) && typeof v === 'number' && v < MISMATCH_BELOW) mismatches.push({ scenario: s.id, kind: k, score: v });
    }
  return { kinds, mismatches, scores };
}

// ---------- calls ----------

export async function runJev(
  rule: string,
  scenarios: Scenario[],
  mustCheck: MustCheckKind[],
  opts: { client?: JevClient; apiKey?: string | undefined; log?: boolean } = {},
): Promise<JevResult> {
  const apiKey = opts.apiKey !== undefined ? opts.apiKey : process.env.TYPESAFE_API_KEY;
  if (!opts.client && !apiKey) return { status: 'skipped', reason: 'TYPESAFE_API_KEY not set' };
  const client: JevClient = opts.client ?? (new TypeSafeClient({ apiKey }) as unknown as JevClient);
  const scores: JevScores = {};
  let model: string | undefined;
  try {
    for (const s of scenarios.filter((x) => x.kind === 'leak_check')) {
      const state = { rule, scenario: { id: s.id, title: s.title, requirement: s.requirement, steps: s.steps, expected: s.expected } };
      const questions = Object.fromEntries(mustCheck.map((k) => [k, noul(QUESTIONS[k])]));
      const res = await client.systemOne({ state, questions });
      if (opts.log !== false) logCall('jev', { model: res.model ?? 'jev', input: { state, questions }, output: res.answers, usage: res.usage ?? null });
      model ??= res.model;
      scores[s.id] = {};
      for (const k of mustCheck) {
        const v = res.answers?.[k]?.noul;
        if (typeof v !== 'number' || Number.isNaN(v)) throw new Error(`no Noul answer for ${k} on ${s.id}`);
        scores[s.id]![k] = v;
      }
    }
  } catch (e) {
    return { status: 'failed', reason: (e as Error).message ?? String(e) };
  }
  return { status: 'ok', model, ...decideJev(scenarios, mustCheck, scores) };
}

// ---------- output ----------

export interface PlanCheck {
  must_check: MustCheckKind[];
  covered_by: Coverage['covered_by'];
  jev: JevResult;
}

const short = (id: string) => id.split('_')[0];

/** "Plan check ▸ read_by_url S2 ✔ (Jev 0.97) · list S3 ✔ (0.95) · …" plus a Jev notice line when needed. */
export function formatPlanCheck(p: PlanCheck): string[] {
  let first = true;
  const parts = p.must_check.map((k) => {
    const ids = p.covered_by[k] ?? [];
    const head = `${k} ${ids.map(short).join('+') || '—'} ${ids.length ? '✔' : '✘'}`;
    if (p.jev.status !== 'ok') return head;
    const r = p.jev.kinds[k];
    const score = r?.best ? r.best.score.toFixed(2) : 'n/a';
    const label = first ? `Jev ${score}` : score;
    first = false;
    return `${head} (${label}${r?.verified ? '' : ' ? not verified'})`;
  });
  const lines = [`Plan check ▸ ${parts.join(' · ')}`];
  if (p.jev.status === 'skipped') lines.push(`  Jev check skipped: ${p.jev.reason}`);
  else if (p.jev.status === 'failed') lines.push(`  Jev check failed: ${p.jev.reason} (advisory; not counted as a pass)`);
  else for (const m of p.jev.mismatches) lines.push(`  Jev mismatch: ${m.scenario} declares ${m.kind} but Jev scores ${m.score.toFixed(2)}`);
  return lines;
}
