import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPlatform,detectPlatform} from '../src/workflows/platform.js';
import {buildResetScript,discoverTargets,startResetJob,runSicTests} from '../src/workflows/password-reset.js';
import {runWithLockRecovery} from '../src/workflows/gaia-lock.js';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const group={completion:'succeeded',output:'CP_PLATFORM_SCALABLE\n| System Status - Maestro |\n| SGMs | 2/2 |\nCP_MEMBER_INFO\n| SGM ID | State | IP |\n| 1_1 | ACTIVE | 192.0.2.1 |\n| 1_2 | ACTIVE | 192.0.2.2 |'};
const standard={completion:'succeeded',output:'CP_PLATFORM_STANDARD\nCheck Point Gaia R81.20'};
const hash='$6$abcdefghijklmnop$'+'A'.repeat(86);
test('detects standard and scalable Gaia, blocks conflicts and incomplete member availability',()=>{
 assert.equal(classifyPlatform(standard).shell,'clish');assert.equal(classifyPlatform(group).shell,'gclish');assert.equal(classifyPlatform(group).memberCount,2);
 assert.equal(classifyPlatform(group).platformReady,true);
 assert.equal(classifyPlatform({...group,output:group.output.replace('2/2','1/2')}).platformReady,false);
 for(const response of [{...group,completion:'unknown'},{completion:'succeeded',output:'CP_PLATFORM_UNVERIFIED'},{completion:'succeeded',output:'CP_PLATFORM_STANDARD\nnot supported'}])assert.equal(classifyPlatform(response).platformReady,false);
 assert.equal(classifyPlatform(standard,'Maestro').platformReady,false);
});
test('platform check stays manager-side and blocks transport failure',async()=>{
 const calls=[];const sessions={runScript:async(...args)=>{calls.push(args);return group}};
 assert.equal((await detectPlatform(sessions,'s',{name:'SG'})).shell,'gclish');assert.deepEqual(calls[0][1].targets,['SG']);assert.equal(calls[0][2],'primary');assert.match(calls[0][1].script,/asg stat -i sgm_info/);
 assert.equal((await detectPlatform({runScript:async()=>{throw Error()}},'s',{name:'SG'})).platformReady,false);
});
test('both password types preserve hash shell escaping through gclish',async()=>{
 for(const type of ['user','expert']) {
 const expected=type==='user'?`set user admin password-hash ${hash}`:`set expert-password-hash ${hash}`;
 const script=`gclish() { [ "$1" = '-s' ] && [ "$2" = '-c' ] && [ "$3" = '${expected}' ]; }; `+buildResetScript('admin',hash,type,'gclish');
 const {stdout}=await promisify(execFile)('/bin/sh',['-c',script]);assert.equal(stdout,'CP_RESET_SAVED\n');
 }
 assert.throws(()=>buildResetScript('admin',hash,'user','gclish;id'),/shell/);
});
test('scalable lock recovery also uses gclish, never local clish',async()=>{
 const calls=[],responses=[{completion:'failed',output:'CLINFR0771 Config lock is owned by admin'}, {completion:'succeeded',output:'Lock acquired'},{completion:'succeeded',output:'CP_RESET_SAVED'}];
 const result=await runWithLockRecovery({sessions:{runScript:async(id,body)=>{calls.push(body);return responses.shift()}},sessionId:'s',target:'SG',shell:'gclish',body:{script:'gclish reset'},sleep:async()=>{}});
 assert.equal(result.completion,'succeeded');assert.equal(calls[1].script,'gclish -c "lock database override"');
});
async function runJob(probes) {
 const session={},calls=[];
 const sessions={get:()=>session,list:async()=>[{uid:'sg',name:'SG',type:'simple-gateway',platform:'maestro'}],command:async()=>({'sic-status':'communicating'}),runScript:async(id,body)=>{calls.push(body);return body['script-name']==='Read-only Gaia platform and Security Group check'?probes.shift():{completion:'succeeded',output:'CP_RESET_SAVED'}}};
 await discoverTargets(sessions,'s');await runSicTests(sessions,'s',['sg']);
 const {jobId}=startResetJob(sessions,'s',{targets:['sg'],username:'admin',hash,confirmation:'RESET 1'});
 for(let i=0;i<100&&session.passwordJobs.get(jobId).state!=='complete';i++)await new Promise(r=>setTimeout(r,2));
 return {row:session.passwordJobs.get(jobId).rows[0],calls};
}
test('confirmed Security Group executes globally once and verifies group availability afterward',async()=>{
 const {row,calls}=await runJob([group,group,group]);assert.equal(row.status,'Succeeded');assert.equal(row.shell,'gclish');assert.equal(calls.filter(c=>c['script-name']==='Gaia user password reset').length,1);assert.match(calls.find(c=>c['script-name']==='Gaia user password reset').script,/gclish -s -c/);
});
test('unverified platform blocks reset and degraded postflight reports unknown',async()=>{
 const {row,calls}=await runJob([group,{completion:'unknown',output:''}]);assert.equal(row.status,'Skipped');assert.equal(calls.filter(c=>c['script-name']==='Gaia user password reset').length,0);
 const degraded={...group,output:group.output.replace('2/2','1/2')};const result=await runJob([group,group,degraded]);assert.equal(result.row.status,'Unknown');
});
