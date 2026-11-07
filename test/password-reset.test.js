import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverTargets, startResetJob, runSicTests, buildResetScript } from '../src/workflows/password-reset.js';
import { redactSecrets } from '../src/check-point-client.js';
import { pollScriptTasks } from '../src/task-polling.js';
const hash = '$6$abcdefghijklmnop$' + 'A'.repeat(86);
function fixture() {
  const session = {}, calls = [];
  const sessions = { get: () => session,
    list: async () => [{name:'gw',uid:'g',type:'simple-gateway'},{name:'cluster',type:'simple-cluster','cluster-member-names':['member1','member2']},{name:'member1',uid:'m1',type:'cluster-member'},{name:'sms',type:'CpmiHostCkp'}],
    command: async (id, command, body, context) => { calls.push({command,body,context});return {'sic-status':body.name==='member2'?'not communicating':'communicating'}; },
    runScript: async (id, body, context) => { if (body['script-name'] === 'Read-only Gaia platform and Security Group check') return {completion:'succeeded',output:'CP_PLATFORM_STANDARD\nProduct version Check Point Gaia R81.20'}; calls.push({command:'run-script',body,context});return { completion:'succeeded',output:'CP_RESET_SAVED',result:{tasks:[{script:body.script}]} }; }
  };return {session,sessions,calls};
}
async function done(session,id) { for(let i=0;i<100;i++){if(session.passwordJobs.get(id).state==='complete')return session.passwordJobs.get(id);await new Promise(r=>setTimeout(r,2));}throw Error('Job stuck'); }
test('discovery expands members, deduplicates, includes Check Point servers, and excludes virtual clusters',async()=>{
 const {sessions}=fixture();const result=await discoverTargets(sessions,'s');assert.deepEqual(result.targets.map(t=>t.name),['gw','member1','member2','sms']);assert.equal(result.targets[3].kind,'Check Point server');assert.equal(result.targets[1].cluster,'cluster');
});
test('reset validates selection, username, hash and confirmation before commands',async()=>{
 const {sessions,calls}=fixture();await discoverTargets(sessions,'s');
 for(const override of [{targets:['invented']},{username:'admin;id'},{hash:'bad'},{confirmation:'yes'}])assert.throws(()=>startResetJob(sessions,'s',{targets:['g'],username:'admin',hash,confirmation:'RESET 1',...override}));assert.equal(calls.length,0);
});
test('each target is SIC gated, reset saved, and task details redact the hash',async()=>{
 const {sessions,session,calls}=fixture();const inventory=await discoverTargets(sessions,'s');const targets=inventory.targets.filter(t=>t.name!=='sms');const {jobId}=startResetJob(sessions,'s',{targets:targets.map(t=>t.id),username:'admin',hash,confirmation:'RESET 3'});
 assert.throws(()=>startResetJob(sessions,'s',{targets:['g'],username:'admin',hash,confirmation:'RESET 1'}),/already running/);
 const job=await done(session,jobId);assert.deepEqual(job.rows.map(r=>r.status),['Succeeded','Succeeded','Skipped']);assert.equal(calls.filter(c=>c.command==='run-script').length,2);assert.ok(calls.every(c=>c.context==='primary'));assert.ok(!JSON.stringify(job).includes(hash));assert.match(calls.find(c=>c.command==='run-script').body.script,/clish -s -c/);
});
test('timeout and missing success marker never become success',async()=>{
 for(const response of [{completion:'unknown',output:'CP_RESET_SAVED'},{completion:'succeeded',output:'CLINFR0329 error'},{completion:'failed',output:'CP_RESET_SAVED'}]){
 const {sessions,session}=fixture();sessions.runScript=async(id,body)=>body['script-name']==='Read-only Gaia platform and Security Group check'?{completion:'succeeded',output:'CP_PLATFORM_STANDARD\nGaia R81.20'}:response;await discoverTargets(sessions,'s');const {jobId}=startResetJob(sessions,'s',{targets:['g'],username:'admin',hash,confirmation:'RESET 1'});const job=await done(session,jobId);assert.notEqual(job.rows[0].status,'Succeeded');}
});
test('SIC errors block targets and MDS requires selected CMA',async()=>{
 const {sessions,session,calls}=fixture();await discoverTargets(sessions,'s');sessions.command=async()=>{throw Error('denied')};const {rows}=await runSicTests(sessions,'s',['g']);assert.equal(rows[0].communicating,false);session.mdsMode=true;await assert.rejects(discoverTargets(sessions,'s'),/CMA/);assert.equal(calls.length,0);
});
test('logging redacts complete script and hashes',()=>{assert.deepEqual(redactSecrets({script:'secret',hash,password:'secret',nested:{sid:'secret'}}),{script:'[redacted]',hash:'[redacted]',password:'[redacted]',nested:{sid:'[redacted]'}});});
test('polling waits for every task and ignores early output while running',async()=>{
 let now=0,polls=0;const result=await pollScriptTasks({initial:{ok:true,data:{}},taskIds:['a','b'],targets:['gw'],timeoutMs:100,intervalMs:1,sleep:async ms=>{now+=ms},now:()=>now,request:async id=>{polls++;return {ok:true,data:{tasks:[{'task-id':id,status:polls<3?'in progress':'succeeded','task-details':[{responseMessage:Buffer.from('early output').toString('base64')}]}]}}}});assert.equal(result.ok,true);assert.equal(result.data.tasks.length,2);assert.ok(polls>=4);
});

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
test('reset script passes hash intact to clish -s -c and detects successful completion', async () => {
 const script = buildResetScript('admin', hash);
 const mock = `clish() { [ "$1" = '-s' ] && [ "$2" = '-c' ] && [ "$3" = 'set user admin password-hash ${hash}' ]; }; `;
 const { stdout } = await execute('/bin/sh', ['-c', mock + script]);
 assert.equal(stdout, 'CP_RESET_SAVED\n');
});
test('reset script preserves real Clish failure diagnostics and redacts echoed hashes on gateway', async () => {
 for (const code of [0, 1]) {
  const mock = `clish() { printf '%s\\n' 'CLINFR0329 User does not exist' 'set user admin password-hash ${hash}'; return ${code}; }; `;
  await assert.rejects(execute('/bin/sh', ['-c', mock + buildResetScript('admin', hash)]), e => {
   assert.equal(e.code, 1);
   assert.match(e.stdout, /CP_RESET_FAILED/);
   assert.match(e.stdout, /CLINFR0329 User does not exist/);
   assert.match(e.stdout, /redacted hash/);
   assert.ok(!e.stdout.includes(hash));
   return true;
  });
 }
});

