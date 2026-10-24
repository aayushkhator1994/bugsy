import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import type { KaneFailure, Scenario } from '../types.ts';
import { buildPatchPrompt } from './prompts.ts';
import { extractDiff } from './diff.ts';
import { PATCH_JSON_SCHEMA, PatchOutZ } from './schema.ts';
import { logCall } from './log.ts';
import { registerSecrets } from './redact.ts';
import { requireModel } from './scenarios.ts';

export interface ProposePatchInput {
  scenario: Scenario;
  failure: KaneFailure;
  screenshotPath?: string;
  sourceFiles: { path: string; content: string }[];
  patcher: 'codex' | 'api';
}
export interface ProposePatchResult { diff: string; rationale: string; patcher: string }

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, '..', '..', '..');
export const CODEX_TIMEOUT_MS = 120_000;

function loadSecretsFromConfig(): void {
  try {
    const cfg = JSON.parse(readFileSync(join(REPO_ROOT, 'bugsy.config.json'), 'utf8'));
    registerSecrets(Object.values<{ password?: string }>(cfg.accounts ?? {}).map((a) => a.password ?? ''));
  } catch { /* config optional here */ }
}

/** The exact argv passed to `codex` (prompt is sent on stdin via "-"). */
export function codexArgs(outFile: string, screenshotPath?: string): string[] {
  const args = ['exec', '-C', REPO_ROOT, '-s', 'read-only', '--ephemeral', '--skip-git-repo-check', '--color', 'never', '-o', outFile];
  if (screenshotPath && existsSync(screenshotPath)) args.push('-i', screenshotPath);
  args.push('-');
  return args;
}

function runCodex(prompt: string, screenshotPath?: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'bugsy-codex-'));
  const outFile = join(dir, 'last.txt');
  return new Promise((resolveP, reject) => {
    const child = spawn('codex', codexArgs(outFile, screenshotPath), { cwd: REPO_ROOT, stdio: ['pipe', 'ignore', 'ignore'] });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`codex exec timed out after ${CODEX_TIMEOUT_MS / 1000}s`)); }, CODEX_TIMEOUT_MS);
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        if (!existsSync(outFile)) throw new Error(`codex exec exited ${code} without a final message`);
        resolveP(readFileSync(outFile, 'utf8'));
      } catch (e) { reject(e); } finally { rmSync(dir, { recursive: true, force: true }); }
    });
    child.stdin.end(prompt);
  });
}

export async function proposePatch(input: ProposePatchInput): Promise<ProposePatchResult> {
  loadSecretsFromConfig();
  if (input.patcher === 'api') {
    const model = requireModel();
    const client = new OpenAI();
    const prompt = buildPatchPrompt(input, { forApi: true });
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await client.responses.create({
        model,
        input: prompt,
        text: { format: { type: 'json_schema', name: 'authz_patch', strict: true, schema: PATCH_JSON_SCHEMA as unknown as Record<string, unknown> } },
      });
      const text = res.output_text ?? '';
      logCall('patch-api', { model, input: prompt, output: text, usage: res.usage });
      try {
        const out = PatchOutZ.parse(JSON.parse(text));
        return { diff: extractDiff('```diff\n' + out.diff.replace(/^```\w*\n|```\s*$/g, '') + '\n```'), rationale: out.rationale, patcher: 'api' };
      } catch (e) { lastErr = e; }
    }
    throw new Error(`api patcher returned an unusable diff twice: ${(lastErr as Error).message}`);
  }

  const prompt = buildPatchPrompt(input);
  const started = Date.now();
  const last = await runCodex(prompt, input.screenshotPath);
  logCall('patch-codex', { model: 'codex', input: prompt, output: last, usage: { elapsed_ms: Date.now() - started } });
  return { diff: extractDiff(last), rationale: 'Proposed by codex exec', patcher: 'codex' };
}
