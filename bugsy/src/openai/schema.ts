import { z } from 'zod';
import type { Scenario } from '../types.ts';

export const ScenarioZ = z.object({
  id: z.string().min(1),
  kind: z.enum(['control', 'leak_check']),
  control_id: z.string().nullable().optional(),
  title: z.string().min(1),
  requirement: z.string().min(1),
  steps: z.array(z.string().min(1)).min(1),
  expected: z.array(z.string().min(1)).min(1),
});
export const ScenariosOutZ = z.object({ scenarios: z.array(ScenarioZ).min(1) });

const REQUIRED_IDS = ['S1_owner_reads_own', 'S2_other_reads_by_url', 'S3_list_isolation'];

/** Parse + validate model output text. Throws on any violation (caller retries once). */
export function parseScenarios(text: string): Scenario[] {
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
        required: ['id', 'kind', 'control_id', 'title', 'requirement', 'steps', 'expected'],
        properties: {
          id: { type: 'string' },
          kind: { type: 'string', enum: ['control', 'leak_check'] },
          control_id: { type: ['string', 'null'] },
          title: { type: 'string' },
          requirement: { type: 'string' },
          steps: { type: 'array', items: { type: 'string' } },
          expected: { type: 'array', items: { type: 'string' } },
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
