import { discoverTargets, runSicTests, startResetJob } from "./workflows/password-reset.js";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { SessionManager } from "./session-manager.js";
import { runExampleWorkflow } from "./workflows/example.js";
import { CatalogManager } from "./catalog-manager.js";
import { generatePasswordHash } from "./workflows/password-hash.js";
const catalogs = await new CatalogManager().init();

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));
const sessions = new SessionManager({
  runScriptConcurrency: Number(process.env.RUN_SCRIPT_CONCURRENCY || 8),
  largeEnvironmentRunScriptConcurrency: Number(process.env.LARGE_ENV_RUN_SCRIPT_CONCURRENCY || 3),
  largeEnvironmentApiConcurrency: Number(process.env.LARGE_ENV_API_CONCURRENCY || 10),
  taskPollAttempts: Number(process.env.TASK_POLL_ATTEMPTS || 180),
  taskPollIntervalMs: Number(process.env.TASK_POLL_INTERVAL_MS || 1000),
  largeEnvironmentTaskPollIntervalMs: Number(process.env.LARGE_ENV_TASK_POLL_INTERVAL_MS || 1250),
  logger: process.env.CP_API_LOGGING
    ? (entry) => console.log(JSON.stringify({ time: new Date().toISOString(), ...entry }))
    : null
});

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8"
};

function sendJson(res, statusCode, value) {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store"
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error("Request body must be valid JSON.")); }
    });
    req.on("error", reject);
  });
}

async function handleApi(req, res) {
  const requestId = randomUUID().slice(0, 8);
  try {
    if (req.url === "/api/health" && req.method === "GET") {
      sendJson(res, 200, { ok: true, requestId, serverTime: new Date().toISOString() });
      return;
    }
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed.", requestId });
      return;
    }
    const body = await readJson(req);
    let result;
    switch (req.url) {
      case "/api/catalog/status":
        result = catalogs.status();
        break;
      case "/api/catalog/get":
        result = catalogs.get(body.version);
        break;
      case "/api/catalog/update":
        sessions.get(body.sessionId);
        result = await catalogs.update();
        break;
      case "/api/capabilities":
        result = await sessions.capabilities(body.sessionId, body.context);
        break;
      case "/api/targets":
        result = await discoverTargets(sessions, body.sessionId);
        break;
      case "/api/sic-test":
        result = await runSicTests(sessions, body.sessionId, body.targets);
        break;
      case "/api/reset/start":
        result = startResetJob(sessions, body.sessionId, body);
        break;
      case "/api/reset/status":
        result = sessions.get(body.sessionId).passwordJobs?.get(body.jobId);
        if (!result) throw new Error("Reset job not found.");
        break;
      case "/api/password-hash":
        result = await generatePasswordHash(body);
        break;
      case "/api/login":
        result = await sessions.login(body);
        break;
      case "/api/session":
        result = sessions.describe(body.sessionId);
        break;
      case "/api/command":
        if (body.apiVersion && !catalogs.get(body.apiVersion).commands.some(c => c.name === body.command)) throw new Error("Command not documented in selected catalog.");
        result = await sessions.command(body.sessionId, body.command, body.body || {}, body.context, body.apiVersion);
        break;
      case "/api/list":
        result = { objects: await sessions.list(body.sessionId, body.command, body.body || {}, body.context) };
        break;
      case "/api/run-script":
        result = await sessions.runScript(body.sessionId, body.body || {}, body.context, body.apiVersion);
        break;
      case "/api/example":
        result = await runExampleWorkflow({ sessions, sessionId: body.sessionId, context: body.context });
        break;
      case "/api/logout":
        result = await sessions.logout(body.sessionId);
        break;
      default:
        sendJson(res, 404, { error: "API route not found.", requestId });
        return;
    }
    sendJson(res, 200, { requestId, ...result });
  } catch (error) {
    sendJson(res, error.statusCode === 401 || error.statusCode === 403 ? 401 : 400, {
      requestId,
      error: error.message,
      command: error.command,
      phase: error.phase,
      statusCode: error.statusCode,
      response: error.response
    });
  }
}

async function serveStatic(req, res) {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const path = normalize(join(PUBLIC_DIR, relative));
  if (!path.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const file = await readFile(path);
    res.writeHead(200, {
      "content-type": contentTypes[extname(path)] || "application/octet-stream",
      "cache-control": "no-cache"
    });
    res.end(file);
  } catch {
    res.writeHead(404).end("Not found");
  }
}

export const server = createServer((req, res) => {
  if (req.url.startsWith("/api/")) void handleApi(req, res);
  else void serveStatic(req, res);
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.env.CATALOG_AUTO_UPDATE === "true") {
    const update = () => catalogs.update().catch(error => console.error("Catalog update:", error.message));
    void update();
    setInterval(update, 24 * 60 * 60 * 1000).unref();
  }
  server.listen(PORT, HOST, () => {
    console.log(`Check Point Password Changer listening at http://${HOST}:${PORT}`);
  });
}
