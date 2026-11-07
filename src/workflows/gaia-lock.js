// Adapted from Hardening App runGaiaConfigCommandWithLockOverride.
export function hasConfigLockError(response) {
  const text = [response.output, ...(response.taskSummary || []).flatMap(task => [task.statusDescription, ...(task.executions || []).map(execution => execution.message)])].join('\n');
  return /CLINFR0771|CLINFR0519|config(?:uration)? lock (?:is owned|present)|lock database override/i.test(text);
}
export async function runWithLockRecovery({ sessions, sessionId, target, body, shell = 'clish', onProgress = () => {}, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  if (!['clish', 'gclish'].includes(shell)) throw new Error('Invalid Gaia shell.');
  const attempts = [];
  const run = async (request, phase) => {
    const response = await sessions.runScript(sessionId, { ...request, targets: [target] }, 'primary');
    attempts.push({ phase, ...response });
    return response;
  };
  let response = await run(body, 'Password reset');
  // Unknown completion may still be running: never override or resubmit it.
  for (const [index, delay] of [1500, 2500, 4000].entries()) {
    if (response.completion !== 'failed' || !hasConfigLockError(response)) break;
    onProgress('Acquiring configuration lock');
    const override = await run({ 'script-name': 'lock database override', script: `${shell} -c "lock database override"` }, 'Lock override');
    const diagnostics = [override.output, ...(override.taskSummary || []).flatMap(task => [task.statusDescription, ...(task.errors || [])])].join('\n');
    // Clish can emit CLINFR0771 on startup, then successfully execute the override.
    // Preserve the warning in diagnostics, but do not mistake it for command failure.
    const overrideErrors = diagnostics.replace(/CLINFR0771(?:(?!CLINFR)[^\r\n])*/g, '');
    if (override.completion !== 'succeeded' || /CLINFR|\berror\b|\bfailed\b|\bdenied\b/i.test(overrideErrors)) {
      return { ...override, completion: override.completion === 'unknown' ? 'unknown' : 'failed', lockRecovery: attempts, recoveryMessage: 'Configuration lock override could not be verified. No password retry was submitted.' };
    }
    onProgress(`Waiting for configuration lock (retry ${index + 1} of 3)`);
    await sleep(delay);
    onProgress('Applying');
    response = await run(body, `Password retry ${index + 1}`);
  }
  return { ...response, ...(attempts.length > 1 ? { lockRecovery: attempts } : {}) };
}
