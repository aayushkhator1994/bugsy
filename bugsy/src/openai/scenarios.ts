import OpenAI from 'openai';
import type { BugsyConfig, Scenario } from '../types.ts';
import { buildScenarioInput, buildScenarioSystem } from './prompts.ts';
import { CoverageError, coverageProblem, parseScenarios, SCENARIOS_JSON_SCHEMA } from './schema.ts';
import { BugsyError } from '../config.ts';
import { logCall } from './log.ts';
import { registerSecrets } from './redact.ts';

export function requireModel(): string {
  const m = process.env.OPENAI_MODEL;
  if (!m) throw new Error('OPENAI_MODEL is not set (put it in .env)');
  return m;
}

export async function generateScenarios(config: BugsyConfig): Promise<Scenario[]> {
  registerSecrets(Object.values(config.accounts).map((a) => a.password));
  const model = requireModel();
  const client = new OpenAI(); // reads OPENAI_API_KEY from the environment itself
  const input = buildScenarioInput(config);
  const mustCheck = config.must_check;
  const SCENARIO_SYSTEM = buildScenarioSystem(mustCheck);
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const retryNote =
      attempt === 0
        ? ''
        : lastErr instanceof CoverageError
          ? `\n\nYour previous answer was rejected because the plan does not cover every required check: ${coverageProblem(lastErr.coverage)}. Produce one leak_check per required check (${mustCheck.join(', ')}), each naming control S1_owner_reads_own.`
          : `\n\nYour previous answer was rejected: ${String((lastErr as Error)?.message ?? lastErr).slice(0, 600)}. Follow the rules exactly.`;
    const res = await client.responses.create({
      model,
      instructions: SCENARIO_SYSTEM,
      input: input + retryNote,
      text: {
        format: { type: 'json_schema', name: 'authz_scenarios', strict: true, schema: SCENARIOS_JSON_SCHEMA as unknown as Record<string, unknown> },
      },
    });
    const text = res.output_text ?? '';
    logCall('scenarios', { model, input: { instructions: SCENARIO_SYSTEM, input: input + retryNote }, output: text, usage: res.usage });
    try {
      return parseScenarios(text, mustCheck);
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr instanceof CoverageError) throw new BugsyError(`Scenario plan still incomplete after one retry: ${coverageProblem(lastErr.coverage)}`);
  throw new BugsyError(`Scenario generation failed schema validation twice: ${(lastErr as Error).message}`);
}
