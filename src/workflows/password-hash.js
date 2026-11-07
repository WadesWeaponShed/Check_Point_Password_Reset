import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

// Keep passwords out of shell commands, process arguments, files and errors.
export async function generatePasswordHash({ password } = {}) {
  // Conservative app compatibility policy based on sk109148's Clish restrictions.
  // Applies to plaintext only, never the $ separators in a crypt hash.
  if (typeof password === "string" && /[!\\$#'"]/.test(password)) {
    throw new Error("For Gaia compatibility, passwords in this tool cannot contain !, backslash, $, #, single quote, or double quote. See Check Point sk109148.");
  }
  const salt = randomBytes(12).toString("base64").replaceAll("+", ".");
  return hashGaiaPassword(password, salt);
}

// Separate salt input supports reference-vector tests; the HTTP route always uses random salt.
export async function hashGaiaPassword(password, salt) {
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
  if (!/^[./A-Za-z0-9]{2,16}$/.test(salt)) throw new Error("Invalid SHA-512 crypt salt.");
  return new Promise((resolve, reject) => {
    const child = spawn("openssl", ["passwd", "-6", "-salt", salt, "-stdin"], {
      stdio: ["pipe", "pipe", "ignore"]
    });
    let output = "";
    const timeout = setTimeout(() => child.kill(), 5000);
    const fail = () => reject(new Error("Password hashing failed. Install OpenSSL with support for passwd -6 and try again."));
    child.on("error", () => { clearTimeout(timeout); fail(); });
    child.stdin.on("error", () => {});
    child.stdout.on("data", chunk => {
      output += chunk;
      if (output.length > 1024) child.kill();
    });
    child.on("close", code => {
      clearTimeout(timeout);
      const hash = output.trim();
      if (code !== 0 || !/^\$6\$[./A-Za-z0-9]{2,16}\$[./A-Za-z0-9]{86}$/.test(hash)) return fail();
      resolve({ hash, algorithm: "sha512-crypt", rounds: 5000 });
    });
    child.stdin.end(`${password}\n`);
  });
}
