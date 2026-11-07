import { formatClishPasswordCommand } from './password-hash-format.js';

(() => {
  const form = document.querySelector('#passwordHashForm');
  const password = document.querySelector('#hashPassword');
  const confirmation = document.querySelector('#hashPasswordConfirm');
  const result = document.querySelector('#passwordHashResult');
  const status = document.querySelector('#passwordHashStatus');
  const generate = form.querySelector('[type=submit]');
  const copy = document.querySelector('#copyPasswordHash');
  const username = document.querySelector('#hashUsername');
  const command = document.querySelector('#passwordHashCommand');
  const copyCommand = document.querySelector('#copyPasswordHashCommand');
  function updateCommand() {
    command.value = '';
    copyCommand.disabled = true;
    if (!result.value) return;
    try {
      command.value = formatClishPasswordCommand(username.value, result.value);
      copyCommand.disabled = false;
    } catch (error) { status.textContent = error.message; }
  }
  username.addEventListener('input', updateCommand);
  copyCommand.addEventListener('click', async () => {
    updateCommand();
    if (copyCommand.disabled) return;
    try {
      await navigator.clipboard.writeText(command.value);
      status.textContent = 'Clish command copied with escaped dollar signs. Running it changes the account password.';
    } catch {
      command.focus();
      command.select();
      status.textContent = 'Clipboard unavailable. Copy the selected Clish command manually.';
    }
  });
  let request = 0;
  const validHash = value => typeof value === 'string' && /^\$6\$[./A-Za-z0-9]{16}\$[./A-Za-z0-9]{86}$/.test(value);

  function invalidate() {
    request += 1;
    result.value = '';
    command.value = '';
    copyCommand.disabled = true;
    copy.disabled = true;
    generate.disabled = false;
    status.textContent = 'Ready. Each hash uses a new random salt and 5,000 rounds.';
  }
  function clear() {
    invalidate();
    form.reset();
  }
  password.addEventListener('input', invalidate);
  confirmation.addEventListener('input', invalidate);
  document.querySelector('#clearPasswordHash').addEventListener('click', () => { clear(); password.focus(); });
  document.querySelector('#passwordHashPanel').addEventListener('password-hash-leave', clear);
  document.querySelector('#logoutButton').addEventListener('click', clear);
  window.addEventListener('pagehide', clear);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    invalidate();
    if (password.value.includes('*')) {
      status.textContent = 'Gaia does not support an asterisk (*) in passwords. Choose a password without *.';
      password.focus();
      return;
    }
    if (password.value !== confirmation.value) {
      status.textContent = 'Passwords do not match.';
      confirmation.focus();
      return;
    }
    const current = request;
    generate.disabled = true;
    status.textContent = 'Generating hash…';
    try {
      const response = await fetch('/api/password-hash', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: password.value })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not generate hash.');
      if (current !== request) return;
      if (!validHash(data.hash)) throw new Error('Invalid hash received: expected 106 characters without spaces or line breaks. Generate again.');
      result.value = data.hash;
      copy.disabled = false;
      updateCommand();
      status.textContent = 'Hash generated: 106 characters, no whitespace. Password inputs cleared.';
    } catch (error) {
      if (current === request) status.textContent = error.message;
    } finally {
      if (current === request) {
        password.value = '';
        confirmation.value = '';
        generate.disabled = false;
      }
    }
  });
  copy.addEventListener('click', async () => {
    if (!validHash(result.value)) {
      copy.disabled = true;
      status.textContent = 'Invalid hash: copy blocked. Generate a new hash.';
      return;
    }
    try {
      await navigator.clipboard.writeText(result.value);
      status.textContent = 'Copied exactly 106 characters with no spaces or line breaks.';
    } catch {
      result.focus();
      result.select();
      status.textContent = 'Clipboard unavailable. Copy the selected hash manually.';
    }
  });
})();
