import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { apiUrl, normalizeBaseUrl } from "../src/check-point-client.js";
import { SessionManager } from "../src/session-manager.js";

test("self-signed certificates default on while explicit TLS verification is preserved for every management type", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /<input\b[^>]*name="ignoreTls"[^>]*\bchecked\b/);
  class TlsClient {
    constructor(options) { Object.assign(this, options); }
    withSid(sid) { return new TlsClient({ ...this, sid }); }
    async command() { return { sid: "test-sid" }; }
  }
  for (const mode of [{}, { smart1Cloud: true }, { mdsMode: true, domain: "Domain-A" }]) {
    for (const ignoreTls of [undefined, true, false]) {
      const sessions = new SessionManager({ clientFactory: options => new TlsClient(options) });
      const login = await sessions.login({ host: "example.com", username: "admin", password: "test", ...mode, ...(ignoreTls === undefined ? {} : { ignoreTls }) });
      for (const [context, state] of Object.entries(login.contexts)) {
        if (state.available) assert.equal(sessions.client(login.sessionId, context).rejectUnauthorized, ignoreTls === false);
      }
      await sessions.logout(login.sessionId);
    }
  }
});

import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CatalogManager, parseVersions, compareVersions, catalogDiff } from "../src/catalog-manager.js";
import { parseReleaseMapping, buildCatalog } from "../scripts/generate-command-catalog.mjs";

test("official version discovery orders numerically and parses release mappings without executing code", () => {
  assert.deepEqual(parseVersions('var versions=[{"key":"v2.10"},{"key":"v2.2"},{"key":"v2.2"}]; throw Error("never execute");'), ["v2.2", "v2.10"]);
  assert.ok(compareVersions("v1.9.1", "v1.9") > 0);
  assert.throws(() => parseVersions("unrecognized"), /Unrecognized/);
  assert.deepEqual(parseReleaseMapping('<table id="versions-releases"><tr><td>v2.2</td><td><a>R82.20</a></td></tr></table>'), { "v2.2": "R82.20" });
});

test("explicit version URLs preserve SMS and Smart-1 Cloud paths", () => {
  assert.equal(apiUrl({ baseUrl: "https://mgmt.example.com" }, "show-hosts", "v2.2").pathname, "/web_api/v2.2/show-hosts");
  assert.equal(apiUrl({ baseUrl: "https://tenant.example.com/context/web_api", smart1Cloud: true }, "show-hosts", "v2.1").pathname, "/context/web_api/v2.1/show-hosts");
  assert.throws(() => apiUrl({ baseUrl: "https://mgmt.example.com" }, "show-hosts", "../../"), /Invalid/);
});

