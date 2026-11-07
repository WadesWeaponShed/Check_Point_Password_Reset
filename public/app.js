const loginForm = document.querySelector("#loginForm");
const loginCard = document.querySelector("#loginCard");
const workspace = document.querySelector("#workspace");
const loginStatus = document.querySelector("#loginStatus");
const output = document.querySelector("#output");
const authModeInputs = document.querySelectorAll('input[name="authMode"]');
const managementTypeInput = document.querySelector("#managementType");
const managementHostInput = loginForm.querySelector('input[name="host"]');
let sessionId = "";
let sessionDescription = null;
let commandCatalog = null;
let visibleCommands = [];
let gatewayScriptPresets = [];
let catalogCapability = { supported: [], error: "Log in to verify API compatibility." };
let catalogLoading = false;
let catalogRequest = 0;

async function api(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || `Request failed (${response.status}).`);
    error.details = result;
    throw error;
  }
  return result;
}

function parseJson(text) {
  try { return JSON.parse(text || "{}"); }
  catch { throw new Error("Request body must be valid JSON."); }
}

function show(value) {
  const pre = document.createElement("pre");
  pre.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  output.replaceChildren(pre);
}

function taskSummaryFromResponse(response) {
  if (Array.isArray(response?.taskSummary)) return response.taskSummary;
  return (response?.result?.tasks || []).map((task) => ({
    id: task["task-id"] || task.taskId || task.uid || "",
    name: task["task-name"] || task.taskName || task.name || "run-script",
    status: task.status || "unknown",
    progress: task["progress-percentage"] ?? task.progressPercentage ?? null,
    startedAt: task["start-time"] || task.startTime || "",
    lastUpdatedAt: task["last-update-time"] || task.lastUpdateTime || "",
    targets: (task["task-details"] || task.taskDetails || []).map((detail) => detail.gatewayName || detail["gateway-name"]).filter(Boolean),
    output: "",
    errors: [],
    executions: []
  }));
}

function appendTaskField(container, label, value) {
  if (value === "" || value === null || value === undefined || value.length === 0) return;
  const field = document.createElement("div");
  const name = document.createElement("dt");
  const content = document.createElement("dd");
  name.textContent = label;
  content.textContent = Array.isArray(value) ? value.join(", ") : value;
  field.append(name, content);
  container.append(field);
}

function showRunScriptResult(response) {
  const tasks = taskSummaryFromResponse(response);
  const fragment = document.createDocumentFragment();
  const heading = document.createElement("p");
  heading.className = "result-summary";
  const statuses = tasks.map((task) => String(task.status).toLowerCase());
  heading.textContent = !tasks.length
    ? "Run-script request completed with no task details returned."
    : statuses.some((status) => ["failed", "error"].includes(status))
      ? "Run-script task finished with errors."
      : statuses.some((status) => ["in progress", "pending"].includes(status))
        ? "Run-script task is still in progress."
        : "Run-script task completed.";
  fragment.append(heading);

  for (const task of tasks) {
    const card = document.createElement("section");
    card.className = "script-result-card";
    const header = document.createElement("div");
    header.className = "script-result-head";
    const title = document.createElement("h3");
    title.textContent = task.name || "run-script";
    const status = document.createElement("span");
    status.className = `task-status ${String(task.status).toLowerCase()}`;
    status.textContent = task.status || "unknown";
    header.append(title, status);
    card.append(header);

    const fields = document.createElement("dl");
    fields.className = "task-fields";
    appendTaskField(fields, "Task ID", task.id);
    appendTaskField(fields, "Target", task.targets);
    appendTaskField(fields, "Progress", task.progress === null ? null : `${task.progress}%`);
    appendTaskField(fields, "Started", task.startedAt);
    appendTaskField(fields, "Last Updated", task.lastUpdatedAt);
    card.append(fields);

    const executions = task.executions || [];
    if (executions.length) {
      const results = document.createElement("div");
      results.className = "gateway-executions";
      for (const execution of executions) {
        const entry = document.createElement("section");
        entry.className = "gateway-execution";
        const entryHeading = document.createElement("h4");
        entryHeading.textContent = execution.target || "Gateway Output";
        entry.append(entryHeading);
        const text = execution.error || execution.output || execution.message || "No output was returned by this gateway.";
        const pre = document.createElement("pre");
        pre.className = `script-output${execution.error ? " task-error" : ""}`;
        pre.textContent = text;
        entry.append(pre);
        results.append(entry);
      }
      card.append(results);
    } else {
      const scriptOutput = task.output || task.statusDescription || (tasks.length === 1 ? response.output : "");
      if (scriptOutput) {
        const label = document.createElement("h4");
        label.textContent = task.output ? "Gateway Output" : "Task Message";
        const pre = document.createElement("pre");
        pre.className = "script-output";
        pre.textContent = scriptOutput;
        card.append(label, pre);
      }
    }
    fragment.append(card);
  }

  const raw = document.createElement("details");
  raw.className = "raw-response";
  const summary = document.createElement("summary");
  summary.textContent = "Raw Check Point Task Response";
  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify(response.result || response, null, 2);
  raw.append(summary, pre);
  fragment.append(raw);
  output.replaceChildren(fragment);
}

