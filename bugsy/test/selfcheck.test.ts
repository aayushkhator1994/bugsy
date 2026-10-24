import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import AdmZip from 'adm-zip';
import { execa } from 'execa';
import { parseConfig } from '../src/config.ts';

test('self-check accepts replay metadata updates, restores the patch, and protects test definitions', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bugsy-self-'));
  const git = (...args: string[]) => execa('git', args, { cwd: root });
  await git('init', '-q'); await git('config', 'user.name', 'Test'); await git('config', 'user.email', 'test@example.test');
  mkdirSync(join(root, 'app/src/routes'), { recursive: true });
  mkdirSync(join(root, 'tests/authz/output-S1_owner_reads_own/.internal'), { recursive: true });
  mkdirSync(join(root, '.testmuai/evidence'), { recursive: true });
  writeFileSync(join(root, '.gitignore'), '.testmuai/\nbugsy/.run/\nevidence/\n');
  const route = join(root, 'app/src/routes/invoices.ts');
  writeFileSync(route, 'vulnerable\n');
  const ids = ['S1_owner_reads_own', 'S2_other_reads_by_url'];
  for (const id of ids) copyFileSync(resolve(import.meta.dirname, '../../fixtures/prepared/tests/authz', id + '_test.md'), join(root, 'tests/authz', id + '_test.md'));
  const metadata = join(root, 'tests/authz/output-S1_owner_reads_own/.internal/meta.json');
  writeFileSync(metadata, '{}\n');
  const serverFile = join(root, 'server.mjs');
  writeFileSync(serverFile, "import {createServer} from 'node:http'; createServer((req,res)=>{res.writeHead(200);res.end('ok')}).listen(Number(process.env.PORT));\n");
  const fake = join(root, 'fake-kane.mjs');
  writeFileSync(fake, [
    '#!/usr/bin/env node',
    "import {readFileSync,writeFileSync} from 'node:fs';",
    "if (!readFileSync('app/src/routes/invoices.ts','utf8').includes('vulnerable')) process.exit(2);",
    "writeFileSync('tests/authz/output-S1_owner_reads_own/.internal/meta.json',JSON.stringify({replayed:true}));",
    "const emit=e=>console.log(JSON.stringify(e));",
    "emit({type:'testrun_start',execution_id:'self-exec'});",
    "emit({type:'testrun_member_end',path:'tests/authz/S1_owner_reads_own_test.md',test_id:'S1_owner_reads_own',status:'passed'});",
    "emit({type:'testrun_member_end',path:'tests/authz/S2_other_reads_by_url_test.md',test_id:'S2_other_reads_by_url',status:'failed',failure:{message:\"Expected 'Invoice not found', saw 'Umbrella'\",step_index:5}});",
    "emit({type:'testrun_done',execution_id:'self-exec',overall_status:'failed'});",
    'process.exitCode=1;',
  ].join('\n'));
  chmodSync(fake, 0o700);
  const zip = new AdmZip(); zip.addFile('run.yaml', Buffer.from('status: failed\n'));
  for (const [index,id] of ids.entries()) {
    zip.addFile(`tests/${id}/result.yaml`, Buffer.from(`path: tests/authz/${id}_test.md\nstatus: ${index === 0 ? 'passed' : 'failed'}\n`));
  }
  zip.writeZip(join(root, '.testmuai/evidence/self-exec.evidence'));
  await git('add', '.'); await git('commit', '-qm', 'vulnerable baseline');
  const A = (await git('rev-parse', 'HEAD')).stdout;
  writeFileSync(route, 'patched\n'); await git('add', 'app/src/routes/invoices.ts'); await git('commit', '-qm', 'fix(authz): S2_other_reads_by_url');
  const B = (await git('rev-parse', 'HEAD')).stdout;
  writeFileSync(join(root, 'bugsy.report.json'), JSON.stringify({version:1,app:'Ledger',generated_at:'now',history:[],findings:[{scenario:ids[1],verdict:'leak_confirmed',commit:A,kane:{execution_id:'red'},patch:{commit:B,files:['app/src/routes/invoices.ts'],diff:'',patcher:'test'}}]}));
  await git('add', 'bugsy.report.json'); await git('commit', '-qm', 'record fix');
  const socket = createServer(); await new Promise<void>(r=>socket.listen(0,'127.0.0.1',r));
  const port = (socket.address() as {port:number}).port; await new Promise<void>((r,j)=>socket.close(e=>e?j(e):r()));
  const cfg = parseConfig({app:{start:`node '${serverFile}'`,url:`http://localhost:${port}`,source_globs:['app/src/routes/**']},accounts:{alice:{email:'alice@example.test',password:'demo-alice'},bob:{email:'bob@example.test',password:'demo-bob'}},ownership_rule:'Users own their invoices',routes:['GET /invoices/:id']});
  const previous = process.env.BUGSY_KANE_BIN; process.env.BUGSY_KANE_BIN = fake;
  try {
    const { selfCheck } = await import('../src/selfcheck.ts');
    const ctx = {root,cfg,report:false,json:true,log:()=>{}};
    const definition = join(root, 'tests/authz/S2_other_reads_by_url_test.md');
    const frozen = readFileSync(definition, 'utf8');
    assert.equal(await selfCheck(ctx, undefined), 0);
    assert.equal(readFileSync(route,'utf8'), 'patched\n');
    assert.equal(readFileSync(definition,'utf8'), frozen);
    assert.equal(JSON.parse(readFileSync(join(root,'bugsy.report.json'),'utf8')).findings[0].self_check.tests_detect_leak, true);
    writeFileSync(definition, frozen + '\n# unexpected edit\n');
    await assert.rejects(selfCheck(ctx, undefined), /working tree is not clean/);
    assert.equal(readFileSync(route,'utf8'), 'patched\n');
  } finally {
    if (previous === undefined) delete process.env.BUGSY_KANE_BIN; else process.env.BUGSY_KANE_BIN=previous;
  }
});