test('discovery includes management, log, and other server types returned by gateway-server collection',async()=>{
 const {sessions}=fixture();sessions.list=async()=>['CpmiHostCkp','checkpoint-host','management-server','log-server','CpmiLogServer','future-server-type'].map((type,i)=>({uid:`server-${i}`,name:`server-${i}`,type}));
 const {targets}=await discoverTargets(sessions,'s');assert.equal(targets.length,6);assert.ok(targets.every(t=>t.kind==='Check Point server'));assert.equal(targets[5].objectType,'future-server-type');
});

test('plaintext generator rejects reserved characters while hashes retain dollar separators', async () => {
 const {generatePasswordHash} = await import('../src/workflows/password-hash.js');
 for (const character of ['!', String.fromCharCode(92), '$', '#', "'", '"', '*']) {
  await assert.rejects(generatePasswordHash({password:`valid${character}password`}));
 }
 const result=await generatePasswordHash({password:'Valid-password_2468@%'});
 assert.match(result.hash, /^\$6\$/);
 assert.match(buildResetScript('admin',result.hash), /clish -s -c/);
});

test('Expert reset uses the expert hash command, saves, and does not require a username', async () => {
 const script = buildResetScript(undefined, hash, 'expert');
 const mock = `clish() { [ "$1" = '-s' ] && [ "$2" = '-c' ] && [ "$3" = 'set expert-password-hash ${hash}' ]; }; `;
 const {stdout}=await execute('/bin/sh',['-c',mock+script]);assert.equal(stdout,'CP_RESET_SAVED\n');
 const {sessions,session,calls}=fixture();await discoverTargets(sessions,'s');
 const {jobId}=startResetJob(sessions,'s',{targets:['g'],passwordType:'expert',hash,confirmation:'RESET 1'});
 const job=await done(session,jobId);assert.equal(job.passwordType,'expert');assert.equal(job.username,null);assert.equal(job.rows[0].status,'Succeeded');
 const request=calls.find(c=>c.command==='run-script');assert.equal(request.body['script-name'],'Gaia Expert password reset');assert.match(request.body.script,/set expert-password-hash/);assert.doesNotMatch(request.body.script,/set user/);
 assert.throws(()=>buildResetScript('admin',hash,'unknown'),/password type/);
 assert.throws(()=>buildResetScript(undefined,'invalid','expert'),/hash/);
});