function selectedCatalogCommand() {
  const name = document.querySelector("#commandSelect").value;
  return commandCatalog?.commands.find((command) => command.name === name) || null;
}

function fieldSummary(field) {
  const alternatives = field.alternatives?.length ? ` or ${field.alternatives.join(", ")}` : "";
  return `${field.name}${alternatives} — ${field.type}`;
}

function renderCommandDetails({ resetBody = false } = {}) {
  const command = selectedCatalogCommand();
  const infoName = document.querySelector("#commandInfoName");
  const infoDescription = document.querySelector("#commandInfoDescription");
  const badges = document.querySelector("#commandBadges");
  const parameters = document.querySelector("#commandParameters");
  const warning = document.querySelector("#mutationWarning");
  badges.replaceChildren();
  parameters.replaceChildren();

  if (!command) {
    infoName.textContent = "No Matching Commands";
    infoDescription.textContent = "Change the category or search text to see commands.";
    warning.classList.add("hidden");
    return;
  }

  infoName.textContent = command.name;
  infoDescription.textContent = command.description || "No description is provided in the API reference.";
  const badgeValues = [
    `Documented in ${commandCatalog.apiVersion}`,
    command.documentedVersions?.length ? `Earliest downloaded match: ${command.documentedVersions[0]}` : "",
    command.category,
    command.readOnly ? "Read-Only" : "Changes State",
    command.deprecated ? "Deprecated" : ""
  ].filter(Boolean);
  for (const value of badgeValues) {
    const badge = document.createElement("span");
    badge.textContent = value;
    badge.className = value === "Changes State" ? "badge mutation" : "badge";
    badges.append(badge);
  }

  const groups = [
    ["Required", command.requiredFields],
    ["Optional", command.optionalFields]
  ];
  for (const [label, fields] of groups) {
    if (!fields?.length) continue;
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = `${label} Parameters (${fields.length})`;
    details.append(summary);
    const list = document.createElement("ul");
    for (const field of fields) {
      const item = document.createElement("li");
      item.textContent = fieldSummary(field);
      item.title = field.description || "";
      list.append(item);
    }
    details.append(list);
    parameters.append(details);
  }
  warning.classList.toggle("hidden", command.readOnly);
  document.querySelector("#commandInfoDescription").textContent += ` ${command.releaseCompatibility || "Release/hotfix compatibility is unverified."}`;
  if (resetBody) {
    document.querySelector('#commandForm textarea[name="body"]').value =
      JSON.stringify(command.requestTemplate || {}, null, 2);
  }
}

function renderCommandOptions({ preserveSelection = true } = {}) {
  if (!commandCatalog) return;
  const select = document.querySelector("#commandSelect");
  const previous = preserveSelection ? select.value : "";
  const category = document.querySelector("#commandCategory").value;
  const search = document.querySelector("#commandSearch").value.trim().toLowerCase();
  visibleCommands = commandCatalog.commands.filter((command) =>
    (!category || command.category === category) &&
    (!search || `${command.name} ${command.description}`.toLowerCase().includes(search))
  );
  select.replaceChildren();
  for (const command of visibleCommands) {
    const option = document.createElement("option");
    option.value = command.name;
    option.textContent = `${command.name}${command.readOnly ? "" : " ⚠"}`;
    select.append(option);
  }
  if (visibleCommands.some((command) => command.name === previous)) select.value = previous;
  else if (visibleCommands.some((command) => command.name === "show-gateways-and-servers")) {
    select.value = "show-gateways-and-servers";
  }
  renderCommandDetails({ resetBody: true });
}

