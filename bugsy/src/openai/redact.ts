const KEY_RE = /sk-[A-Za-z0-9_-]{20,}/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._~+\/=-]+/gi;

const secrets = new Set<string>();

/** Register literal secrets (e.g. account passwords) to be scrubbed from logs. */
export function registerSecrets(values: string[]): void {
  for (const v of values) if (v && v.length >= 3) secrets.add(v);
}

export function redactString(s: string, extra: string[] = []): string {
  let out = s.replace(KEY_RE, '[redacted]').replace(BEARER_RE, '[redacted]');
  for (const sec of [...secrets, ...extra]) {
    if (sec) out = out.split(sec).join('[redacted]');
  }
  return out;
}

/** Deep-redacts a JSON-able value (strings in keys' values and nested structures). */
export function redact<T>(value: T, extra: string[] = []): T {
  if (typeof value === 'string') return redactString(value, extra) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => redact(v, extra)) as unknown as T;
  if (value && typeof value === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) o[k] = redact(v, extra);
    return o as T;
  }
  return value;
}
