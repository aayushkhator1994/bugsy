/** Extract a unified diff from model output. Prefers the last ```diff fence; falls back to raw diff text. */
export function extractDiff(text: string): string {
  const fences = [...text.matchAll(/```(?:diff|patch)[^\n]*\n([\s\S]*?)```/g)];
  let body = fences.length ? fences[fences.length - 1][1] : '';
  if (!body) {
    const m = text.match(/^(diff --git [\s\S]*|--- [^\n]+\n\+\+\+ [\s\S]*)$/m);
    body = m ? m[0] : '';
  }
  body = body.replace(/\r\n/g, '\n').replace(/\s+$/, '');
  if (!/^(diff --git|--- |Index: )/m.test(body) || !/^@@ /m.test(body)) {
    throw new Error('No unified diff found in patcher output');
  }
  return body + '\n';
}
