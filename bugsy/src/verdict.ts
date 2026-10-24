// BUGSY_SPEC.md §7: per-scenario verdicts from Kane's member outcomes. Pure; never reads the exit code.
import { basename } from 'node:path';
import type { KaneMember, Scenario, ScenarioOutcome, Verdict } from './types.ts';

export interface VerdictInput {
  scenarios: Scenario[];
  members: KaneMember[];
  /** the run's evidence pack was found and read */
  packPresent: boolean;
  /** per scenario id: the step texts of its _test.md (## headings + body), for locating the failed step */
  steps?: Record<string, string[]>;
  /** per scenario id: failed step / screenshot from the evidence export, to enrich the outcome */
  evidence?: Record<string, { failed_step?: number; screenshot?: string; error?: string }>;
}

const SIGN_IN_RE = /\b(sign|log)\s*-?\s*in\b|\bcredentials?\b|\bpassword\b/i;

/** Quoted strings in the scenario's expected lines: the texts the denial assertion looks for. */
export function denialMarkers(s: Scenario): string[] {
  const out = new Set<string>();
  const re = /["'‘’“”]([^"'‘’“”]{2,})["'‘’“”]/g;
  for (const line of s.expected) for (const m of line.matchAll(re)) out.add(m[1]!.trim());
  return [...out];
}

function stem(p: string): string {
  return basename(p).replace(/_test\.md$/i, '');
}

function label(id: string): string | undefined {
  return /^(S\d+)/i.exec(id)?.[1]?.toUpperCase();
}

/** Member for a scenario: exact file stem, else the same S<n> prefix. */
export function memberFor(s: Scenario, members: KaneMember[]): KaneMember | undefined {
  const exact = members.find((m) => stem(m.path).toLowerCase() === s.id.toLowerCase());
  if (exact) return exact;
  const l = label(s.id);
  return l ? members.find((m) => label(stem(m.path)) === l) : undefined;
}

function includesAny(text: string | undefined, needles: string[]): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  return needles.some((n) => t.includes(n.toLowerCase()));
}

/** Decide one leak check. Exported for tests. */
export function judgeLeak(
  s: Scenario,
  leak: KaneMember | undefined,
  control: KaneMember | undefined,
  ctx: { packPresent: boolean; anyBroken: boolean; steps?: string[] },
): { verdict: Verdict; reason: string } {
  const inc = (reason: string) => ({ verdict: 'inconclusive' as const, reason });
  if (!ctx.packPresent) return inc('evidence pack missing');
  if (!leak) return inc(`no Kane result for ${s.id}`);
  if (!s.control_id) return inc('leak check has no paired control');
  if (!control) return inc(`control ${s.control_id} did not run`);
  if (ctx.anyBroken) return inc('a member was broken or interrupted');
  if (control.status !== 'passed') return inc(`control ${s.control_id} ${control.status}`);
  if (leak.status === 'passed') return { verdict: 'denied_as_expected', reason: 'denied, and the owner control passed' };
  if (leak.status !== 'failed') return inc(`${s.id} ${leak.status}`);

  const idx = leak.failure?.step_index;
  if (idx === undefined) return inc('failure has no step index');
  if (idx < 1) return inc('failed at step 0');

  const msg = leak.failure?.message;
  // step_index base is not pinned down by the docs: look at the indexed step and its predecessor.
  const steps = ctx.steps;
  const cands = steps ? [steps[idx], steps[idx - 1]].filter((x): x is string => !!x) : [];
  let markers: string[];
  let atDenial: boolean;
  if (steps && steps.length) {
    // the denial is asserted after the last sign-in (the other user's session)
    const lastSignIn = steps.reduce((acc, t, i) => (SIGN_IN_RE.test(t) ? i : acc), -1);
    markers = denialMarkers(s);
    atDenial = idx > lastSignIn && (includesAny(msg, markers) || cands.some((c) => includesAny(c, markers)));
  } else {
    // no step texts: only the primary denial assertion (first expected line) anchors the failure
    markers = denialMarkers({ ...s, expected: s.expected.slice(0, 1) });
    atDenial = includesAny(msg, markers);
  }

  const signInStep = cands.length
    ? cands.every((c) => SIGN_IN_RE.test(c)) && !atDenial
    : SIGN_IN_RE.test(msg ?? '') && !atDenial;
  if (signInStep) return inc('sign-in step failed');

  if (markers.length === 0) {
    // no quoted denial text to anchor on: accept a failure that is not on a sign-in step
    return { verdict: 'leak_confirmed', reason: `failed at step ${idx}; control passed` };
  }
  if (!atDenial) return inc(`failed at step ${idx}, not at the denial step`);
  return { verdict: 'leak_confirmed', reason: `failed at step ${idx} (denial); control passed` };
}

export function evaluate(input: VerdictInput): ScenarioOutcome[] {
  const anyBroken = input.members.some((m) => m.status === 'broken' || m.status === 'interrupted');
  const byId = new Map(input.scenarios.map((s) => [s.id, s]));
  return input.scenarios.map((s) => {
    const m = memberFor(s, input.members);
    const ev = input.evidence?.[s.id];
    const base: ScenarioOutcome = {
      scenario: s.id,
      kind: s.kind,
      status: m?.status ?? 'missing',
      verdict: 'inconclusive',
      reason: '',
    };
    const step = m?.failure?.step_index ?? ev?.failed_step;
    if (step !== undefined && m?.status !== 'passed') base.failed_step = step;
    // prefer the pack's expected/saw detail; fall back to the stream's failure message
    if (m && m.status !== 'passed') {
      const msg = ev?.error || m.failure?.message;
      if (msg) base.failure_message = msg;
    }
    if (ev?.screenshot && m?.status !== 'passed') base.screenshot = ev.screenshot;

    if (s.kind === 'control') {
      const ok = input.packPresent && m?.status === 'passed';
      return { ...base, verdict: ok ? 'control_passed' : 'control_failed', reason: m ? m.status : 'did not run' };
    }
    const control = s.control_id ? memberFor(byId.get(s.control_id) ?? ({ id: s.control_id } as Scenario), input.members) : undefined;
    const { verdict, reason } = judgeLeak(s, m, control, {
      packPresent: input.packPresent,
      anyBroken,
      steps: input.steps?.[s.id],
    });
    return { ...base, verdict, reason };
  });
}

/** §7: patch may commit only if every leak check is denied_as_expected and every control passed. */
export function patchMayCommit(outcomes: ScenarioOutcome[]): boolean {
  const leaks = outcomes.filter((o) => o.kind === 'leak_check');
  const controls = outcomes.filter((o) => o.kind === 'control');
  return (
    leaks.length > 0 &&
    controls.length > 0 &&
    leaks.every((o) => o.verdict === 'denied_as_expected') &&
    controls.every((o) => o.verdict === 'control_passed')
  );
}

/** §7: self-check passes when the target leak check is leak_confirmed on the reverted app. */
export function selfCheckPassed(outcomes: ScenarioOutcome[], scenarioId: string): boolean {
  return outcomes.find((o) => o.scenario === scenarioId)?.verdict === 'leak_confirmed';
}
