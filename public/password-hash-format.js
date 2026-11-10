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

// Conservative single-token Clish input: shell metacharacters remain inside
// a shell-quoted command, and Clish never receives whitespace or quote syntax.
export function formatRecoveryPasswordCommand(username, password, shell = 'clish') {
  if (!['clish', 'gclish'].includes(shell)) throw new Error('Invalid Gaia shell.');
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(username)) throw new Error('Enter a valid Gaia username.');
  if (typeof password !== 'string' || !/^[A-Za-z0-9@%_+=:,./?-]{6,128}$/.test(password)) {
    throw new Error('Recovery passwords must be 6–128 characters using letters, digits, or @ % _ + = : , . / ? - . Check the target password policy.');
  }
  return `${shell} -c 'set user ${username} newpass ${password}'`;
}
