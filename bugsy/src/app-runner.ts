// Start / stop the app under test (Ledger). Always call stop() in a finally block.
import { execa, type ResultPromise } from 'execa';
import { createWriteStream, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BugsyConfig } from './types.ts';
import { appPort, BugsyError } from './config.ts';

export interface RunningApp {
  pid: number | undefined;
  url: string;
  stop(): Promise<void>;
}

/** PIDs listening on a TCP port (empty when free). */
export async function listeningPids(port: number): Promise<number[]> {
  const r = await execa('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { reject: false });
  return r.stdout
    .split('\n')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

export async function waitForHealth(url: string, timeoutMs = 15_000, intervalMs = 250): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

export async function startApp(cfg: BugsyConfig, root: string, opts: { logFile?: string } = {}): Promise<RunningApp> {
  const port = appPort(cfg);
  const busy = await listeningPids(port);
  if (busy.length) {
    throw new BugsyError(
      `port ${port} is already in use (PID ${busy.join(', ')}). Stop it first, e.g. kill ${busy.join(' ')}`,
    );
  }

  const logPath = opts.logFile ?? resolve(root, 'bugsy/.run/app.log');
  mkdirSync(resolve(logPath, '..'), { recursive: true });
  const log = createWriteStream(logPath, { flags: 'a' });
  log.write(`\n--- ${new Date().toISOString()} start: ${cfg.app.start}\n`);

  const child: ResultPromise = execa(cfg.app.start, {
    shell: true,
    cwd: root,
    detached: true, // own process group so stop() can kill npx → tsx → node together
    env: { ...process.env, PORT: String(port) },
    stdin: 'ignore',
    reject: false,
    cleanup: true,
  });
  child.stdout?.pipe(log, { end: false });
  child.stderr?.pipe(log, { end: false });

  let exited = false;
  child.then(() => (exited = true), () => (exited = true));

  const stop = async (): Promise<void> => {
    if (exited || child.pid === undefined) return;
    const pgid = -child.pid;
    try {
      process.kill(pgid, 'SIGTERM');
    } catch {
      /* already gone */
    }
    const deadline = Date.now() + 5000;
    while (!exited && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
    if (!exited) {
      try {
        process.kill(pgid, 'SIGKILL');
      } catch {
        /* gone */
      }
    }
    // wait until the port is actually free so a restart does not trip the busy check
    const freeBy = Date.now() + 5000;
    while ((await listeningPids(port)).length && Date.now() < freeBy) await new Promise((r) => setTimeout(r, 100));
    log.end();
  };

  const healthUrl = new URL(cfg.app.health, cfg.app.url).toString();
  const ok = await waitForHealth(healthUrl, 15_000);
  if (!ok || exited) {
    await stop();
    throw new BugsyError(`app did not become healthy at ${healthUrl} within 15s (log: ${logPath})`);
  }
  return { pid: child.pid, url: cfg.app.url, stop };
}

/** Run fn with the app up; the app is always stopped afterwards. */
export async function withApp<T>(cfg: BugsyConfig, root: string, fn: (app: RunningApp) => Promise<T>): Promise<T> {
  const app = await startApp(cfg, root);
  try {
    return await fn(app);
  } finally {
    await app.stop();
  }
}