async function loadCommandCatalog(requestedVersion = "") {
  const request = ++catalogRequest;
  catalogLoading = true;
  document.querySelector('#commandForm button[type="submit"]').disabled = true;
  const status = document.querySelector("#catalogStatus");
  try {
    const state = await api("/api/catalog/status", {});
    const context = document.querySelector('#commandForm [name="context"]').value || "primary";
    const capability = sessionId ? await api("/api/capabilities", { sessionId, context }) : { supported: [], error: "Log in to verify API compatibility." };
    const matching = state.installed.filter(v => capability.supported.includes(v));
    const version = requestedVersion || matching.at(-1) || state.installed.at(-1);
    const catalog = await api("/api/catalog/get", { version });
    if (request !== catalogRequest) return;
    catalogCapability = capability;
    commandCatalog = catalog;
    renderCatalogChanges(state, version);
    const versions = document.querySelector('#catalogVersion');
    versions.replaceChildren(...state.installed.map(v => new Option(`${v}${capability.supported.includes(v) ? " / Supported API" : ""}`, v)));
    versions.value = version;
    const categorySelect = document.querySelector("#commandCategory");
    categorySelect.replaceChildren(new Option("All Categories", ""));
    for (const category of commandCatalog.categories) {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      categorySelect.append(option);
    }
    status.textContent = `${commandCatalog.commandCount.toLocaleString()} commands from the Check Point Management API ${commandCatalog.apiVersion} reference.`;
    if (catalog.release) status.textContent += ` Release mapping: ${catalog.release}.`;
    document.querySelector('.docs-link').href = `https://sc1.checkpoint.com/documents/latest/APIs/index.html#introduction~${version}`;
    const supported = capability.supported.includes(version);
    document.querySelector('#compatibilityStatus').textContent = supported
      ? `${context}: API ${version} is advertised by this server. Requests use this explicit API version. Permissions, domain restrictions and gateway prerequisites still apply.`
      : `Browse only: ${capability.error || `this context does not advertise API ${version}`}. Choose a supported version before execution.`;
    document.querySelector('#commandForm button[type="submit"]').disabled = !supported;
    renderCommandOptions({ preserveSelection: false });
  } catch (error) {
    status.textContent = `Command catalog could not be loaded: ${error.message}`;
    catalogCapability = { supported: [], error: error.message };
  } finally {
    if (request === catalogRequest) catalogLoading = false;
  }
}

function renderCatalogChanges(state, selectedVersion) {
  const lines = [state.lastCheck ? `Last update check: ${state.lastCheck}` : 'Comparing locally installed catalogs.'];
  const updates = (state.changes || []).filter(change => ['added', 'removed', 'changed', 'deprecated'].some(key => change[key]?.length));
  lines.push(updates.length ? `Last check updated ${updates.length} catalog(s).` : 'No catalog content changes recorded in this server session.');
  lines.push('', 'VERSION-TO-VERSION COMPARISON');
  const comparison = (state.versionChanges || []).find(change => change.version === selectedVersion);
  if (!comparison) {
    lines.push('No earlier installed catalog is available for this version.');
  } else {
    lines.push(`${comparison.comparedTo} → ${comparison.version}`, 'Based on downloaded command metadata, not a complete vendor release changelog.');
    for (const [key, label] of [['added', 'Added Commands'], ['removed', 'Removed Commands'], ['changed', 'Changed Command Metadata'], ['deprecated', 'Newly Deprecated Commands']]) {
      const names = comparison[key] || [];
      lines.push('', `${label} (${names.length})`, names.length ? names.join('\n') : 'None.');
    }
  }
  document.querySelector('#catalogChanges').textContent = lines.join('\n');
}

