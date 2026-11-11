import { disallowedHashPasswordMessage, identifyHashMethod } from "../../public/password-hash-format.js";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

const methods = new Map([
  ['sha512', { flag: '-6', saltLength: 16, rounds: 5000 }],
  ['sha256', { flag: '-5', saltLength: 16, rounds: 5000 }],
  ['md5', { flag: '-1', saltLength: 8, rounds: 1000 }]
]);

// Keep passwords out of shell commands, process arguments, files and errors.
export async function generatePasswordHash({ password, method = "sha512" } = {}) {
  const error = disallowedHashPasswordMessage(password);
  if (error) throw new Error(error);
  const config = methods.get(method);
  if (!config) throw new Error("Unsupported hash method.");
  const salt = randomBytes(config.saltLength * 3 / 4).toString("base64").replaceAll("+", ".");
  return hashGaiaPassword(password, salt, method);
}

// Separate salt input supports reference-vector tests; the HTTP route always uses random salt.
export async function hashGaiaPassword(password, salt, method = "sha512") {
  const config = methods.get(method);
  if (!config) throw new Error("Unsupported hash method.");
  if (typeof password !== "string" || !password.length) {
    throw new Error("Enter a password.");
  }
  if (/[\r\n\0]/.test(password) || Buffer.byteLength(password, "utf8") > 128) {
    throw new Error("Use a password of at most 128 UTF-8 bytes without line breaks or NUL characters.");
  }
  if (password.includes("*")) {
    throw new Error("Gaia does not support an asterisk (*) in passwords; users with such a password cannot log in. Choose a password without *.");
  }
  if (password.length < 6) throw new Error("Gaia passwords must contain at least 6 characters; the target password policy may require more.");
  if (!/^[./A-Za-z0-9]+$/.test(salt) || salt.length > config.saltLength) throw new Error("Invalid crypt salt.");
  return new Promise((resolve, reject) => {
    const child = spawn("openssl", ["passwd", config.flag, "-salt", salt, "-stdin"], {
      stdio: ["pipe", "pipe", "ignore"]
    });
    let output = "";
    const timeout = setTimeout(() => child.kill(), 5000);
    const fail = () => reject(new Error("Password hashing failed. Install OpenSSL with support for the selected passwd method and try again."));
    child.on("error", () => { clearTimeout(timeout); fail(); });
    child.stdin.on("error", () => {});
    child.stdout.on("data", chunk => {
      output += chunk;
      if (output.length > 1024) child.kill();
    });
    child.on("close", code => {
      clearTimeout(timeout);
      const hash = output.trim();
      if (code !== 0 || identifyHashMethod(hash) !== method) return fail();
      resolve({ hash, algorithm: `${method}-crypt`, rounds: config.rounds });
    });
    child.stdin.end(`${password}\n`);
  });
}
