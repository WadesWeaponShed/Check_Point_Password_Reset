const terminal = new Set(['Succeeded', 'Failed', 'Unknown', 'Skipped']);
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function time(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit', second:'2-digit' });
}
function stateClass(status) {
  return ({Succeeded:'succeeded',Failed:'failed',Unknown:'unknown',Skipped:'skipped'})[status] || 'pending';
}
export function renderExecutionResults(job, root) {
  // Polls update text without collapsing a disclosure the operator is reading.
  const focusedKey = root.contains(document.activeElement) ? document.activeElement.closest('details')?.dataset.detailKey : null;
  const opened = new Set([...root.querySelectorAll('details[open]')].map(node => node.dataset.detailKey));
  root.replaceChildren();
  const rows = job.rows || [], done = rows.filter(row => terminal.has(row.status)).length;
  const succeeded = rows.filter(row => row.status === 'Succeeded').length;
  const failed = rows.filter(row => row.status === 'Failed').length;
  const unknown = rows.filter(row => row.status === 'Unknown').length;
  const skipped = rows.filter(row => row.status === 'Skipped').length;
  const running = job.state === 'running';
  const allSucceeded = !running && rows.length > 0 && succeeded === rows.length;
  const outcome = element('section', `execution-outcome ${allSucceeded ? 'success' : running ? 'running' : 'attention'}`);
  const icon = element('span', 'outcome-symbol'); icon.setAttribute('aria-hidden','true');
  icon.innerHTML = allSucceeded ? '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M12 7v6M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>';
  const copy = element('div');
  copy.append(element('h3', '', running ? 'Password change in progress' : allSucceeded ? 'Password change completed' : 'Review target outcomes'));
  const account = job.passwordType === 'expert' ? 'Expert mode password' : `Gaia user: ${job.username || 'Not recorded'}`;
  copy.append(element('p', '', `${account} · ${rows.length} target${rows.length === 1 ? '' : 's'}`));
  outcome.append(icon,copy);root.append(outcome);
  const meta = element('dl','execution-meta');
  const duration = job.finishedAt && job.startedAt ? Math.round((new Date(job.finishedAt) - new Date(job.startedAt))/1000) : null;
  for (const [label,value] of [['Started',time(job.startedAt)],['Finished',running ? 'In progress' : job.finishedAt ? time(job.finishedAt) : 'Not recorded'],...(Number.isFinite(duration) && duration >= 0 ? [['Duration',`${duration}s`]] : [])]) {
    const pair=element('div');pair.append(element('dt','',label),element('dd','',value));meta.append(pair);
  }
  root.append(meta);
  const counts=element('div','execution-counts');
  for (const [label,count,cls] of [['Succeeded',succeeded,'succeeded'],['Failed',failed,'failed'],['Unknown',unknown,'unknown'],['Skipped',skipped,'skipped'],['Pending',rows.length-done,'pending']]) {
    if (count || label === 'Succeeded') {const item=element('span',`execution-count ${cls}`);item.append(element('strong','',String(count)),document.createTextNode(` ${label.toLowerCase()}`));counts.append(item);}
  }
  root.append(counts);
  const list=element('div','execution-targets');
  const priority = {Unknown:0, Failed:1, Skipped:3, Succeeded:4};
  const ordered = [...rows].sort((a,b)=>(priority[a.status] ?? 2)-(priority[b.status] ?? 2)||a.name.localeCompare(b.name));
  for (const row of ordered) {
    const index = row.id || row.name;
    const article=element('article','execution-target');
    const head=element('div','execution-target-head');
    head.append(element('h4','',row.name),element('span',`status ${stateClass(row.status)}`,row.status));
    article.append(head);
    const identity=[row.ip,row.kind,row.cluster,row.shell === 'gclish' ? 'Group-wide gClish' : row.shell === 'clish' ? 'Local Gaia Clish' : ''].filter(Boolean).join(' · ');
    if(identity)article.append(element('p','execution-identity',identity));
    article.append(element('p','execution-message',row.message || (terminal.has(row.status) ? 'No additional message returned.' : 'Waiting for the manager to return the task result.')));
    const recovery=row.details?.lockRecovery;
    if(recovery?.length) {
      const details=element('details','recovery-details');details.dataset.detailKey=`${index}-recovery`;details.open=opened.has(details.dataset.detailKey);
      const overrides=recovery.filter(step=>step.phase==='Lock override').length;
      details.append(element('summary','',`Configuration lock recovery · ${overrides} override${overrides===1?'':'s'}`));
      const steps=element('ol','execution-steps');
      for(const step of recovery){const li=element('li');li.append(element('span','',step.phase),element('span',`status ${stateClass(step.completion==='succeeded'?'Succeeded':step.completion==='failed'?'Failed':'Unknown')}`,step.completion || 'Unknown'));steps.append(li);}
      details.append(steps);article.append(details);
    }
    if(row.details){const details=element('details','raw-execution');details.dataset.detailKey=`${index}-raw`;details.open=opened.has(details.dataset.detailKey);details.append(element('summary','','Technical details · secrets redacted'),element('pre','',JSON.stringify(row.details,null,2)));article.append(details);}
    list.append(article);
  }
  root.append(list);
  if(!running) {
    const footer=element('div','execution-next');
    footer.append(element('p','',allSucceeded ? `Next: verify ${job.passwordType==='expert'?'Expert access':'a new Gaia login'} on each changed target before closing your recovery session.` : 'Inspect failed or unknown outcomes before retrying. A password may already have changed.'));
    const button=element('button','', 'Back to Targets');button.type='button';button.dataset.go='targetPanel';footer.append(button);root.append(footer);
  }
  if (focusedKey) [...root.querySelectorAll('details')].find(node => node.dataset.detailKey === focusedKey)?.querySelector('summary')?.focus({preventScroll:true});
  return {done,succeeded};
}
