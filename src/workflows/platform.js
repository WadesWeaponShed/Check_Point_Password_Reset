// Read-only platform probe, submitted only via the connected manager.
export const PLATFORM_PROBE = `if command -v gclish >/dev/null 2>&1 || command -v asg >/dev/null 2>&1; then
  if ! command -v gclish >/dev/null 2>&1 || ! command -v asg >/dev/null 2>&1; then
    printf 'CP_PLATFORM_UNVERIFIED\\n'; exit 0
  fi
  summary=$(asg stat 2>&1); summary_rc=$?
  members=$(asg stat -i sgm_info 2>&1); members_rc=$?
  if [ "$summary_rc" -eq 0 ] && [ "$members_rc" -eq 0 ]; then
    printf 'CP_PLATFORM_SCALABLE\\n%s\\nCP_MEMBER_INFO\\n%s\\n' "$summary" "$members"
  else
    printf 'CP_PLATFORM_UNVERIFIED\\n%s\\n%s\\n' "$summary" "$members"
  fi
else
  version=$(clish -c "show version all" 2>&1); rc=$?
  if [ "$rc" -eq 0 ]; then printf 'CP_PLATFORM_STANDARD\\n%s\\n' "$version"; else printf 'CP_PLATFORM_UNVERIFIED\\n%s\\n' "$version"; fi
fi`;
export function classifyPlatform(response, hint = '') {
  const output = response.output || '';
  const unknown = { platform: 'unverified', shell: '', platformLabel: 'Unverified — reset blocked', platformReady: false, memberEvidence: output, platformMessage: 'Platform could not be confirmed. No local Clish fallback is allowed.' };
  if (response.completion !== 'succeeded') return unknown;
  if (output.startsWith('CP_PLATFORM_SCALABLE\n')) {
    const [summary, members = ''] = output.slice('CP_PLATFORM_SCALABLE\n'.length).split('\nCP_MEMBER_INFO\n');
    const count = summary.match(/\bSGMs\s*\|\s*(\d+)\s*\/\s*(\d+)/i);
    if (!/SGM|Security Group|member/i.test(members) || /command not found|permission denied|not supported|\berror\b/i.test(summary + members)) return unknown;
    const healthy = Boolean(count && Number(count[2]) > 0 && count[1] === count[2]);
    return { platform: 'scalable', shell: 'gclish', platformLabel: /Maestro/i.test(summary) ? 'Maestro Security Group' : 'Scalable Security Group', platformReady: healthy, membersUp: count ? Number(count[1]) : null, memberCount: count ? Number(count[2]) : null, memberEvidence: output, platformMessage: healthy ? 'Group-wide gClish. All members reported available.' : 'Member availability could not be fully verified. Group reset blocked.' };
  }
  if (output.startsWith('CP_PLATFORM_STANDARD\n') && /Gaia/i.test(output) && !/maestro|elasticxl|scalable|chassis/i.test(hint + output)) {
    return { platform: 'standard', shell: 'clish', platformLabel: 'Standard Gaia', platformReady: true, platformMessage: 'Local Gaia Clish.', memberEvidence: output };
  }
  return unknown;
}
export async function detectPlatform(sessions, sessionId, target) {
  try {
    const response = await sessions.runScript(sessionId, { 'script-name': 'Read-only Gaia platform and Security Group check', script: PLATFORM_PROBE, targets: [target.name] }, 'primary');
    return classifyPlatform(response, target.platformHint);
  } catch { return classifyPlatform({ completion: 'unknown' }); }
}
