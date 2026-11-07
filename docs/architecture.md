# Architecture and Invariants

## Purpose

The framework is a local Node.js base for building Check Point Management API applications. It deliberately separates reusable Check Point mechanics from application-specific workflows.

```
Browser UI (`public/`)
        │ local JSON requests only
        ▼
Local HTTP routes (`src/server.js`)
        ▼
Session and task layer (`src/session-manager.js`)
        ▼
Check Point transport (`src/check-point-client.js`)
        ▼
SMS / Smart-1 Cloud / MDS Management API
```

## Management Types

| Type | Login behavior | Important constraint |
| --- | --- | --- |
| SMS | One primary Management API session | API endpoint is `/web_api`. |
| Smart-1 Cloud | One primary tenant session | Preserve the tenant context URL and normalize it to end in `/web_api`. |
| MDS | Primary domain plus optional MDS, Global, and System Data sessions | A context may fail to log in and must be shown as unavailable instead of breaking the whole login. |

Contexts are named `primary`, `mds`, `global`, and `system-data`. Workflows choose the appropriate context explicitly. For example, MDS-managed gateway objects normally need `mds` for `run-script`, while an object inside a selected domain normally uses `primary`.

## Core Modules

### `src/check-point-client.js`

Owns URL normalization, HTTPS transport, API errors, request logging with secret redaction, and paginated `show-*` collection retrieval. It does not know about workflows or browser state.

### `src/session-manager.js`

Owns authentication, in-memory session lifecycle, context SIDs, command dispatch, large-environment concurrency limits, `run-script` task polling, Base64 Gaia output decoding, and structured per-gateway task results. This is the authoritative boundary for all Check Point access.

### `src/server.js`

Owns local HTTP routing and static-file serving. It returns opaque framework session IDs, never Check Point SIDs. Add a route only when a workflow needs an explicit application endpoint.

### `src/workflows/`

Owns application-specific behavior. A workflow uses the provided `sessions` object and `sessionId`, then returns an application-shaped result. It should not reimplement login, URL construction, HTTP transport, pagination, or task polling.

## Gaia `run-script` Lifecycle

1. Submit `run-script` through `sessions.runScript()`.
2. Inspect task IDs returned by Check Point.
3. Poll `show-task` until output is returned or the polling limit is reached.
4. Decode Base64 `responseMessage` values.
5. Return a clean `taskSummary` that keeps each output or error associated with its gateway target.
6. Keep the raw Check Point task object available for troubleshooting, but do not make it the primary UI output.

The immediate `run-script` response is often only a task reference, not the final gateway output. Do not bypass this lifecycle.

## Safety and Security Boundaries

- The browser must use local `/api/*` routes only.
- Credentials and SIDs stay in Node process memory and disappear at logout or server restart.
- The generic command explorer can invoke any API command permitted by the connected Check Point account. It is useful for development, not a production authorization model.
- State-changing actions require user confirmation in the UI. Gaia presets also declare their risk level.
- Large-environment mode intentionally reduces parallel Management API and Gaia activity.

See [adding workflows](adding-workflows.md) for the extension recipe and [Gaia run-script presets](gaia-run-script-presets.md) for command additions.

## Required Login Default

Allow Self-Signed Certificate must default to checked for SMS, Smart-1 Cloud, and MDS. Preserve this default in derived apps and agent-driven changes. An omitted API login ignoreTls field defaults to true; an explicit false (unchecked) enables certificate verification for all session contexts. This setting disables TLS certificate verification, not encryption, and does not authenticate the server certificate. Users must remain able to uncheck it. Do not disable TLS verification globally or for catalog downloads.
