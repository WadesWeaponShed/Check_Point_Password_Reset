# Adding an Application Workflow

Use a workflow when building a focused tool—such as an inventory collector, configuration reviewer, report generator, or approved remediation flow—on top of this framework.

## Recipe

1. Create `src/workflows/<feature>.js`.
2. Export a function accepting `{ sessions, sessionId, context }`.
3. Call `sessions.command()`, `sessions.list()`, or `sessions.runScript()` as appropriate.
4. Return a small, app-specific result object.
5. Add a local route in `src/server.js` if the browser needs to invoke the workflow.
6. Build the focused UI in `public/`; do not connect the browser directly to Check Point.
7. Add tests for the workflow and any modified framework behavior.

## Example

```js
// src/workflows/gateway-inventory.js
export async function collectGatewayInventory({ sessions, sessionId, context = "primary" }) {
  const gateways = await sessions.list(
    sessionId,
    "show-gateways-and-servers",
    {},
    context
  );
  return {
    count: gateways.length,
    gateways: gateways.map(({ name, type, uid }) => ({ name, type, uid }))
  };
}
```

For a Gaia operation, use the framework's asynchronous task flow:

```js
const result = await sessions.runScript(sessionId, {
  "script-name": "get-version",
  script: 'clish -c "show version all"',
  targets: [gatewayName]
}, "mds");

// result.taskSummary contains task state and target-associated output/errors.
```

## Context Selection

- Use `primary` for the selected SMS, Smart-1 Cloud tenant, or MDS domain/CMA.
- Use `mds` for MDS-level operations and MDS-managed gateway targets.
- Use `global` only for Global Domain operations.
- Use `system-data` only for System Data operations.

Never silently change context just because one is unavailable. Surface a clear error and let the application make an intentional choice.

## State-Changing Workflows

For an action that changes Management or gateway state:

- require an explicit user confirmation;
- clearly identify the context, target, and change before execution;
- return the task ID and target-associated result;
- document prerequisites, rollback, and operational risk;
- avoid automatically publishing or installing policy unless the user explicitly requested that behavior.

## Avoid These Anti-Patterns

- Calling Check Point endpoints from browser JavaScript.
- Recreating `login`, `show-task` polling, pagination, or URL handling inside a workflow.
- Reading credentials from source code or browser storage.
- Running one `run-script` call per gateway in an unbounded `Promise.all`.
- Returning only a raw task blob when clean per-target output is available.

## Required Login Default

Allow Self-Signed Certificate must default to checked for SMS, Smart-1 Cloud, and MDS. Preserve this default in derived apps and agent-driven changes. An omitted API login ignoreTls field defaults to true; an explicit false (unchecked) enables certificate verification for all session contexts. This setting disables TLS certificate verification, not encryption, and does not authenticate the server certificate. Users must remain able to uncheck it. Do not disable TLS verification globally or for catalog downloads.