document.querySelector('#catalogVersion').addEventListener('change', event => void loadCommandCatalog(event.target.value));
document.querySelector('#commandForm [name="context"]').addEventListener('change', () => void loadCommandCatalog());
document.querySelector('#catalogUpdate').addEventListener('click', async event => {
  const button = event.currentTarget;
  const notice = document.querySelector('#catalogUpdateStatus');
  notice.hidden = false;
  notice.dataset.state = 'checking';
  notice.textContent = 'Checking Check Point for catalog updates…';
  button.disabled = true;
  button.textContent = 'Checking…';
  document.querySelector('#catalogChanges').textContent = 'Downloading and validating published catalogs…';
  try {
    const previous = await api('/api/catalog/status', {});
    const state = await api('/api/catalog/update', { sessionId });
    const added = state.installed.filter(version => !previous.installed.includes(version));
    const refreshed = state.changes.filter(change => previous.installed.includes(change.version) &&
      ['added', 'removed', 'changed', 'deprecated'].some(key => change[key]?.length));
    notice.dataset.state = 'success';
    notice.textContent = added.length
      ? `API ${added.join(', ')} ${added.length === 1 ? 'has' : 'have'} been added to the framework.${refreshed.length ? ` ${refreshed.length} existing catalog(s) also refreshed.` : ''}`
      : refreshed.length
        ? `Catalog updates installed for ${refreshed.map(change => change.version).join(', ')}. See Catalog Update Details for command changes.`
        : 'Already up to date. No new API versions or command changes are available.';
    document.querySelector('#catalogChanges').textContent = JSON.stringify({ checked: state.lastCheck, changes: state.changes }, null, 2);
    await loadCommandCatalog();
  } catch (error) {
    notice.dataset.state = 'error';
    notice.textContent = `Could not complete the update check. Existing catalogs remain available. ${error.message}`;
    document.querySelector('#catalogChanges').textContent = `Update failed; existing catalogs remain available. ${error.message}`;
  } finally { button.disabled = false; button.textContent = 'Check for Updates'; }
});

function selectedScriptPreset() {
  const id = document.querySelector("#scriptPreset").value;
  return gatewayScriptPresets.find((preset) => preset.id === id) || null;
}

function renderScriptPreset() {
  const preset = selectedScriptPreset();
  const name = document.querySelector("#scriptPresetName");
  const description = document.querySelector("#scriptPresetDescription");
  const badges = document.querySelector("#scriptPresetBadges");
  const warning = document.querySelector("#scriptPresetWarning");
  badges.replaceChildren();
  warning.classList.add("hidden");

  if (!preset) {
    name.textContent = "Custom Script";
    description.textContent = "Enter a Gaia shell command to run against the selected target.";
    return;
  }

  name.textContent = preset.name;
  description.textContent = preset.description;
  for (const tag of preset.tags || []) {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = tag;
    badges.append(badge);
  }
  const risk = document.createElement("span");
  risk.className = `badge script-risk-${preset.risk}`;
  risk.textContent = preset.risk === "safe" ? "Monitoring" : "Changes Gateway State";
  badges.append(risk);
  document.querySelector('#scriptForm textarea[name="script"]').value = preset.script;
  if (preset.risk !== "safe") {
    warning.textContent = preset.risk === "danger"
      ? "High-risk preset: this can remove protection or disable security updates. Use only with an approved change and applicable Check Point guidance."
      : "This preset can change gateway state or trigger an update action. Review the command and target carefully before running.";
    warning.classList.remove("hidden");
  }
}

