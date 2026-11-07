# Check Point Password Changer

Reset **Gaia user passwords** or the **Expert mode password** across selected gateways, cluster members, and Check Point servers from one local workbench.

All device access goes through the connected **SMS, CMA, or Smart-1 Cloud Management API**. The app uses `run-script` and polls `show-task` for completion. It does not connect directly to devices over SSH or require their existing login passwords.

Created using [Check Point API Framework](https://github.com/WadesWeaponShed/Check-Point-API-Framework).

## Requirements and startup

- Node.js 18 or later.
- OpenSSL on the app server's PATH with support for `openssl passwd -6` to generate hashes. An existing compatible hash can also be pasted.
- Management API access and permissions to list gateway/server objects, test SIC, execute scripts, and read task results.
- Supported Gaia targets reachable by the manager. Validate compatibility in your environment before bulk changes, especially for scalable platforms.

There are no third-party npm dependencies.

```sh
npm start
```

Open **http://127.0.0.1:3000**. To use another port:

```sh
PORT=3008 npm start
```

`npm run check` checks JavaScript syntax. Development tests, previews, and design documentation are not included in this runtime repository.

## Using the app

### 1. Connect to the manager

Choose SMS, Smart-1 Cloud, or MDS with a selected Domain / CMA. A direct CMA connection can use the SMS option. For Smart-1 Cloud, enter the complete tenant context URL.

Use username/password or API-key authentication. **Allow Self-Signed Certificate** is checked by default; uncheck it to enable server certificate verification. **Large Environment Mode** reduces API and device-operation concurrency.

### 2. Wait for automatic discovery and checks

After login, the app automatically:

1. Discovers gateways and Check Point servers, including management and log servers.
2. Expands standard cluster objects into individual members.
3. Tests SIC on every discovered target.
4. Runs a read-only platform check on each target with communicating SIC.

**SIC validation is mandatory.** Only targets that report **Communicating** and pass platform checks can be selected. Devices failing SIC appear in a separate **Failing SIC** box. Targets with an unverified platform or incomplete Security Group availability remain blocked.

No targets are selected automatically. Choose individual targets or **Select All**, which selects only eligible targets across the inventory, including those hidden by the search filter. Targets are sorted by name.

**Refresh Inventory & SIC** repeats discovery, SIC testing, and platform detection, and clears the selection. **Test SIC** reruns SIC and platform checks for currently selected targets; it is an additional refresh, not a replacement for the automatic checks. A selected device that no longer qualifies is removed from selection.

### 3. Prepare the password hash

Under **Password to change**, choose:

- **Gaia user password** — enter an existing username, such as `admin`. The app does not create users.
- **Expert mode password** — changes the system-wide Expert credential on each selected target. No username is required. Gaia user login passwords and GRUB credentials are not changed.

Generate a hash from matching password fields, or paste a raw SHA-512 crypt hash. Switching password type clears the prepared password/hash and confirmation.

The generator creates a new random 16-character salt and uses 5,000 rounds. Accepted hashes have this format:

```text
$6$<16-character salt>$<86-character digest>
```

Paste the raw hash **without backslash escaping**. The app escapes dollar signs when building the shell command.

Generated passwords must contain at least 6 characters and at most 128 UTF-8 bytes. The generator rejects `*`, `!`, backslash, `$`, `#`, single quotes, double quotes, NUL, and line breaks. The restrictions beyond Gaia's documented asterisk limitation are a conservative app compatibility policy based on [sk109148](https://support.checkpoint.com/results/sk/sk109148).

**Check the password policy on all selected targets.** A pasted hash cannot reveal whether its original password meets length, character, or complexity requirements. Keep a recovery session open and verify access after the change.

### 4. Review and apply

Review the selected count, password type, command preview, and scope warning. Type **`RESET N`**, replacing `N` with the selected target count, then choose **Apply Password Hash**.

Immediately before changing each target, the app automatically rechecks SIC and platform eligibility. A failed check skips that target. A platform change since review also skips the target and requires a new review.

The manager executes the password command using `clish -s -c` for standard Gaia or `gclish -s -c` for a confirmed Security Group. The `-s` option saves configuration. No management policy publish is required.

### 5. Review results and verify access

Results show the account scope, timing, counts, and individual target outcomes. Failed and unknown outcomes appear first. Expand recovery steps or redacted technical details as needed, or export the results as JSON.

| Outcome | Meaning |
| --- | --- |
| Succeeded | The password command and configuration save completed. Verify a new login or Expert access yourself. |
| Failed | Execution failed or returned an error. Inspect diagnostics; the password may have changed before a later failure. |
| Skipped | A required preflight check failed, so the password command was not submitted for that target. |
| Unknown | Completion or post-change verification could not be established. The command may still be running or may already have changed the password. Check the device before retrying. |

There is no automatic rollback. Unrelated failures and tasks with unknown completion are not automatically retried.

## Maestro and scalable Security Groups

Platform detection runs through the manager. The read-only probe checks for `gclish` and `asg`, then collects `asg stat` and `asg stat -i sgm_info`. Standard Gaia requires a successful Gaia version response when neither scalable tool is found. Management metadata helps identify conflicts; it is not sufficient proof by itself.

For a confirmed Security Group:

- Select its logical management object (**SMO**) once per group. Individual cluster-member entries that resolve to a Security Group are blocked to avoid duplicate group-wide resets.
- The command uses **gClish across all members and sites**. The review warning states this scope, and inventory provides expandable member-status evidence.
- A positive, fully available `SGMs | N/N` count is required before execution. Unrecognized output, missing tools, unavailable members, or an inconclusive probe block the reset. There is no automatic fallback to local Clish.
- After the global command completes, the app checks group availability and member count again. A degraded or unverifiable result is **Unknown**.

A successful global command and healthy member count do not prove that a new login works on every member. Verify access across the group. Live Maestro operation requires lab validation for your release and topology.

## Configuration-lock recovery

For either password type, an explicit configuration-lock failure triggers recovery through the manager:

1. Run `lock database override` using the target's selected shell: Clish or gClish.
2. Confirm that the override task succeeded, then wait 1.5 seconds before retrying the password command.
3. If the lock persists, allow two more override/retry cycles with waits of 2.5 and 4 seconds.

This takes the configuration lock from another admin session. Coordinate with other administrators before applying. A successful override may include the `CLINFR0771` startup warning; other errors still stop recovery. Failed or unverified overrides stop further password attempts. Each recovery step is retained in the results.

## Operation and data handling

- Keep the app and browser open during a reset. Jobs and results live in server memory; reloading the page loses the browser's app session, and restarting the backend loses all sessions and results. Commands already submitted to Check Point may continue after the app stops.
- Only one reset job can run in an app session at a time. Up to ten completed job records are retained in that session.
- Plaintext passwords used for hashing go to the local app server's OpenSSL process through stdin, not shell arguments. Password fields clear after successful generation. Clear the prepared hash when finished.
- Check Point credentials and SIDs stay server-side. The app does not use browser storage. Script bodies are redacted from optional request logs, and the reset wrapper redacts hashes from returned device diagnostics.
- The manager receives the hash in the script payload and may retain it in its own task or audit records. Treat hashes and exported diagnostics as sensitive.
- The app listens on localhost by default and is intended for a trusted local operator. Add authentication and HTTPS before exposing it remotely. Inherited generic API routes are not a multi-user authorization boundary.

SIC requests have a 120-second timeout. Script polling has a default 180-second budget with intervals that back off up to 4 seconds. `TASK_POLL_ATTEMPTS` and `TASK_POLL_INTERVAL_MS` configure the normal polling budget; large-environment mode uses its separate interval. `RUN_SCRIPT_CONCURRENCY` defaults to 8, reduced to 3 in large-environment mode.

Spark/Gaia Embedded and all-domain MDS resets are not supported. Smart-1 Cloud is the management connection, not a hosted Gaia password-reset target.

## Check Point references

- [Gaia user accounts and password hashes](https://sc1.checkpoint.com/documents/R81.20/WebAdminGuides/EN/CP_R81.20_Gaia_AdminGuide/Content/Topics-GAG/Users-Gaia-Clish.htm)
- [Expert mode password configuration](https://sc1.checkpoint.com/documents/R81.20/WebAdminGuides/EN/CP_R81.20_Gaia_AdminGuide/Content/Topics-GAG/System-Passwords-Gaia-Clish.htm)
- [Clish and gClish invocation](https://sc1.checkpoint.com/documents/R82.10/WebAdminGuides/EN/CP_R82.10_Gaia_AdminGuide/Content/Topics-GAG/Gaia-Clish-Expert-Mode.htm)
- [Security Group status and membership](https://sc1.checkpoint.com/documents/R81.20/WebAdminGuides/EN/CP_R81.20_Maestro_AdminGuide/Content/Topics-Maestro-AG/Showing-Hardware-State-asg_stat.htm)
