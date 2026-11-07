# Check Point Password Changer

A local Check Point toolbox app for resetting an existing Gaia user's password hash across selected gateways, physical cluster members, and Check Point servers. Built from `CP-API-Framework`, with the hardening app's workbench appearance, per-member SIC gating, and terminal-state task polling.

## Run

Requires Node.js 18+ and OpenSSL with `passwd -6` on PATH. No npm dependencies.

```sh
npm start
```

Open http://127.0.0.1:3000. Set `PORT` to use another port. Run `npm run check` for syntax checks and automated tests.

## Workflow

1. Connect to SMS, Smart-1 Cloud (complete tenant context URL), or MDS with a selected Domain / CMA. Direct CMA API access can use the SMS connection option. Password and API-key authentication are supported. Self-signed certificates are allowed by default; uncheck to verify certificates.
2. Login automatically discovers inventory and tests SIC on all discovered targets. Use **Refresh Inventory & SIC** to reload both. Targets remain unselected until you choose the reset scope. Standalone gateways, individual cluster members, and all named non-cluster objects from show-gateways-and-servers appear, including management and log servers. Virtual clusters are expanded into members. SIC checks and manager-side run-script apply to servers too; a server whose SIC test does not report communicating is displayed but skipped for reset. Smart-1 Cloud itself is a hosted service, not a Gaia server reset target. Cluster expansion failures are reported. Targets are sorted by name. Devices that fail SIC appear in a separate Failing SIC box and cannot be selected. Select All includes only targets with confirmed communicating SIC, regardless of the current search filter. Untested or pending targets, and targets with unverified platforms, cannot be selected. A selected target is removed from selection if a later SIC check fails; refresh inventory and SIC after resolving connectivity.
3. Optionally test SIC. Only `communicating` permits a reset; SIC is always tested again immediately before execution.
4. Enter an existing Gaia username (default `admin`). Generate a salted SHA-512 crypt hash or paste a compatible hash. This version accepts the framework's `$6$` format with a 16-character salt and 86-character digest, at the default 5,000 rounds. Passwords must be at least 6 characters, at most 128 UTF-8 bytes, and contain none of `*`, `!`, backslash, `$`, `#`, single quote, double quote, NUL, or line breaks. In addition to Gaia's documented asterisk restriction, the app conservatively rejects the Clish-reserved characters from [sk109148](https://support.checkpoint.com/results/sk/sk109148) for compatibility; this is an app policy, not a verified claim that importing a hash fails for every such password. Pasted hashes retain their required dollar separators; the app cannot determine the original plaintext characters from a hash. Gaia's policy may impose additional requirements.
5. Review the scope and command preview. Type `RESET N`, matching the selected count, then apply. Each target runs `clish -s -c "set user … password-hash …"`; `-s` saves the configuration after the command. Failed task output includes the Clish exit code and diagnostic output, with SHA-512 crypt hashes redacted on the gateway before transmission. No user is created, no management policy publish is required, and no automatic rollback is attempted.
6. Inspect every result and verify a new Gaia login. Download JSON results if needed. Task details are collapsed and the submitted hash is redacted.

## Execution and limitations

The management API account needs permission to list gateway objects, test SIC, run scripts, and read task results. The target must support Gaia SHA-512 crypt, Clish script execution, and account changes through Management API run-script. Validate the workflow on a lab gateway before bulk use. This tool does not support Spark/Gaia Embedded or all-domain MDS resets. Scalable Security Groups require the platform preflight described below.

The framework SessionManager retains its SMS, Cloud URL normalization, optional MDS contexts, TLS defaults, and queues. This workflow deliberately uses the selected domain's `primary` context for its managed gateways. Large-environment mode reduces SIC/reset worker concurrency. `test-sic-status` has a 120-second request timeout. Scripts poll all returned tasks to terminal states using the hardening app's task-polling module. `TASK_POLL_ATTEMPTS` (default 180) and `TASK_POLL_INTERVAL_MS` (default 1000) determine the polling time budget; backoff is capped at 4 seconds. A timeout is **Unknown**, never success, and does not resubmit a script. Check the gateway before retrying: a password may have changed even if saving or verification failed.

Reset jobs and the last ten job records live only in server memory. Keep the app and browser open while a reset runs. Reloading the browser loses the opaque app session identifier; restarting the server loses all jobs and sessions. Concurrent reset jobs in the same session are blocked. Operations already submitted to Check Point may continue after the app stops.

Passwords go to OpenSSL through stdin and are cleared from input fields after successful hashing. Credentials and Check Point SIDs remain server-side; browser storage is not used. Run-script bodies are redacted from optional API request logs. Generated hashes are sensitive and remain visible in the UI until cleared or submitted. Check Point itself receives the hash in the run-script payload and may retain task/audit records according to its configuration.

Bind to localhost by default. The inherited generic API routes are intended for a trusted local operator, not a multi-user service. Add authentication and HTTPS before remote deployment. No live Check Point environment has been used for validation; the automated suite and synthetic preview do not prove release-specific Clish or Smart-1 Cloud execution compatibility.

## Sources

- Base: [Check Point API Framework](https://github.com/WadesWeaponShed/Check-Point-API-Framework)
- Appearance, SIC test semantics, and task polling: Check Point Hardening App

`tests/preview-server.mjs` serves an explicitly synthetic UI preview on port 3009. It never connects to Check Point and refuses password reset execution.

## Expert mode password

Choose **Expert mode password** under **Password to change**. The username field is hidden because this is a system-wide Expert credential on each target, rather than an individual Gaia user's login password. Switching password type clears the prepared password/hash and confirmation to prevent applying the wrong change. Generate or paste a SHA-512 crypt hash, select targets, review the Expert warning, and confirm as usual.

The manager submits `clish -s -c "set expert-password-hash …"` via run-script. The same SIC gate, task polling, diagnostic redaction, save behavior, and unknown-completion handling apply. Keep a recovery session open and verify Expert access after the change. This does not change GRUB credentials or individual Gaia user passwords. Do not reuse the Expert password for GRUB.

Source: [Check Point: Configuring System Passwords in Gaia Clish](https://sc1.checkpoint.com/documents/R81.20/WebAdminGuides/EN/CP_R81.20_Gaia_AdminGuide/Content/Topics-GAG/System-Passwords-Gaia-Clish.htm). Live Expert password execution has not been tested by the automated suite.

## Gaia configuration lock recovery

For both Gaia user and Expert resets, a completed failed task with an explicit configuration-lock diagnostic triggers the Hardening App recovery pattern: submit `clish -c "lock database override"` through the connected manager, verify completion, wait 1.5 seconds, and retry the password command. A persistent lock permits two more override/retry cycles after 2.5 and 4 seconds. Each attempt stays associated with the selected target in collapsed diagnostics. This takes the configuration lock from another admin session; the review warning discloses that impact. Coordinate with other administrators before applying. Failed or unverified overrides stop recovery. Unknown completion, timeouts, and unrelated errors do not trigger overrides or retries. Recovery does not run until the operator confirms a reset.

## Scalable Security Groups / Maestro

After a communicating SIC response, the app submits a read-only platform probe via the manager’s `run-script`: check `gclish` and `asg` availability, then collect `asg stat` and `asg stat -i sgm_info`. Standard Gaia requires a successful Gaia version response when neither scalable tool is found. Management metadata is used as a conflicting-platform hint, not sufficient proof. Failed/unknown tasks, missing tools, unsupported output, and contradictory metadata block selection; no local fallback is attempted. Custom PATHs or unrecognized release output may require investigation.

Confirmed scalable groups use `gclish -s -c` for both Gaia user and Expert password hashes and `gclish -c "lock database override"` for lock recovery. Select the logical Security Group management object (SMO), once per group. A discovered Cluster member that resolves to a Security Group is blocked to avoid repeating a global reset through each member. The review identifies selected groups and warns that the command affects all members and sites. Member status evidence is expandable in inventory. The probe must report a positive, fully available `SGMs | N/N` count before execution; incomplete or unrecognized membership blocks the reset.

Platform and availability are rechecked immediately before execution; a changed platform requires a new review. Group availability and member count are checked afterward. A degraded or unverifiable postflight yields Unknown, even when the global password command completed. This verifies global command completion and reported membership availability; it does not prove a new login works on each member. Verify access on every member. Both modes and lock recovery are tested with mocked manager responses and shell argument capture; live Maestro execution remains unverified.

Sources: [Gaia Expert-mode shell syntax](https://sc1.checkpoint.com/documents/R82.10/WebAdminGuides/EN/CP_R82.10_Gaia_AdminGuide/Content/Topics-GAG/Gaia-Clish-Expert-Mode.htm), [Security Group status and membership](https://sc1.checkpoint.com/documents/R81.20/WebAdminGuides/EN/CP_R81.20_Maestro_AdminGuide/Content/Topics-Maestro-AG/Showing-Hardware-State-asg_stat.htm), [global command scope](https://sc1.checkpoint.com/documents/R81/WebAdminGuides/EN/CP_R81_Maestro_AdminGuide/Topics-Maestro-AG/Global-Commands.htm).
