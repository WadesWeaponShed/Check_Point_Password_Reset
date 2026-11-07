import test from 'node:test';
import assert from 'node:assert/strict';
import {runWithLockRecovery} from '../src/workflows/gaia-lock.js';
const locked={completion:'failed',output:"CP_RESET_FAILED (clish exit 1)\nCLINFR0771 Config lock is owned by admin. Use 'lock database override'."};
const success={completion:'succeeded',output:'CP_RESET_SAVED'};
const acquired={completion:'succeeded',output:'Lock acquired'};
function harness(responses) {
 const calls=[],delays=[];
 return {calls,delays,run:()=>runWithLockRecovery({sessionId:'session',target:'GFG',body:{script:'password command','script-name':'reset'},sleep:async delay=>delays.push(delay),sessions:{runScript:async(id,body,context)=>{calls.push({id,body,context});assert.ok(responses.length,'unexpected retry');return responses.shift();}}})};
}
test('configuration lock triggers manager-side override and bounded delayed retry on same target',async()=>{
 const h=harness([locked,acquired,success]);const result=await h.run();assert.equal(result.completion,'succeeded');assert.equal(result.lockRecovery.length,3);assert.deepEqual(h.delays,[1500]);assert.equal(h.calls[1].body.script,'clish -c "lock database override"');assert.equal(h.calls[0].body.script,h.calls[2].body.script);assert.ok(h.calls.every(c=>c.context==='primary'&&c.body.targets.length===1&&c.body.targets[0]==='GFG'));
});
test('unrelated failures and unknown tasks never trigger lock override or retry',async()=>{
 for(const response of [{completion:'failed',output:'Permission denied'},{...locked,completion:'unknown'},success]){const h=harness([response]);const result=await h.run();assert.equal(h.calls.length,1);assert.equal(result.completion,response.completion);}
});
test('failed and unverified override stops before another password submission',async()=>{
 for(const override of [{completion:'failed',output:'denied'},{completion:'unknown',output:''},{completion:'succeeded',output:'CLINFR0519 Configuration lock present'}]){const h=harness([locked,override]);const result=await h.run();assert.equal(h.calls.length,2);assert.notEqual(result.completion,'succeeded');assert.match(result.recoveryMessage,/No password retry/);}
});
test('persistent configuration lock exhausts three retries and retains failure',async()=>{
 const h=harness([locked,acquired,locked,acquired,locked,acquired,locked]);const result=await h.run();assert.equal(h.calls.length,7);assert.deepEqual(h.delays,[1500,2500,4000]);assert.equal(result.completion,'failed');assert.equal(result.lockRecovery.length,7);
});
test('retry timeout or unrelated failure ends recovery without further override',async()=>{
 for(const response of [{completion:'failed',output:'Password rejected'},{completion:'unknown',output:'Still running'}]){const h=harness([locked,acquired,response]);const result=await h.run();assert.equal(h.calls.length,3);assert.equal(result.completion,response.completion);}
});

test('successful override may include CLINFR0771 startup warning and still proceeds after settling',async()=>{
 const warning={completion:'succeeded',output:"CLINFR0771 Config lock is owned by admin. Use the command 'lock database override' to acquire the lock.",taskSummary:[{statusDescription:"CLINFR0771 Config lock is owned by admin. Use the command 'lock database override' to acquire the lock."}]};
 const h=harness([locked,warning,success]);const result=await h.run();assert.equal(result.completion,'succeeded');assert.equal(h.calls.length,3);assert.deepEqual(h.delays,[1500]);assert.match(result.lockRecovery[1].output,/CLINFR0771/);
});
test('startup warning does not mask a different override error on a subsequent line',async()=>{
 const h=harness([locked,{completion:'succeeded',output:'CLINFR0771 Config lock is owned by admin.\nCLINFR0519 Configuration lock present.'}]);const result=await h.run();assert.equal(result.completion,'failed');assert.equal(h.calls.length,2);
});
