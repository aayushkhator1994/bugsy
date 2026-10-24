// Shared data contracts (BUGSY_SPEC.md §8). Imported by the Kane adapter, verdicts,
// the report and by bugsy/src/openai/ (scenario generation + patching).
import { z } from 'zod';

// ---------- config (bugsy.config.json) ----------

export const AccountSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
  owns: z.array(z.number().int()).optional(),
});
export type Account = z.infer<typeof AccountSchema>;

export const BugsyConfigSchema = z.object({
  app: z.object({
    start: z.string().min(1),
    url: z.string().url(),
    port: z.number().int().positive().optional(),
    health: z.string().default('/health'),
    source_globs: z.array(z.string()).min(1),
  }),
  accounts: z.object({ alice: AccountSchema, bob: AccountSchema }).catchall(AccountSchema),
  ownership_rule: z.string().min(1),
  routes: z.array(z.string()).min(1),
  tests_dir: z.string().default('tests/authz'),
  evidence_export_dir: z.string().default('evidence'),
  kanehack_report: z.boolean().default(true),
});
export type BugsyConfig = z.infer<typeof BugsyConfigSchema>;

// ---------- scenarios (OpenAI output, one per entry) ----------

export const ScenarioKindSchema = z.enum(['control', 'leak_check']);
export type ScenarioKind = z.infer<typeof ScenarioKindSchema>;

export const ScenarioSchema = z.object({
  id: z.string().regex(/^S\d+_[a-z0-9_]+$/i, 'scenario id like S2_other_reads_by_url'),
  kind: ScenarioKindSchema,
  /** For leak checks: the id of the paired owner control. null/absent for controls. */
  control_id: z.string().nullable().optional(),
  title: z.string(),
  requirement: z.string(),
  steps: z.array(z.string()).min(1),
  expected: z.array(z.string()).min(1),
});
export type Scenario = z.infer<typeof ScenarioSchema>;

// ---------- Kane outcomes ----------

export type MemberStatus = 'passed' | 'failed' | 'broken' | 'interrupted';

/** `failure` from testrun_member_end / testrun_authored_member_end. */
export const KaneFailureSchema = z.object({
  message: z.string(),
  step_index: z.number().int().optional(),
});
export type KaneFailure = z.infer<typeof KaneFailureSchema>;

export interface KaneMember {
  path: string;
  test_id?: string;
  status: MemberStatus;
  duration_s?: number;
  log_path?: string;
  failure?: KaneFailure;
  /** true when it came from testrun_authored_member_end */
  authored?: boolean;
}

export interface KaneRunResult {
  execution_id: string | null;
  members: KaneMember[];
  exit_code: number;
  pack_path: string | null;
  overall_status?: string;
  totals?: Record<string, number>;
}

/** Per-test data read from the evidence pack. */
export interface EvidenceTest {
  test_id: string;
  /** file stem of the definition, e.g. S2_other_reads_by_url (best effort) */
  name?: string;
  status: string;
  /** Raw status above is preserved. A replay assertion can be classified broken by later RCA. */
  assertion_before_rca?: { step_index: number; rca_category: string };
  failed_step?: number;
  failure?: {
    error?: string;
    expected?: string;
    actual?: string;
    raw?: unknown;
  };
  /** repo-relative path of the exported screenshot of the failed (or last) step */
  screenshot?: string;
}

// ---------- verdicts ----------

export type Verdict = 'leak_confirmed' | 'denied_as_expected' | 'inconclusive';

export interface ScenarioOutcome {
  scenario: string;
  kind: ScenarioKind;
  status: MemberStatus | 'missing';
  verdict: Verdict | 'control_passed' | 'control_failed';
  reason: string;
  failed_step?: number;
  failure_message?: string;
  screenshot?: string;
  evidence_note?: string;
}

// ---------- report (bugsy.report.json) ----------

export interface Finding {
  scenario: string;
  verdict: Verdict;
  commit: string;
  kane: { execution_id: string | null; failed_step?: number; screenshot?: string; failure_message?: string };
  patch?: { commit: string; files: string[]; diff: string; patcher: string; rationale?: string };
  rerun?: { execution_id: string | null } & Record<string, string | null>;
  self_check?: { execution_id: string | null; tests_detect_leak: boolean } & Record<string, unknown>;
}

export interface HistoryEntry {
  at: string;
  phase: 'scan' | 'patch' | 'verify' | 'self-check';
  commit: string;
  execution_id: string | null;
  exit_code: number;
  summary: string;
  outcomes?: ScenarioOutcome[];
}

export interface BugsyReport {
  version: 1;
  app: string;
  generated_at: string;
  scan?: {
    commit: string;
    execution_id: string | null;
    used_prepared_tests: boolean;
    outcomes: ScenarioOutcome[];
  };
  findings: Finding[];
  history: HistoryEntry[];
}
