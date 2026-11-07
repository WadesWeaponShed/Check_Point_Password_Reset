import test from 'node:test';
import assert from 'node:assert/strict';
import {communicatingTargetIds,groupTargetsBySic} from '../public/target-selection.js';
test('selection includes only affirmative SIC; failing and pending targets are excluded',()=>{
 const targets=['gw10','gw2','gw1','gw3'].map(name=>({id:name,name,ip:'',cluster:''}));
 const sic=new Map([['gw10',{communicating:true,platformReady:true,status:'Communicating'}],['gw2',{communicating:false,status:'Not communicating'}],['gw1',{status:'Testing…'}],['gw3',{status:'Test failed'}]]);
 assert.deepEqual(communicatingTargetIds(targets,sic),['gw10']);
 const groups=groupTargetsBySic(targets,sic);assert.deepEqual(groups.available.map(t=>t.name),['gw1','gw10']);assert.deepEqual(groups.failing.map(t=>t.name),['gw2','gw3']);
 assert.deepEqual(groupTargetsBySic(targets,sic,'gw3').failing.map(t=>t.id),['gw3']);
 sic.set('gw2',{communicating:true,platformReady:true,status:'Communicating'});assert.deepEqual(communicatingTargetIds(targets,sic),['gw10','gw2']);
});