async function loadGatewayScriptPresets() {
  try {
    const response = await fetch("/data/gateway-run-script-presets.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const catalog = await response.json();
    gatewayScriptPresets = catalog.presets || [];
    const select = document.querySelector("#scriptPreset");
    for (const preset of gatewayScriptPresets) {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = `${preset.name}${preset.risk === "safe" ? "" : " ⚠"}`;
      select.append(option);
    }
  } catch (error) {
    document.querySelector("#scriptPresetDescription").textContent = `Preset catalog could not be loaded: ${error.message}`;
  }
}

function updateLoginFields() {
  const authMode = document.querySelector('input[name="authMode"]:checked')?.value || "password";
  managementHostInput.placeholder = managementTypeInput.value === "smart1-cloud"
    ? "tenant.example.maas.checkpoint.com/context/web_api"
    : "Hostname or IP Address";
  document.querySelectorAll(".mds-field").forEach((field) => field.classList.toggle("hidden", managementTypeInput.value !== "mds"));
  document.querySelectorAll(".password-field, .username-field").forEach((field) => field.classList.toggle("hidden", authMode !== "password"));
  document.querySelectorAll(".api-key-field").forEach((field) => field.classList.toggle("hidden", authMode !== "api-key"));
}

function renderSession() {
  document.querySelector("#connectionLabel").textContent = `Connected to ${sessionDescription.baseUrl} as ${sessionDescription.user}`;
  const available = Object.entries(sessionDescription.contexts).filter(([, value]) => value.available);
  document.querySelector("#contexts").innerHTML = Object.entries(sessionDescription.contexts).map(([name, value]) =>
    `<span class="${value.available ? "available" : "unavailable"}" title="${value.error || ""}">${name}: ${value.available ? "ready" : "unavailable"}</span>`
  ).join("");
  document.querySelectorAll(".context-select").forEach((select) => {
    select.innerHTML = available.map(([name]) => `<option value="${name}">${name}</option>`).join("");
  });
}

authModeInputs.forEach((input) => input.addEventListener("change", updateLoginFields));
managementTypeInput.addEventListener("change", updateLoginFields);
updateLoginFields();
document.querySelector("#commandCategory").addEventListener("change", () => renderCommandOptions());
document.querySelector("#commandSearch").addEventListener("input", () => renderCommandOptions());
document.querySelector("#commandSelect").addEventListener("change", () => renderCommandDetails({ resetBody: true }));
document.querySelector("#scriptPreset").addEventListener("change", renderScriptPreset);
void loadCommandCatalog();
void loadGatewayScriptPresets();

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(loginForm);
  loginStatus.textContent = "Connecting…";
  loginStatus.className = "status-card connecting full-row";
  try {
    const managementType = form.get("managementType") || "sms";
    sessionDescription = await api("/api/login", {
      host: form.get("host"),
      port: form.get("port"),
      authMode: form.get("authMode"),
      username: form.get("username"),
      password: form.get("password"),
      apiKey: form.get("apiKey"),
      smart1Cloud: managementType === "smart1-cloud",
      mdsMode: managementType === "mds",
      domain: managementType === "mds" ? form.get("domain") : "",
      managementObjectName: managementType === "mds" ? form.get("managementObjectName") : "",
      ignoreTls: form.get("ignoreTls") === "on",
      largeEnvironmentMode: form.get("largeEnvironmentMode") === "on"
    });
    sessionId = sessionDescription.sessionId;
    loginStatus.textContent = "Connected.";
    loginStatus.className = "status-card connected full-row";
    loginCard.classList.add("hidden");
    workspace.classList.remove("hidden");
    renderSession();
    await loadCommandCatalog();
    show(sessionDescription);
  } catch (error) {
    loginStatus.textContent = `Connection failed: ${error.message}`;
    loginStatus.className = "status-card error full-row";
    show(error.details || error.message);
  }
});

document.querySelector("#commandForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    if (catalogLoading || !catalogCapability.supported.includes(commandCatalog?.apiVersion)) throw new Error("Select an API version supported by this context before running the command.");
    const command = selectedCatalogCommand();
    if (command && !command.readOnly) {
      const confirmed = window.confirm(
        `${command.name} can change management state. Run this command with the current request body?`
      );
      if (!confirmed) return;
    }
    const path = form.get("command") === "run-script" ? "/api/run-script" : "/api/command";
    const result = await api(path, {
      sessionId,
      apiVersion: commandCatalog.apiVersion,
      context: form.get("context"),
      command: form.get("command"),
      body: parseJson(form.get("body"))
    });
    if (path === '/api/run-script') showRunScriptResult(result);
    else show(result);
  } catch (error) { show(error.details || error.message); }
});

document.querySelector("#scriptForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const preset = selectedScriptPreset();
    if (preset && preset.risk !== "safe") {
      const confirmed = window.confirm(
        `${preset.name} can change gateway state. Run this command against ${form.get("target")}?`
      );
      if (!confirmed) return;
    }
    show("Waiting for run-script task…");
    showRunScriptResult(await api("/api/run-script", {
      sessionId,
      context: form.get("context"),
      body: {
        "script-name": "api-framework-script",
        script: form.get("script"),
        targets: [form.get("target")]
      }
    }));
  } catch (error) { show(error.details || error.message); }
});

document.querySelector("#exampleButton").addEventListener("click", async () => {
  const context = document.querySelector("#commandForm [name=context]").value;
  try { show(await api("/api/example", { sessionId, context })); }
  catch (error) { show(error.details || error.message); }
});

document.querySelector("#logoutButton").addEventListener("click", async () => {
  try { await api("/api/logout", { sessionId }); } catch {}
  sessionId = "";
  workspace.classList.add("hidden");
  loginCard.classList.remove("hidden");
  loginStatus.textContent = "Logged out.";
  loginStatus.className = "status-card disconnected full-row";
});

document.querySelector("#clearButton").addEventListener("click", () => show("Ready."));
