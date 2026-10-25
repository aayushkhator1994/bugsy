import { z } from 'zod';
import { CheckKindSchema, type MustCheckKind, type Scenario } from '../types.ts';

/** Stable scenario id the prompt asks for, per must_check kind. */
export const KIND_SCENARIO_ID: Record<MustCheckKind, string> = {
  read_by_url: 'S2_other_reads_by_url',
  list: 'S3_list_isolation',
  signed_out: 'S4_signed_out_back_button',
  change: 'S5_other_marks_paid',
};
export const CONTROL_ID = 'S1_owner_reads_own';

export const ScenarioZ = z.object({
  id: z.string().min(1),
  kind: z.enum(['control', 'leak_check']),
  control_id: z.string().nullable().optional(),
  title: z.string().min(1),
  requirement: z.string().min(1),
  steps: z.array(z.string().min(1)).min(1),
  expected: z.array(z.string().min(1)).min(1),
  checks: z.array(CheckKindSchema),
});
export const ScenariosOutZ = z.object({ scenarios: z.array(ScenarioZ).min(1) });

const REQUIRED_IDS = ['S1_owner_reads_own', 'S2_other_reads_by_url', 'S3_list_isolation'];

export interface Coverage {
  ok: boolean;
  must_check: MustCheckKind[];
  /** kind -> ids of leak_checks whose `checks` include it */
  covered_by: Partial<Record<MustCheckKind, string[]>>;
  missing: MustCheckKind[];
  /** leak_checks whose control_id is absent or names no existing control scenario */
  bad_controls: string[];
}

/** The plan decision, in code: every must_check kind covered by >=1 leak_check; every leak_check names an existing control. */
export function checkCoverage(scenarios: Scenario[], mustCheck: MustCheckKind[]): Coverage {
  const controls = new Set(scenarios.filter((s) => s.kind === 'control').map((s) => s.id));
  const leaks = scenarios.filter((s) => s.kind === 'leak_check');
  const covered_by: Coverage['covered_by'] = {};
  const missing: MustCheckKind[] = [];
  for (const k of mustCheck) {
    const ids = leaks.filter((s) => s.checks?.includes(k)).map((s) => s.id);
    if (ids.length) covered_by[k] = ids;
    else missing.push(k);
  }
  const bad_controls = leaks.filter((s) => !s.control_id || !controls.has(s.control_id)).map((s) => s.id);
  return { ok: !missing.length && !bad_controls.length, must_check: mustCheck, covered_by, missing, bad_controls };
}

/** Exact, model-facing description of what a failed coverage check lacks. */
export function coverageProblem(c: Coverage): string {
  const parts: string[] = [];
  if (c.missing.length)
    parts.push(`missing required checks: ${c.missing.map((k) => `${k} (add leak_check ${KIND_SCENARIO_ID[k]} with checks ["${k}"])`).join(', ')}`);
  if (c.bad_controls.length) parts.push(`leak_checks without an existing control scenario: ${c.bad_controls.join(', ')}`);
  return parts.join('; ');
}

export class CoverageError extends Error {
  constructor(readonly coverage: Coverage) {
    super(`Plan check failed: ${coverageProblem(coverage)}`);
  }
}

/** Parse + validate model output text. Throws on any violation (caller retries once). */
export function parseScenarios(text: string, mustCheck: MustCheckKind[] = []): Scenario[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error('Model output is not valid JSON');
  }
  const parsed = ScenariosOutZ.parse(raw);
  const scenarios: Scenario[] = parsed.scenarios.map((s) => {
    const { control_id, ...rest } = s;
    return control_id ? { ...rest, control_id } : rest;
  });
  const ids = new Set(scenarios.map((s) => s.id));
  for (const id of REQUIRED_IDS) if (!ids.has(id)) throw new Error(`Missing required scenario ${id}`);
  for (const s of scenarios) {
    if (s.kind === 'leak_check') {
      if (!s.control_id) throw new Error(`${s.id} is a leak_check without control_id`);
      if (!ids.has(s.control_id)) throw new Error(`${s.id} names unknown control ${s.control_id}`);
    }
  }
  const cov = checkCoverage(scenarios, mustCheck);
  if (!cov.ok) throw new CoverageError(cov);
  return scenarios;
}

// Strict mode: every property required, no extras; optional control_id is nullable.
export const SCENARIOS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['scenarios'],
  properties: {
    scenarios: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'kind', 'control_id', 'title', 'requirement', 'steps', 'expected', 'checks'],
        properties: {
          id: { type: 'string' },
          kind: { type: 'string', enum: ['control', 'leak_check'] },
          control_id: { type: ['string', 'null'] },
          title: { type: 'string' },
          requirement: { type: 'string' },
          steps: { type: 'array', items: { type: 'string' } },
          expected: { type: 'array', items: { type: 'string' } },
          checks: { type: 'array', items: { type: 'string', enum: ['control', 'read_by_url', 'list', 'change', 'signed_out'] } },
        },
      },
    },
  },
} as const;

export const PatchOutZ = z.object({ diff: z.string().min(1), rationale: z.string() });
export const PATCH_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['diff', 'rationale'],
  properties: { diff: { type: 'string' }, rationale: { type: 'string' } },
} as const;
