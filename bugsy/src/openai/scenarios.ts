import OpenAI from 'openai';
import type { BugsyConfig, Scenario } from '../types.ts';
import { buildScenarioInput, SCENARIO_SYSTEM } from './prompts.ts';
import { parseScenarios, SCENARIOS_JSON_SCHEMA } from './schema.ts';
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
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const retryNote =
      attempt === 0
        ? ''
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
      return parseScenarios(text);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Scenario generation failed schema validation twice: ${(lastErr as Error).message}`);
}
