// Shell command formatting only; this module never executes a command.
export function formatClishPasswordCommand(username, hash, passwordType = 'user', shell = 'clish') {
  if (!['clish', 'gclish'].includes(shell)) throw new Error('Invalid Gaia shell.');
  if (!['user', 'expert'].includes(passwordType)) throw new Error('Invalid password type.');
  if (passwordType === 'user' && !/^[A-Za-z0-9_-]{1,32}$/.test(username)) {
    throw new Error('Enter a Gaia username of 1–32 letters, digits, underscores or hyphens.');
  }
  if (!/^\$6\$[./A-Za-z0-9]{16}\$[./A-Za-z0-9]{86}$/.test(hash)) {
    throw new Error('Generate a valid SHA-512 crypt hash first.');
  }
  const escaped = hash.replaceAll('$', '\\$');
  return passwordType === 'expert'
    ? `${shell} -c "set expert-password-hash ${escaped}"`
    : `${shell} -c "set user ${username} password-hash ${escaped}"`;
}
