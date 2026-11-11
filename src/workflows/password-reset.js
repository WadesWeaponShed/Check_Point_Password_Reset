import { detectPlatform } from './platform.js';
import { runWithLockRecovery } from './gaia-lock.js';
import { randomUUID } from 'node:crypto';
import { formatClishPasswordCommand, formatRecoveryPasswordCommand } from '../../public/password-hash-format.js';
const token = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const cluster = o => ['simplecluster', 'cpmigatewaycluster', 'clusterxl'].includes(token(o.type));
const member = o => token(o.type).includes('cluster') && token(o.type).includes('member');
const scalableHint = o => /maestro|elasticxl|scalable|chassis/i.test([o.platform, o.hardware, o.type].filter(Boolean).join(' '));
const gateway = o => token(o.type) === 'simplegateway';
export async function discoverTargets(sessions, sessionId) {
  const session = sessions.get(sessionId);
  if (session.mdsMode && !session.domain) throw new Error('Select a Domain / CMA when connecting to MDS. All-domain resets are not supported.');
  const objects = await sessions.list(sessionId, 'show-gateways-and-servers', {}, 'primary');
  const byName = new Map(objects.map(o => [o.name, o]));
  // This API collection contains Check Point gateways and servers, not ordinary hosts.
  const candidates = objects.filter(o => !cluster(o) || scalableHint(o)).map(o => ({ ...o }));
  const warnings = [];
  for (const c of objects.filter(o => cluster(o) && !scalableHint(o))) {
    let detail = c;
    if (!(c['cluster-members'] || c['cluster-member-names'] || c.members)?.length) {
      try { detail = await sessions.command(sessionId, 'show-simple-cluster', { name: c.name, 'details-level': 'full' }, 'primary'); }
      catch { warnings.push(`Could not expand cluster ${c.name}. Its undiscovered members cannot be selected.`); continue; }
    }
    const refs = detail['cluster-members'] || detail.members || detail['cluster-member-names'] || [];
    if (!refs.length) warnings.push(`No members returned for cluster ${c.name}.`);
    for (const ref of refs) {
      const name = typeof ref === 'string' ? ref : ref.name;
      const resolved = byName.get(name) || (typeof ref === 'object' ? ref : { name });
      if (resolved.name) candidates.push({ ...resolved, cluster: c.name, type: 'cluster-member' });
      else warnings.push(`An unnamed member of ${c.name} could not be resolved.`);
    }
  }
  const targets = [...new Map(candidates.filter(o => o.name).map(o => [o.name, {
    id: o.uid || o.name, name: o.name, ip: o['ipv4-address'] || o['ip-address'] || '',
    kind: member(o) ? 'Cluster member' : gateway(o) ? 'Gateway' : 'Check Point server', objectType: o.type || '', platformHint: [o.type,o.platform,o.hardware,o['os-name']].filter(Boolean).join(' '), cluster: o.cluster || ''
  }])).values()].sort((a,b) => a.name.localeCompare(b.name));
  session.passwordTargets = new Map(targets.map(t => [t.id, t]));
  return { targets, warnings };
}
export function selectedTargets(session, ids) {
  if (!Array.isArray(ids) || !ids.length) throw new Error('Select at least one gateway, cluster member, or Check Point server.');
  return [...new Set(ids)].map(id => {
    const target = session.passwordTargets?.get(id);
    if (!target) throw new Error('Target inventory changed. Discover targets again.');
    return target;
  });
}
async function readHashMethod(sessions, sessionId, target, shell) {
  if (!['clish', 'gclish'].includes(shell)) return null;
  try {
    const response = await sessions.runScript(sessionId, {
      'script-name': 'Read Gaia password hashing method',
      script: `${shell} -c 'show password-controls password-hash-type'`,
      targets: [target.name]
    }, 'primary');
    if (response.completion !== 'succeeded') return null;
    const methods = new Set();
    for (const line of (response.output || '').split(/\r?\n/)) {
      const match = line.trim().match(/^(?:(?:password hashing algorithm|password.hash.type)\s*[:=]?\s*)?(SHA[- ]?256|SHA[- ]?512|BCRYPT|MD5)$/i);
      if (match) methods.add(match[1].toUpperCase().replace(/[- ]/g, ''));
    }
    return methods.size === 1 ? [...methods][0] : null;
  } catch { return null; }
}
export async function testSic(sessions, sessionId, target, checkHash = false) {
  try {
    const raw = await sessions.command(sessionId, 'test-sic-status', { name: target.name }, 'primary');
    const status = raw['sic-status'] ?? raw.sicStatus ?? 'unknown';
    const platform = token(status) === 'communicating' ? await detectPlatform(sessions, sessionId, target) : { platform: 'unverified', platformReady: false, platformLabel: 'Not checked' };
    if (platform.platform === 'scalable' && target.kind === 'Cluster member') { platform.platformReady = false; platform.platformMessage = 'This member resolves to a Security Group. Select the group’s logical management object to avoid duplicate group-wide resets.'; }
    Object.assign(target, platform);
    const hashMethod = checkHash && token(status) === 'communicating'
      ? await readHashMethod(sessions, sessionId, target, platform.shell) : null;
    return { ...target, hashMethod, status: String(status), communicating: token(status) === 'communicating', message: String(raw['sic-message'] || '') };
  } catch { return { ...target, status: 'Test failed', communicating: false, message: 'SIC test failed. Check connectivity and API permissions.' }; }
}
async function workers(items, limit, work) {
  let index = 0;
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, async () => {
    while (index < items.length) { const item = items[index++]; await work(item); }
  }));
}
export function buildResetScript(username, hash, passwordType = 'user', shell = 'clish') {
  const command = formatClishPasswordCommand(username, hash, passwordType, shell).replace(`${shell} -c `, `${shell} -s -c `);
  // Inputs are validated above; single quotes preserve the crypt hash literally.
  const verification = passwordType === 'user' && shell === 'clish' ? [
    `if verdict=$(awk -F: -v user='${username}' -v expected='${hash}' '`,
    '  function rounds(parts) { return parts[2] == "1" ? 1000 : (parts[3] ~ /^rounds=[0-9]+$/ ? substr(parts[3], 8) + 0 : 5000) }',
    '  $1 == user { count++; stored = $2 }',
    '  END {',
    '    if (!count) { print "USER_NOT_FOUND"; exit }',
    '    if (count != 1) { print "UNAVAILABLE"; exit }',
    '    if ("x" stored == "x" expected) { print "MATCH"; exit }',
    '    if (stored ~ /^[!*]/) { print "MISMATCH LOCKED"; exit }',
    '    if (stored !~ /^[$][156][$](rounds=[0-9]+[$])?[.\\/A-Za-z0-9]+[$][.\\/A-Za-z0-9]+$/) { print "MISMATCH OTHER_FORMAT"; exit }',
    '    n = split(stored, actual, /[$]/); m = split(expected, wanted, /[$]/)',
    '    printf "MISMATCH %s %s %s %s %s\\n", actual[2], (actual[2] == wanted[2] ? "SAME" : "DIFFERENT"), (rounds(actual) == rounds(wanted) ? "SAME" : "DIFFERENT"), ("x" actual[n-1] == "x" wanted[m-1] ? "SAME" : "DIFFERENT"), ("x" actual[n] == "x" wanted[m] ? "SAME" : "DIFFERENT")',
    '  }',
    "' /etc/shadow 2>/dev/null); then",
    '  case "$verdict" in MATCH|MISMATCH|USER_NOT_FOUND|UNAVAILABLE|MISMATCH\\ *) ;; *) verdict=UNAVAILABLE ;; esac',
    'else verdict=UNAVAILABLE; fi',
    'printf "CP_HASH_VERIFY_%s\\n" "$verdict"'
  ] : [];
  return [
    `out=$(${command} 2>&1)`,
    'rc=$?',
    // Redact on the gateway, before stdout becomes a retained Management API task.
    `safe=$(printf '%s' "$out" | sed 's|\\$[156]\\$[./A-Za-z0-9$=]*|[redacted hash]|g')`,
    `if [ "$rc" -ne 0 ] || printf '%s' "$out" | grep -Eiq 'CLINFR|CLISH|error|failed|invalid|denied|not found|does not exist|not allowed|locked'; then`,
    `  printf 'CP_RESET_FAILED (clish exit %s)\\n%s\\n' "$rc" "$safe"`,
    '  exit 1',
    'fi',
    `printf 'CP_RESET_SAVED\\n'`,
    ...verification
  ].join('\n');
}
export function buildRecoveryScript(username, password, shell = 'clish') {
  const command = formatRecoveryPasswordCommand(username, password, shell);
  return [
    'set +x',
    `out=$(${command} 2>&1)`,
    'rc=$?',
    // Never return raw Clish diagnostics: they can echo the plaintext command.
    `if printf '%s' "$out" | grep -Eiq 'CLINFR0771|CLINFR0519|config(uration)? lock (is owned|present)|lock database override'; then`,
    "  printf 'CP_RESET_FAILED configuration lock present\\n'; exit 1",
    'fi',
    `if [ "$rc" -ne 0 ] || printf '%s' "$out" | grep -Eiq 'CLINFR|CLISH|error|failed|invalid|denied|not found|does not exist|not allowed|locked'; then`,
    "  printf 'CP_RESET_FAILED password command rejected; check password policy and user existence\\n'; exit 1",
    'fi',
    `out=$(${shell} -c 'save config' 2>&1)`,
    'rc=$?',
    `if [ "$rc" -ne 0 ] || printf '%s' "$out" | grep -Eiq 'CLINFR|CLISH|error|failed|invalid|denied|locked'; then`,
    "  printf 'CP_RESET_FAILED configuration save unverified; password may already be changed\\n'; exit 1",
    'fi',
    "printf 'CP_RESET_SAVED\\n'"
  ].join('\n');
}
export function startResetJob(sessions, sessionId, body) {
  const session = sessions.get(sessionId);
  const targets = selectedTargets(session, body.targets);
  if (body.confirmation !== `RESET ${targets.length}`) throw new Error(`Type RESET ${targets.length} to confirm.`);
  const passwordType = body.passwordType ?? 'user';
  const recovery = passwordType === 'recovery';
  if (recovery) formatRecoveryPasswordCommand(body.username, body.password);
  else formatClishPasswordCommand(body.username, body.hash, passwordType);
  session.passwordJobs ||= new Map();
  if ([...session.passwordJobs.values()].some(j => j.state === 'running')) throw new Error('A reset is already running. Wait for it to finish.');
  const job = { id: randomUUID(), state: 'running', passwordType, username: passwordType === 'expert' ? null : body.username, startedAt: new Date().toISOString(), rows: targets.map(t => ({ ...t, reviewedPlatform: t.platform, status: 'Queued', message: '' })) };
  session.passwordJobs.set(job.id, job);
  // Limit retained results. No password or hash is retained in job records.
  for (const [id, previous] of session.passwordJobs) if (session.passwordJobs.size > 10 && previous.state !== 'running') session.passwordJobs.delete(id);
  void workers(job.rows, session.largeEnvironmentMode ? 3 : 8, async row => {
    try {
      row.status = 'Testing SIC';
      const sic = await testSic(sessions, sessionId, row);
      if (!sic.communicating) { row.status = 'Skipped'; row.message = `SIC: ${sic.status}. ${sic.message}`; return; }
      row.platform = sic.platform; row.shell = sic.shell; row.memberEvidence = sic.memberEvidence;
      if (!sic.platformReady) { row.status = 'Skipped'; row.message = sic.platformMessage || 'Platform unverified. Reset blocked.'; return; }
      if (row.reviewedPlatform && row.reviewedPlatform !== sic.platform) { row.status = 'Skipped'; row.message = 'Platform changed since review. Refresh inventory and review the scope again.'; return; }
      row.status = 'Applying';
      const script = recovery ? buildRecoveryScript(body.username, body.password, sic.shell) : buildResetScript(body.username, body.hash, passwordType, sic.shell);
      const response = await runWithLockRecovery({ sessions, sessionId, target: row.name, shell: sic.shell, body: { 'script-name': recovery ? 'Gaia user password recovery' : passwordType === 'expert' ? 'Gaia Expert password reset' : 'Gaia user password reset', script }, onProgress: status => { row.status = status; } });
      const secret = recovery ? body.password : body.hash;
      const safe = JSON.stringify(response).replaceAll(secret, '[redacted secret]').replaceAll(JSON.stringify(secret).slice(1, -1), '[redacted secret]').replaceAll(secret.replaceAll('$', '\\$'), '[redacted secret]');
      row.details = recovery ? {
        completion: response.completion,
        taskSummary: (response.taskSummary || []).map(task => ({ id: task.id, status: task.status, progress: task.progress })),
        lockRecovery: (response.lockRecovery || []).map(attempt => ({ phase: attempt.phase, completion: attempt.completion })),
        note: 'Raw manager diagnostics omitted for plaintext password recovery.'
      } : JSON.parse(safe);
      const output = response.output.trim();
      const verifiesHash = passwordType === 'user' && sic.shell === 'clish';
      const storedHash = verifiesHash && output.match(/^CP_RESET_SAVED\r?\nCP_HASH_VERIFY_(MATCH|MISMATCH|USER_NOT_FOUND|UNAVAILABLE)(?: (LOCKED|OTHER_FORMAT|[156] (?:SAME|DIFFERENT)(?: (?:SAME|DIFFERENT)){3}))?$/);
      const saved = response.completion === 'succeeded' && (output === 'CP_RESET_SAVED' || !!storedHash);
      if (saved && verifiesHash) row.hashVerification = storedHash?.[1] || 'UNAVAILABLE';
      if (saved && row.hashVerification === 'MISMATCH' && storedHash?.[2]) {
        const [format, algorithm, rounds, salt, digest] = storedHash[2].split(' ');
        row.hashMismatch = { format, algorithm, rounds, salt, digest };
      }
      if (saved && sic.shell === 'gclish') {
        row.status = 'Verifying Security Group';
        const verification = await detectPlatform(sessions, sessionId, row);
        row.details.groupVerification = verification;
        if (!verification.platformReady || verification.platform !== 'scalable' || verification.memberCount !== sic.memberCount) { row.status = 'Unknown'; row.message = 'Global password command completed, but Security Group availability changed or could not be verified afterward. Check all members before retrying.'; return; }
      }
      if (saved) { row.status = 'Succeeded'; row.message = sic.shell === 'gclish' ? 'Group-wide gClish password command completed and configuration saved. Verify access on all members.' : recovery ? 'Recovery password applied and configuration saved. Verify a new login.' : 'Password hash applied and configuration saved.'; }
      else { row.status = response.completion === 'unknown' ? 'Unknown' : 'Failed'; row.message = response.recoveryMessage || (response.completion === 'unknown' ? 'Completion unverified. The task may still be running. Check the gateway before retrying.' : 'Reset or save could not be verified. Inspect task details; the password may already have changed.'); }
    } catch { row.status = 'Unknown'; row.message = 'Execution could not be verified. Check the gateway before retrying.'; }
  }).finally(() => { body.password = ''; body.hash = ''; job.state = 'complete'; job.finishedAt = new Date().toISOString(); });
  return { jobId: job.id };
}
export async function runSicTests(sessions, sessionId, ids) {
  const session = sessions.get(sessionId);
  const rows = [];
  await workers(selectedTargets(session, ids), session.largeEnvironmentMode ? 4 : 8, async t => rows.push(await testSic(sessions, sessionId, t, true)));
  return { rows };
}
