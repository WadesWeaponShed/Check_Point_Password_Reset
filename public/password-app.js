import { renderExecutionResults } from './result-view.js';
import { communicatingTargetIds, groupTargetsBySic } from './target-selection.js';
import { formatClishPasswordCommand } from './password-hash-format.js';
const $ = id => document.getElementById(id);
let session, targets = [], selected = new Set(), sic = new Map(), job, running = false, polling;
const emptyResultState = $('resultRows').firstElementChild.cloneNode(true);
const panelIds = ['targetPanel', 'hashPanel', 'reviewPanel', 'resultPanel'];
function showPanel(id, focus = false) {
  if (!panelIds.includes(id)) return;
  panelIds.forEach(panel => $(panel).classList.toggle('hidden', panel !== id));
  document.querySelectorAll('[data-panel]').forEach(button => {
    const active = button.dataset.panel === id;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
    if (active) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
  });
  if (focus) { $('workspace').scrollIntoView({block: 'start', behavior: 'instant'}); $(id).focus({preventScroll: true}); }
}
document.addEventListener('click', event => {
  const button = event.target.closest('[data-panel], [data-go]');
  if (button) showPanel(button.dataset.panel || button.dataset.go, true);
});
async function api(path, body = {}) {
  const response = await fetch(`/api/${path}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({sessionId:session?.sessionId,...body}) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Request failed.'); return data;
}
function status(message) { $('appStatus').textContent = message; }
function busy(value) {
  running = value;
  for (const id of ['discoverButton','selectAll','selectNone','sicButton','logoutButton','passwordType','resetUsername','hashMode','newPassword','confirmPassword','resetHash','clearSecrets','confirmation']) $(id).disabled = value;
  document.querySelector('#hashForm button[type=submit]').disabled = value;
  $('workspace').setAttribute('aria-busy', String(value));
  renderTargets(); review();
}
function review() {
  const count = selected.size, username = $('resetUsername').value, expert = $('passwordType').value === 'expert';
  $('reviewSummary').textContent = `${count} selected target${count === 1 ? '' : 's'} · ${expert ? 'Expert mode password' : `Gaia user: ${username || '(required)'}`}. SIC is checked again immediately before each reset.`;
  $('confirmation').placeholder = `RESET ${count}`;
  const groupTargets = targets.filter(t => selected.has(t.id) && sic.get(t.id)?.shell === 'gclish');
  const shells = [...new Set(targets.filter(t => selected.has(t.id)).map(t => sic.get(t.id)?.shell).filter(Boolean))];
  $('commandPreview').textContent = expert ? 'clish -s -c "set expert-password-hash [SHA-512 hash]"' : `clish -s -c "set user ${username} password-hash [SHA-512 hash]"`;
  if (shells.length) $('commandPreview').textContent = shells.map(shell => expert ? `${shell} -s -c "set expert-password-hash [SHA-512 hash]"` : `${shell} -s -c "set user ${username} password-hash [SHA-512 hash]"`).join('\n');
  $('resetWarning').textContent = `This changes ${expert ? 'the system-wide Expert mode password' : "the named Gaia user's password"} immediately on each selected target and saves configuration. Only communicating targets proceed. If Gaia reports a configuration lock, the manager will override the existing admin session’s lock and retry up to three times. There is no automatic rollback. Keep a recovery session open and verify ${expert ? 'Expert access' : 'a new login'}.`;
  if (groupTargets.length) $('resetWarning').textContent += ` Group-wide scope: ${groupTargets.map(t=>t.name).join(', ')}. gClish applies to all members and sites of each selected Security Group.`;
  let valid = false; try { formatClishPasswordCommand(username, $('resetHash').value, $('passwordType').value); valid = true; } catch {}
  $('navSelected').textContent = String(count);
  $('navHash').textContent = valid ? 'Ready' : '';
  $('resetButton').disabled = running || !count || !valid || $('confirmation').value !== `RESET ${count}`;
}
function invalidate() { $('confirmation').value = ''; review(); }
function renderTargets() {
  const search = $('targetSearch').value.toLowerCase();
  const { available, failing } = groupTargetsBySic(targets, sic, search);
  const eligible = new Set(communicatingTargetIds(targets, sic));
  let removed = false;
  for (const id of selected) if (!eligible.has(id)) { selected.delete(id); removed = true; }
  if (removed) invalidate();
  $('targetRows').replaceChildren();
  $('failingSicRows').replaceChildren();
  for (const t of [...available, ...failing]) {
    const tr = document.createElement('tr'), td = document.createElement('td'), input = document.createElement('input');
    tr.classList.toggle('is-selected', selected.has(t.id));
    input.type = 'checkbox'; input.checked = selected.has(t.id); input.disabled = running || !eligible.has(t.id);
    input.setAttribute('aria-label', `Select ${t.name}`);
    input.addEventListener('change', () => {
      input.checked ? selected.add(t.id) : selected.delete(t.id);
      tr.classList.toggle('is-selected', input.checked);
      $('inventoryStatus').textContent = `${targets.length} discovered · ${selected.size} selected`;
      invalidate();
    });
    if (eligible.has(t.id) || !failing.includes(t)) td.append(input); else td.textContent = 'Excluded';
    tr.append(td);
    for (const [index, value] of [t.name, t.ip || 'Not returned', t.kind].entries()) {
      const cell = document.createElement('td'); cell.textContent = value;
      if (index === 0) cell.className = 'target-name';
      if (index === 2 && t.cluster) { const meta = document.createElement('span'); meta.className = 'target-meta'; meta.textContent = t.cluster; cell.append(meta); }
      if (index === 2 && sic.get(t.id)?.platformLabel) { const platform = document.createElement('span'); platform.className = 'target-meta'; platform.textContent = sic.get(t.id).platformLabel; cell.append(platform); if(sic.get(t.id).platformReady === false && sic.get(t.id).communicating) {const reason=document.createElement('span');reason.className='field-error';reason.textContent=sic.get(t.id).platformMessage || 'Platform check required';cell.append(reason);} if(sic.get(t.id).platform === 'scalable') {const details=document.createElement('details'), summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent=`All members / sites (${sic.get(t.id).membersUp ?? '?'} / ${sic.get(t.id).memberCount ?? '?'} available)`;pre.textContent=sic.get(t.id).memberEvidence;details.append(summary,pre);cell.append(details);} }
      tr.append(cell);
    }
    const cell = document.createElement('td'), badge = document.createElement('span'), state = sic.get(t.id);
    badge.className = `sic-badge${state?.communicating ? ' good' : state && !['Testing…', 'Not tested'].includes(state.status) ? ' bad' : ''}`;
    badge.textContent = state?.status || 'Not tested';
    if (state?.message) badge.title = state.message;
    cell.append(badge); tr.append(cell); (failing.includes(t) ? $('failingSicRows') : $('targetRows')).append(tr);
  }
  if (!available.length) {
    const tr = document.createElement('tr'), cell = document.createElement('td'); cell.colSpan = 5; cell.className = 'table-empty';
    cell.textContent = targets.length ? 'No available targets match. Devices failing SIC are listed below.' : running ? 'Loading managed targets…' : 'No inventory loaded. Refresh inventory to discover managed targets.';
    tr.append(cell); $('targetRows').append(tr);
  }
  const failingCount = groupTargetsBySic(targets, sic).failing.length;
  $('failingSicBox').classList.toggle('hidden', failingCount === 0);
  $('failingSicCount').textContent = `${failingCount} device${failingCount === 1 ? '' : 's'}`;
  if (failingCount && !failing.length) { const row = document.createElement('tr'), cell = document.createElement('td'); cell.colSpan = 5; cell.className = 'table-empty'; cell.textContent = 'No failing devices match your filter.'; row.append(cell); $('failingSicRows').append(row); }
  $('navTargets').textContent = String(targets.length);
  $('inventoryStatus').textContent = `${targets.length} discovered · ${selected.size} selected`;
  const tested = [...sic.values()].filter(state => state.status !== 'Testing…');
  $('sicSummary').textContent = tested.length ? `${tested.filter(state => state.communicating).length} / ${targets.length} SIC communicating` : 'SIC not tested';
}
function validatePasswordMatch(force = false) {
  const mismatch = $('newPassword').value !== $('confirmPassword').value;
  const show = mismatch && (force || $('confirmPassword').value.length > 0);
  $('passwordMatchError').textContent = show ? 'Passwords do not match. Re-enter the same password in both fields.' : '';
  $('confirmPassword').setAttribute('aria-invalid', String(show));
  return !mismatch;
}
function clearSecrets() {for(const id of ['newPassword','confirmPassword','resetHash'])$(id).value='';$('hashStatus').textContent='Password and hash cleared.';validatePasswordMatch();invalidate();}
const form=$('loginForm');
function loginFields() {
  const mds=form.managementType.value==='mds', key=form.authMode.value==='api-key';
  document.querySelectorAll('.mds-field').forEach(e=>e.classList.toggle('hidden',!mds));form.domain.required=mds;
  document.querySelector('.password-field').classList.toggle('hidden',key);document.querySelector('.api-key-field').classList.toggle('hidden',!key);document.querySelector('.username-field').classList.toggle('hidden',key);
  form.username.required=!key;form.password.required=!key;form.apiKey.required=key;
  form.host.placeholder=form.managementType.value==='smart1-cloud'?'https://tenant.maas.checkpoint.com/context/web_api':'Hostname or IP Address';
}
form.addEventListener('change',loginFields);loginFields();
form.addEventListener('submit',async e=>{
  e.preventDefault();const button=form.querySelector('button[type=submit]');button.disabled=true;$('loginStatus').textContent='Connecting…';$('loginStatus').className='status-card full-row connecting';
  const data=Object.fromEntries(new FormData(form));data.smart1Cloud=data.managementType==='smart1-cloud';data.mdsMode=data.managementType==='mds';data.ignoreTls=form.ignoreTls.checked;data.largeEnvironmentMode=form.largeEnvironmentMode.checked;
  try { session=await api('login',data);showPanel('targetPanel');form.password.value='';form.apiKey.value='';$('loginCard').classList.add('hidden');$('workspace').classList.remove('hidden');$('workspace').scrollIntoView({block:'start',behavior:'instant'});$('connectionLabel').textContent=`${session.user} · ${session.baseUrl}`;$('scopeLabel').textContent=session.domain?`Domain / CMA: ${session.domain}`:session.smart1Cloud?'Smart-1 Cloud tenant':'Security Management Server';await loadInventoryAndSic(); }
  catch(error){$('loginStatus').textContent=error.message;$('loginStatus').className='status-card full-row error';}finally{button.disabled=false;data.password='';data.apiKey='';}
});
async function loadInventoryAndSic() {
  busy(true);
  targets = []; selected.clear(); sic.clear(); renderTargets(); invalidate();
  $('inventoryWarnings').textContent = '';
  $('inventoryStatus').textContent = 'Discovering gateways, cluster members, and Check Point servers…';
  status('Connected. Discovering gateways and servers, and expanding cluster members…');
  let discovered = false;
  try {
    const data = await api('targets');
    targets = data.targets; discovered = true;
    $('inventoryWarnings').textContent = data.warnings.join(' ');
    renderTargets();
    if (!targets.length) { status('No gateways, members, or Check Point servers were found.'); return; }
    for (const target of targets) sic.set(target.id, { status: 'Testing…' });
    renderTargets();
    $('inventoryStatus').textContent = `${targets.length} discovered · Testing SIC on all targets…`;
    status(`Testing SIC and detecting Gaia / Security Group platforms on ${targets.length} targets…`);
    const result = await api('sic-test', { targets: targets.map(t => t.id) });
    result.rows.forEach(row => { sic.set(row.id, row); });
    status(`Inventory ready. ${result.rows.filter(r => r.communicating).length} of ${targets.length} targets communicating. Platform checks complete; only verified targets can be selected.`);
  } catch (error) {
    if (discovered) {
      for (const target of targets) sic.set(target.id, { status: 'Test unavailable' });
      status(`Inventory loaded, but SIC testing failed: ${error.message} Select targets and use Test SIC to retry.`);
    } else status(`Inventory discovery failed: ${error.message} Use Refresh Inventory & SIC to retry.`);
  } finally { busy(false); invalidate(); }
}
$('discoverButton').addEventListener('click', loadInventoryAndSic);
$('selectAll').addEventListener('click',()=>{selected=new Set(communicatingTargetIds(targets,sic));renderTargets();invalidate();});
$('selectNone').addEventListener('click',()=>{selected.clear();renderTargets();invalidate();});$('targetSearch').addEventListener('input',renderTargets);
$('sicButton').addEventListener('click',async()=>{if(!selected.size)return status('Select targets first.');busy(true);status('Testing SIC on selected targets…');try{const data=await api('sic-test',{targets:[...selected]});data.rows.forEach(r=>sic.set(r.id,r));status(`${data.rows.filter(r=>r.communicating).length} of ${data.rows.length} targets communicating.`);}catch(e){status(e.message);}finally{busy(false);}});
$('hashMode').addEventListener('change',()=>{const existing=$('hashMode').value==='existing';clearSecrets();document.querySelectorAll('.generate-field').forEach(e=>e.classList.toggle('hidden',existing));$('resetHash').readOnly=!existing;});
$('hashForm').addEventListener('submit',async e=>{e.preventDefault();if(running)return;if(!validatePasswordMatch(true)){$('hashStatus').textContent='Passwords do not match. Correct the highlighted confirmation field.';$('confirmPassword').focus();return;}const b=e.submitter;b.disabled=true;$('resetHash').value='';invalidate();try{const data=await api('password-hash',{password:$('newPassword').value});$('resetHash').value=data.hash;$('newPassword').value='';$('confirmPassword').value='';$('hashStatus').textContent='SHA-512 crypt hash generated with a fresh random salt and 5,000 rounds.';}catch(e){$('hashStatus').textContent=e.message;}finally{b.disabled=false;review();}});
$('passwordType').addEventListener('change',()=>{const expert=$('passwordType').value==='expert';$('resetUsernameField').classList.toggle('hidden',expert);$('resetUsername').required=!expert;clearSecrets();});
$('clearSecrets').addEventListener('click',clearSecrets);$('newPassword').addEventListener('input',()=>{ $('resetHash').value='';validatePasswordMatch();invalidate(); });$('confirmPassword').addEventListener('input',()=>{ $('resetHash').value='';validatePasswordMatch();invalidate(); });$('resetUsername').addEventListener('input',invalidate);$('resetHash').addEventListener('input',invalidate);$('confirmation').addEventListener('input',review);
function renderJob() {
  const {done: finished, succeeded} = renderExecutionResults(job, $('resultRows'));
  $('navResults').textContent=String(job.rows.length);
  $('jobStatus').textContent=`${job.state==='running'?'Running':'Finished'} · ${finished} / ${job.rows.length} targets · ${succeeded} succeeded`;$('exportButton').disabled=job.state==='running';
}
async function pollJob(id) {
  try{job=await api('reset/status',{jobId:id});renderJob();if(job.state==='running'){polling=setTimeout(()=>pollJob(id),1000);}else{busy(false);status('Reset finished. Review every target result and verify a new login.');}}
  catch(e){status(`${e.message} Status will be retried; do not resubmit the reset.`);polling=setTimeout(()=>pollJob(id),5000);}
}
$('resetButton').addEventListener('click',async()=>{if($('resetButton').disabled)return;const body={passwordType:$('passwordType').value,targets:[...selected],username:$('resetUsername').value,hash:$('resetHash').value,confirmation:$('confirmation').value};busy(true);status('Starting password reset…');try{const result=await api('reset/start',body);clearSecrets();showPanel('resultPanel',true);void pollJob(result.jobId);}catch(e){status(e.message);busy(false);}finally{body.hash='';}});
$('exportButton').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(job,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`password-reset-${job.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('logoutButton').addEventListener('click',async()=>{try{await api('logout');clearTimeout(polling);clearSecrets();session=null;targets=[];selected.clear();sic.clear();job=null;$('resultRows').replaceChildren(emptyResultState.cloneNode(true));$('jobStatus').textContent='No reset has been started.';$('navResults').textContent='0';$('exportButton').disabled=true;renderTargets();$('workspace').classList.add('hidden');$('loginCard').classList.remove('hidden');$('loginStatus').textContent='Logged out.';$('loginStatus').className='status-card full-row';}catch(e){status(e.message);}});
review();
