import type { Scenario } from '../types.ts';

export function renderScenariosMarkdown(scenarios: Scenario[], ownershipRule?: string): string {
  const rule =
    ownershipRule ??
    'Each invoice belongs to exactly one user. A signed-in user may view and change only their own invoices; any other invoice must show "Invoice not found".';
  const out: string[] = ['# Authorization requirements for Ledger', '', `Ownership rule: ${rule}`, ''];
  for (const s of scenarios) {
    out.push(`## ${s.id}: ${s.title}`, '', s.requirement, '', 'Steps', '');
    s.steps.forEach((st, i) => out.push(`${i + 1}. ${st}`));
    out.push('', 'Expected', '');
    s.expected.forEach((e) => out.push(`- ${e}`));
    out.push('');
    if (s.kind === 'leak_check' && s.control_id) out.push(`Control: ${s.control_id}`, '');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