test("catalog update persists valid versions, reports diffs, and preserves working catalogs on malformed downloads", async () => {
  const root = await mkdtemp(join(tmpdir(), "cp-catalog-test-"));
  const bundle = join(root, "bundle"), cache = join(root, "cache");
  await mkdir(bundle);
  const source = { commands: [{ name: { web: "show-hosts" }, type: "show" }], objects: [] };
  const initial = buildCatalog(source, { chapters: [] }, "v2.1");
  await writeFile(join(bundle, "check-point-api-v2.1.json"), JSON.stringify(initial));
  let corrupt = false;
  const fetcher = async url => ({ ok: true, text: async () => {
    if (url.endsWith("versions.js")) return 'var versions=[{"key":"v2.1"},{"key":"v2.2"}];';
    if (url.endsWith("api_versions.html")) return '<table id="versions-releases"><tr><td>v2.2</td><td>R82.20</td></tr></table>';
    if (url.endsWith("content.json")) return JSON.stringify({ chapters: [] });
    if (corrupt && url.includes("v2.2")) return '{"commands": []}';
    return JSON.stringify(url.includes("v2.2") ? { ...source, commands: [...source.commands, { name: { web: "add-host" }, type: "add" }] } : source);
  } });
  try {
    const manager = await new CatalogManager({ directory: cache, bundled: bundle, fetcher }).init();
    const first = manager.update();
    assert.equal(first, manager.update(), "concurrent update calls share a job");
    const status = await first;
    assert.deepEqual(status.installed, ["v2.1", "v2.2"]);
    assert.deepEqual(status.changes.find(c => c.version === "v2.2").added, ["add-host"]);
    assert.deepEqual(status.versionChanges.find(c => c.version === "v2.2").added, ["add-host"]);
    const repeated = await manager.update();
    assert.deepEqual(repeated.changes.find(c => c.version === "v2.2").added, []);
    assert.deepEqual(repeated.versionChanges.find(c => c.version === "v2.2").added, ["add-host"]);
    assert.equal(manager.get("v2.2").release, "R82.20");
    assert.deepEqual(manager.get("v2.2").commands.find(c=>c.name === "show-hosts").documentedVersions, ["v2.1","v2.2"]);
    corrupt = true;
    await assert.rejects(manager.update(), /schema/);
    assert.equal(manager.get("v2.2").commandCount, 2);
    const restored = await new CatalogManager({ directory: cache, bundled: bundle, fetcher }).init();
    assert.equal(restored.get("v2.2").commandCount, 2);
    const changed = structuredClone(initial);
    changed.commands[0].deprecated = true;
    assert.deepEqual(catalogDiff(initial, changed).deprecated, ["show-hosts"]);
    assert.throws(()=>manager.get("../invalid"), /not installed/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("context capability negotiation rejects unsupported versions and pins script task polls", async () => {
  const calls = [];
  class VersionClient {
    constructor(options) { Object.assign(this, options); }
    withSid(sid) { return new VersionClient({ ...this, sid }); }
    async command(command, body, version) {
      calls.push({ command, version, sid: this.sid });
      if (command === "login") return { sid: body.domain || "primary" };
      if (command === "show-api-versions") return { "supported-versions": this.sid === "Global" ? ["2.1"] : ["2.1","2.2"], "current-version": "2.2" };
      if (command === "run-script") return { tasks: [{ "task-id": "id" }] };
      if (command === "show-task") return { tasks: [{ status: "succeeded", "task-details": [{ responseMessage: Buffer.from("done").toString("base64") }] }] };
      return {};
    }
  }
  const sessions = new SessionManager({ clientFactory: o=>new VersionClient(o), largeEnvironmentApiConcurrency: 1 });
  const login = await sessions.login({ host:"mds.example.com", username:"admin", password:"test", mdsMode:true, largeEnvironmentMode:true });
  await sessions.command(login.sessionId, "show-hosts", {}, "primary", "v2.2");
  await assert.rejects(sessions.command(login.sessionId, "show-hosts", {}, "global", "v2.2"), /not verified/);
  await sessions.runScript(login.sessionId, { script:"echo done", targets:["gateway"] }, "primary", "v2.2");
  assert.equal(calls.find(c=>c.command==="show-task").version, "v2.2");
  assert.equal(calls.filter(c=>c.command==="show-hosts").length, 1);
});

test("capability detection failure leaves login and unversioned framework calls available", async () => {
  class Client {
    constructor(o) { Object.assign(this,o); }
    withSid(sid) { return new Client({...this,sid}); }
    async command(command) {
      if(command==="login") return {sid:"sid"};
      if(command==="show-api-versions") throw new Error("Unavailable");
      return {ok:true};
    }
  }
  const sessions=new SessionManager({clientFactory:o=>new Client(o)});
  const login=await sessions.login({host:"sms.example.com",username:"admin",password:"test"});
  assert.match((await sessions.capabilities(login.sessionId)).error,/Unavailable/);
  assert.equal((await sessions.command(login.sessionId,"show-hosts")).ok,true);
  await assert.rejects(sessions.command(login.sessionId,"show-hosts",{},"primary","v2.2"),/not verified/);
});


test("normalizes SMS and Smart-1 Cloud API URLs", () => {
  assert.equal(normalizeBaseUrl("mgmt.example.com", "443"), "https://mgmt.example.com");
  assert.equal(
    normalizeBaseUrl("https://tenant.maas.checkpoint.com/customer/abc", "", { smart1Cloud: true }),
    "https://tenant.maas.checkpoint.com/customer/abc/web_api"
  );
  assert.equal(
    apiUrl({ baseUrl: "https://mgmt.example.com", smart1Cloud: false }, "show-hosts").pathname,
    "/web_api/show-hosts"
  );
});

test("creates MDS contexts, runs commands, polls run-script, and logs out", async (t) => {
  const requests = [];
  let loginCount = 0;
  let taskPolls = 0;
  class MockClient {
    constructor(options) {
      Object.assign(this, options);
    }
    withSid(sid) {
      return new MockClient({ ...this, sid });
    }
    async command(command, body = {}) {
      requests.push({ command, body, sid: this.sid || "" });
      let result;
      if (command === "login") result = { sid: `sid-${++loginCount}` };
      else if (command === "show-hosts") result = { objects: [{ name: "host-a" }], total: 1 };
      else if (command === "run-script") result = { tasks: [{ "task-id": "task-1" }] };
      else if (command === "show-task") {
        taskPolls += 1;
        result = taskPolls < 2
          ? { tasks: [{ "task-details": [] }] }
          : { tasks: [{ status: "succeeded", "task-details": [{ statusDescription: "R81.20" }] }] };
      } else result = { message: "OK" };
      return result;
    }
    async list(command, body = {}) {
      return (await this.command(command, body)).objects;
    }
  }

  const sessions = new SessionManager({
    taskPollAttempts: 3,
    taskPollIntervalMs: 1,
    clientFactory: (options) => new MockClient(options)
  });
  const connected = await sessions.login({
    host: "https://mds.example.com",
    authMode: "password",
    username: "admin",
    password: "secret",
    mdsMode: true,
    domain: "Domain-A"
  });

  assert.deepEqual(
    Object.fromEntries(Object.entries(connected.contexts).map(([key, value]) => [key, value.available])),
    { primary: true, mds: true, global: true, "system-data": true }
  );
  assert.equal(connected.largeEnvironmentMode, false);
  assert.equal(requests.filter(({ command }) => command === "login").length, 4);
  assert.equal(requests.find(({ body }) => body.domain === "Global").body.password, "secret");

  const objects = await sessions.list(connected.sessionId, "show-hosts", {}, "global");
  assert.equal(objects[0].name, "host-a");
  assert.equal(requests.find(({ command }) => command === "show-hosts").sid, "sid-3");

  const script = await sessions.runScript(connected.sessionId, {
    "script-name": "test",
    script: "show version",
    targets: ["gw"]
  }, "mds");
  assert.equal(script.output, "R81.20");
  assert.deepEqual(script.taskSummary, [{
    id: "",
    name: "run-script",
    status: "succeeded",
    progress: null,
    startedAt: "",
    lastUpdatedAt: "",
    targets: [],
    output: "",
    statusDescription: "R81.20",
    errors: [],
    executions: [{ target: "", status: "", message: "R81.20", output: "", error: "" }]
  }]);
  assert.equal(requests.find(({ command }) => command === "run-script").sid, "sid-2");
  assert.equal(taskPolls, 2);

  const logout = await sessions.logout(connected.sessionId);
  assert.equal(logout.closedContexts, 4);
  assert.throws(() => sessions.get(connected.sessionId), /Session not found/);
});

test("large-environment mode applies separate API and run-script throttles", async () => {
  let activeApi = 0;
  let maxActiveApi = 0;
  let activeScripts = 0;
  let maxActiveScripts = 0;

  class ThrottleClient {
    constructor(options) { Object.assign(this, options); }
    withSid(sid) { return new ThrottleClient({ ...this, sid }); }
    async command(command) {
      if (command === "login") return { sid: "large-sid" };
      if (command === "logout") return { message: "OK" };
      const isScript = command === "run-script";
      if (isScript) {
        activeScripts += 1;
        maxActiveScripts = Math.max(maxActiveScripts, activeScripts);
      } else {
        activeApi += 1;
        maxActiveApi = Math.max(maxActiveApi, activeApi);
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (isScript) {
        activeScripts -= 1;
        return { tasks: [{ status: "succeeded", "task-details": [{ statusDescription: "done" }] }] };
      }
      activeApi -= 1;
      return { ok: true };
    }
  }

  const sessions = new SessionManager({
    largeEnvironmentApiConcurrency: 2,
    largeEnvironmentRunScriptConcurrency: 1,
    clientFactory: (options) => new ThrottleClient(options)
  });
  const connected = await sessions.login({
    host: "https://large.example.com",
    authMode: "password",
    username: "admin",
    password: "secret",
    largeEnvironmentMode: true
  });

  await Promise.all(Array.from({ length: 6 }, () =>
    sessions.command(connected.sessionId, "show-hosts")
  ));
  await Promise.all(Array.from({ length: 3 }, () =>
    sessions.runScript(connected.sessionId, { script: "show version", targets: ["gw"] })
  ));

  assert.equal(connected.largeEnvironmentMode, true);
  assert.equal(maxActiveApi, 2);
  assert.equal(maxActiveScripts, 1);
});

test("run-script keeps decoded output and errors attached to their gateway targets", async () => {
  class ScriptClient {
    constructor(options) { Object.assign(this, options); }
    withSid(sid) { return new ScriptClient({ ...this, sid }); }
    async command(command) {
      if (command === "login") return { sid: "script-sid" };
      if (command === "logout") return { ok: true };
      if (command === "run-script") return {
        tasks: [{
          "task-id": "task-output-1",
          "task-name": "run-script",
          status: "succeeded",
          "progress-percentage": 100,
          "task-details": [
            { gatewayName: "gw-east", responseMessage: Buffer.from("east output").toString("base64") },
            { gatewayName: "gw-west", responseError: "SSH connection failed" }
          ]
        }]
      };
      return {};
    }
  }
  const sessions = new SessionManager({ clientFactory: (options) => new ScriptClient(options) });
  const connected = await sessions.login({ host: "mgmt.example.com", authMode: "api-key", apiKey: "key" });
  const result = await sessions.runScript(connected.sessionId, { script: "cplp list", targets: ["gw-east", "gw-west"] });

  assert.equal(result.output, "east output");
  assert.deepEqual(result.taskSummary[0].targets, ["gw-east", "gw-west"]);
  assert.deepEqual(result.taskSummary[0].executions, [
    { target: "gw-east", status: "", message: "", output: "east output", error: "" },
    { target: "gw-west", status: "", message: "", output: "", error: "SSH connection failed" }
  ]);
});

test("generated v2.1 command catalog includes categorized read and write commands", async () => {
  const catalog = JSON.parse(await readFile(
    new URL("../public/data/check-point-api-v2.1.json", import.meta.url),
    "utf8"
  ));
  const showHost = catalog.commands.find((command) => command.name === "show-host");
  const addHost = catalog.commands.find((command) => command.name === "add-host");

  assert.equal(catalog.apiVersion, "v2.1");
  assert.equal(catalog.commandCount, catalog.commands.length);
  assert.ok(catalog.commandCount >= 1000);
  assert.equal(showHost.category, "Network Objects / Host");
  assert.equal(showHost.readOnly, true);
  assert.equal(addHost.readOnly, false);
  assert.deepEqual(addHost.requestTemplate, { name: "", "ip-address": "" });
});

test("gateway run-script preset catalog separates monitoring from state-changing commands", async () => {
  const catalog = JSON.parse(await readFile(
    new URL("../public/data/gateway-run-script-presets.json", import.meta.url),
    "utf8"
  ));
  const status = catalog.presets.find((preset) => preset.id === "autoupdater-status");
  const disable = catalog.presets.find((preset) => preset.id === "autoupdater-disable-urgent");
  const revert = catalog.presets.find((preset) => preset.id === "cplp-revert");

  assert.equal(status.risk, "safe");
  assert.equal(status.script, "autoupdatercli status");
  assert.equal(disable.risk, "danger");
  assert.equal(revert.risk, "danger");
  assert.ok(catalog.presets.length >= 15);
});

test("password hash workflow generates salted SHA-512 crypt and rejects unsafe input", async () => {
  const { generatePasswordHash } = await import('../src/workflows/password-hash.js');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const first = await generatePasswordHash({ password: 'framework-test-password' });
  const second = await generatePasswordHash({ password: 'framework-test-password' });
  assert.match(first.hash, /^\$6\$[./A-Za-z0-9]{16}\$[./A-Za-z0-9]{86}$/);
  assert.notEqual(first.hash, second.hash);
  assert.equal(first.rounds, 5000);
  // Public test fixture only; compare the generated salt with OpenSSL independently.
  const expected = await promisify(execFile)('openssl', ['passwd', '-6', '-salt', first.hash.split('$')[2], 'framework-test-password']);
  assert.equal(first.hash, expected.stdout.trim());
  for (const password of ['', null, 'short', 'valid*but-unsupported', 'a\nb', 'a\rb', 'a\0b', 'é'.repeat(65)]) {
    await assert.rejects(generatePasswordHash({ password }));
  }
});


test("Gaia hashing matches the published SHA-512 crypt reference vector", async () => {
  const { hashGaiaPassword } = await import('../src/workflows/password-hash.js');
  // Ulrich Drepper's SHA-crypt specification, sha512crypt.c tests2:
  // https://www.akkadia.org/drepper/SHA-crypt.txt
  const result = await hashGaiaPassword('Hello world!', 'saltstring');
  assert.equal(result.hash, '$6$saltstring$svn8UoSVapNtMuq1ukKS4tPQd8iKwSMHWjl/O817G3uBnIFNjnQJuesI68u4OTLiBFdcbYEdFCoEOfaS35inz1');
  await assert.rejects(hashGaiaPassword('example*password', 'saltstring'), /asterisk/);
  await assert.rejects(hashGaiaPassword('Hello world!', 'bad salt'), /salt/);
});

test("Clish password command preserves the complete hash through shell expansion", async () => {
  const { formatClishPasswordCommand } = await import('../public/password-hash-format.js');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const hash = '$6$abcdefghijklmnop$' + 'A'.repeat(75) + '.hDaavX4G..';
  assert.equal(hash.length, 106);
  const command = formatClishPasswordCommand('admin', hash);
  assert.equal(command, `clish -c "set user admin password-hash ${hash.replaceAll('$', '\\$')}"`);
  // A shell function captures argv; no real Clish or account changes are involved.
  const { stdout } = await promisify(execFile)('/bin/sh', ['-c',
    'clish() { printf "%s\\n" "$#" "$1" "$2"; }; ' + command]);
  assert.equal(stdout, `2\n-c\nset user admin password-hash ${hash}\n`);
  for (const username of ['a;id', 'a b', '$(id)', '', 'a'.repeat(33)]) {
    assert.throws(() => formatClishPasswordCommand(username, hash), /username/);
  }
  assert.throws(() => formatClishPasswordCommand('admin', hash + ' '), /hash/);
});
