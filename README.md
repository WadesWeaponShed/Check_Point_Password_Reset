# Check Point Password Changer

Reset **Gaia user passwords** or the **Expert mode password**, or recover a Gaia user login using a new password, across selected gateways, cluster members, and Check Point servers from one local workbench.

All device access goes through the connected **SMS, CMA, or Smart-1 Cloud Management API**. The app uses `run-script` and polls `show-task` for completion. It does not connect directly to devices over SSH or require their existing login passwords.

Created using [Check Point API Framework](https://github.com/WadesWeaponShed/Check-Point-API-Framework).

## Install and run

Install this app on an administrator workstation or a trusted administration host, rather than on a Gaia appliance. The browser connects to the app; the app host needs HTTPS connectivity to the manager, and the manager needs working SIC / run-script connectivity to the targets.

The operator needs Management API permissions to list gateway/server objects, test SIC, execute scripts, and read task results. Validate target compatibility in your environment before bulk changes, especially on scalable platforms.

### 1. Install prerequisites

| Dependency | Download / installation | Required for |
| --- | --- | --- |
| Node.js and npm | Install a currently supported **LTS** release from [Node.js downloads](https://nodejs.org/en/download/). npm is included in the installer. The code requires Node.js 18 or newer, but use a supported LTS for a new installation. | Running the app |
| OpenSSL | Install an OpenSSL executable with `passwd -6` support using the instructions below. | Built-in password hash generation; pasted compatible hashes do not need OpenSSL |
| Git | [Download Git](https://git-scm.com/downloads), or use the ZIP option below. | Cloning and updating; optional for ZIP installs |

**macOS:** If you use [Homebrew](https://brew.sh/), install [OpenSSL 3](https://formulae.brew.sh/formula/openssl@3) and put it first on the current shell's PATH:

```sh
brew install openssl@3
export PATH="$(brew --prefix openssl@3)/bin:$PATH"
```

The macOS-provided executable may not support `passwd -6`. Start the app from the same shell after setting PATH. For a service or a new terminal, configure that environment's PATH separately.

**Debian / Ubuntu Linux:** Install OpenSSL using the distribution package manager:

```sh
sudo apt-get update
sudo apt-get install openssl
```

Install Node.js LTS separately using the Node.js download instructions; distribution repositories may offer an older version. Other Linux distributions should use their own package manager for OpenSSL.

**Windows:** Install Node.js LTS, then select an OpenSSL installer appropriate to your machine from the [OpenSSL project's binary installation page](https://github.com/openssl/openssl/wiki/Binaries). Ensure the directory containing `openssl.exe` is on PATH. Reopen PowerShell after changing PATH. Installing Git alone does not guarantee that OpenSSL is available to the Node process.

Verify prerequisites in the terminal you will use to start the app:

```sh
node --version
npm --version
openssl version
openssl passwd -6
```

The final command prompts for a test password and should produce a value starting with `$6$`. Use a disposable test value. If `-6` is unsupported or the executable is missing, fix OpenSSL / PATH before using the generator.

### 2. Download the app

**With Git** (macOS, Linux, or PowerShell):

```sh
git clone https://github.com/WadesWeaponShed/Check_Point_Password_Reset.git
cd Check_Point_Password_Reset
```

**Without Git:** [Download the main branch ZIP](https://github.com/WadesWeaponShed/Check_Point_Password_Reset/archive/refs/heads/main.zip), extract it, and open a terminal in the extracted `Check_Point_Password_Reset-main` directory. The working directory must contain `package.json`, `src`, and `public`.

There are **no third-party npm dependencies**, no database, and no build step. `npm install` is not required. The bundled API catalogs allow startup without an internet connection once prerequisites and source files are installed.

### 3. Check and start

From the app directory:

```sh
npm run check
npm start
```

`npm run check` checks JavaScript syntax; it does not validate live Check Point connectivity. Keep the start terminal open. Open **http://127.0.0.1:3000** in a browser on the same host. Stop the process with **Ctrl+C** when no reset is running.

To use port 3008 on macOS / Linux:

```sh
PORT=3008 npm start
```

In Windows PowerShell:

```powershell
$env:PORT = "3008"
npm start
```

### 4. Verify the deployment

In a second terminal, check the default port (replace `3000` if configured differently):

```sh
curl --fail http://127.0.0.1:3000/api/health
```

In Windows PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

Expect `ok: true`, a request ID, and a server timestamp. Load the browser UI and use its password generator with matching disposable values to verify OpenSSL integration. A generated hash should start with `$6$`. These checks require no manager credentials and do not change any device.

An operator can then log in to a manager and verify that inventory, automatic SIC checks, and platform detection complete. Device password resets are a separate, explicitly confirmed operator action; do not use them as a deployment smoke test.

### Runtime configuration

Set environment variables in the launching shell or service configuration. **The app does not automatically load `.env` files.**

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Listening address; retain localhost for local use |
| `PORT` | `3000` | HTTP port |
| `RUN_SCRIPT_CONCURRENCY` | `8` | Concurrent device operations |
| `LARGE_ENV_RUN_SCRIPT_CONCURRENCY` | `3` | Device concurrency in Large Environment Mode |
| `LARGE_ENV_API_CONCURRENCY` | `10` | API concurrency in Large Environment Mode |
| `TASK_POLL_ATTEMPTS` | `180` | Normal task polling budget |
| `TASK_POLL_INTERVAL_MS` | `1000` | Normal initial polling interval in milliseconds |
| `LARGE_ENV_TASK_POLL_INTERVAL_MS` | `1250` | Large Environment Mode polling interval |
| `CP_API_LOGGING` | Unset | Any nonempty value enables redacted API request logs; leave unset to disable |
| `CATALOG_AUTO_UPDATE` | Unset | Set exactly `true` to enable catalog refresh at startup; requires internet access |

No manager credentials belong in deployment files. Enter them in the UI after startup. The app is intended for a trusted local operator; remote access requires an authenticated HTTPS access layer. See **Operation and data handling** before changing the listening address.

### Deployment-agent checklist

1. Choose a writable installation directory on the administration host. Install supported Node.js LTS and, for generation, an OpenSSL executable supporting `passwd -6`.
2. Clone or extract this repository. Preserve the directory layout; do not serve `public` alone or run only a static web server.
3. Set the working directory to the repository root. Set PATH, HOST, and PORT explicitly in the launch environment as needed. Keep the default localhost binding unless remote access has been deliberately configured.
4. Run `npm run check`, then launch `npm start`. For unattended operation, use the host's service manager with the same working directory and environment, a non-root service account, and process restart / logging configured. Shell exports do not automatically carry into services.
5. Verify `/api/health`, the browser UI, and disposable hash generation. Do not store real passwords in commands, logs, or deployment reports, and do not submit a reset during installation.
6. Report the installed directory, source commit (when using Git), Node.js version, listening URL, start / stop method, and verification results. Hand manager login and target selection to the operator. Sessions and results are not durable across restarts.

### Update an existing installation

Wait for running work to finish and export any results you need, then stop the app. For a Git installation:

```sh
git pull --ff-only
npm run check
npm start
```

If Git reports local changes or a divergent branch, review them before updating. For a ZIP installation, extract a fresh copy and launch it using the same environment settings. Verify health and hash generation again after updating. An operator must log in again after restart.

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
5. Reads the configured password hashing method using Clish (gClish for detected Security Groups). The **Hashing** column shows the configured method for new passwords, not the hash of an existing account. A failed lookup shows **Unavailable** without changing reset eligibility.

**SIC validation is mandatory.** Only targets that report **Communicating** and pass platform checks can be selected. Devices failing SIC appear in a separate **Failing SIC** box. Targets with an unverified platform or incomplete Security Group availability remain blocked.

No targets are selected automatically. Choose individual targets or **Select All**, which selects only eligible targets across the inventory, including those hidden by the search filter. Targets are sorted by name.

Click a column heading to sort. Open its **All values** menu to check or uncheck values found in that table. Column filters combine with the inventory search. Filtering hides rows without clearing selected targets; the inventory count shows any hidden selections.

**Refresh Inventory & SIC** repeats discovery, SIC testing, and platform detection, and clears the selection. **Test SIC** reruns SIC and platform checks for currently selected targets; it is an additional refresh, not a replacement for the automatic checks. A selected device that no longer qualifies is removed from selection.

### 3. Prepare a Password Hash or Account Recovery

Under **Password to change**, choose:

- **Gaia user password** — enter an existing username, such as `admin`. The app does not create users.
- **Recover Gaia user access (password)** — set a new plaintext password for an existing Gaia user if a hash change leaves you unable to log in. Follow the recovery instructions below.
- **Expert mode password** — changes the system-wide Expert credential on each selected target. No username is required. Gaia user login passwords and GRUB credentials are not changed.

For either hash-based option, generate a hash from matching password fields, or paste a raw SHA-512, SHA-256, or MD5 crypt hash. Recovery uses the password fields directly and does not generate a hash. Switching password type clears the prepared password/hash and confirmation.

Choose **Hash Method** before generating. SHA-512 is the default. Use MD5 only for legacy compatibility where the target release supports it.

| Method | Prefix | Generated salt | Digest |
| --- | --- | --- | --- |
| SHA-512 | `$6$` | 16 characters | 86 characters |
| SHA-256 | `$5$` | 16 characters | 43 characters |
| MD5 crypt | `$1$` | 8 characters | 22 characters |

OpenSSL must support the corresponding `passwd` option: `-6`, `-5`, or `-1`. The Hashing inventory column reports the target's configured default; it does not change the selected method or guarantee that a target accepts a given hash.

Paste the raw hash **without backslash escaping**. The app escapes dollar signs when building the shell command.

Generated passwords must contain at least 6 characters and at most 128 UTF-8 bytes. The generator rejects `*`, `!`, backslash, `$`, `#`, single quotes, double quotes, NUL, and line breaks. The restrictions beyond Gaia's documented asterisk limitation are a conservative app compatibility policy based on [sk109148](https://support.checkpoint.com/results/sk/sk109148).

**Check the password policy on all selected targets.** A pasted hash cannot reveal whether its original password meets length, character, or complexity requirements. Keep a recovery session open and verify access after the change.

### Account Recovery After a Failed Hash Change

Choose **Recover Gaia user access (password)** under **Password to change**. Use **Password & Recovery** in the left menu, enter the existing Gaia username (for example, `admin`), and enter the new password twice. Choose **Review Change**, check the target scope, type `RESET N` for the selected target count, then choose **Apply Recovery Password**. You do not need the current Gaia user password. This uses the same automatically discovered inventory, mandatory SIC/platform checks, Select All eligibility, lock recovery, task polling, and Security Group scope as hash resets.

The manager submits `clish -c 'set user <username> newpass <password>'`, checks the command result, then runs `clish -c 'save config'`. Confirmed Security Groups use `gclish` for both commands. OpenSSL is not needed for this mode. This app calls the authenticated Management API; no local `mgmt_cli -r true` or target SSH login is required.

Recovery requires working management API access and SIC. It does not repair SIC, unlock a locked-out account, create users, or change the Expert password. Password policy still applies. For unambiguous Clish input, this mode accepts 6–128 ASCII characters using letters, digits, and `@ % _ + = : , . / ? -`; whitespace and other punctuation are rejected before submission.

**The plaintext password is sent to the manager inside the script and may be retained in manager task/audit records or be visible to privileged process inspection on the target.** The app conceals it in previews and exports and suppresses raw recovery command output. Recovery failures report a safe diagnostic category instead. Verify a new login after success; there is no rollback.

**Expert recovery:** Use **Expert mode password** with a valid hash. The plaintext Gaia user recovery option does not apply to Expert mode. In our lab test, piping responses to `set expert-password` still requested the current Expert password and rejected the attempt; it is not implemented as an automated recovery method.

### 4. Review and apply

Review the selected count, password type, command preview, and scope warning. Type **`RESET N`**, replacing `N` with the selected target count, then choose **Apply Password Hash** for a hash change or **Apply Recovery Password** for Gaia account recovery.

Immediately before changing each target, the app automatically rechecks SIC and platform eligibility. A failed check skips that target. A platform change since review also skips the target and requires a new review.

For hash changes, the manager executes the password command using `clish -s -c` for standard Gaia or `gclish -s -c` for a confirmed Security Group. The `-s` option saves configuration. No management policy publish is required.

### 5. Review results and verify access

Results show the account scope, timing, counts, and individual target outcomes. Failed and unknown outcomes appear first. Expand recovery steps or redacted technical details as needed, or export the results as JSON.

| Outcome | Meaning |
| --- | --- |
| Succeeded | The password command and configuration save completed. Verify a new login or Expert access yourself. |
| Failed | Execution failed or returned an error. Inspect diagnostics; the password may have changed before a later failure. |
| Skipped | A required preflight check failed, so the password command was not submitted for that target. |
| Unknown | Completion or post-change verification could not be established. The command may still be running or may already have changed the password. Check the device before retrying. |

For standard Gaia user hash resets, the gateway compares the saved hash with the submitted hash and returns only a verification verdict. A mismatch, missing user, or unavailable check appears separately from the save result. This does not verify login access. Stored-hash verification does not run for Maestro, Expert mode, or plaintext recovery.

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

For hash resets and Gaia account recovery, an explicit configuration-lock failure triggers recovery through the manager:

1. Run `lock database override` using the target's selected shell: Clish or gClish.
2. Confirm that the override task succeeded, then wait 1.5 seconds before retrying the password command.
3. If the lock persists, allow two more override/retry cycles with waits of 2.5 and 4 seconds.

This takes the configuration lock from another admin session. Coordinate with other administrators before applying. A successful override may include the `CLINFR0771` startup warning; other errors still stop recovery. Failed or unverified overrides stop further password attempts. Each recovery step is retained in the results.

## Operation and data handling

- Keep the app and browser open during a reset. Jobs and results live in server memory; reloading the page loses the browser's app session, and restarting the backend loses all sessions and results. Commands already submitted to Check Point may continue after the app stops.
- Only one reset job can run in an app session at a time. Up to ten completed job records are retained in that session.
- Plaintext passwords used for hashing go to the local app server's OpenSSL process through stdin, not shell arguments. Password fields clear after successful generation. Clear the prepared hash when finished.
- Check Point credentials and SIDs stay server-side. The app does not use browser storage. Script bodies are redacted from optional request logs, and the reset wrapper redacts hashes from returned device diagnostics.
- The manager receives the hash (or plaintext password in recovery mode) in the script payload and may retain it in its own task or audit records. Treat hashes and exported diagnostics as sensitive.
- The app listens on localhost by default and is intended for a trusted local operator. Add authentication and HTTPS before exposing it remotely. Inherited generic API routes are not a multi-user authorization boundary.

SIC requests have a 120-second timeout. Script polling has a default 180-second budget with intervals that back off up to 4 seconds. `TASK_POLL_ATTEMPTS` and `TASK_POLL_INTERVAL_MS` configure the normal polling budget; large-environment mode uses its separate interval. `RUN_SCRIPT_CONCURRENCY` defaults to 8, reduced to 3 in large-environment mode.

Spark/Gaia Embedded and all-domain MDS resets are not supported. Smart-1 Cloud is the management connection, not a hosted Gaia password-reset target.

## Check Point references

- [Gaia user accounts and password hashes](https://sc1.checkpoint.com/documents/R81.20/WebAdminGuides/EN/CP_R81.20_Gaia_AdminGuide/Content/Topics-GAG/Users-Gaia-Clish.htm)
- [Expert mode password configuration](https://sc1.checkpoint.com/documents/R81.20/WebAdminGuides/EN/CP_R81.20_Gaia_AdminGuide/Content/Topics-GAG/System-Passwords-Gaia-Clish.htm)
- [Clish and gClish invocation](https://sc1.checkpoint.com/documents/R82.10/WebAdminGuides/EN/CP_R82.10_Gaia_AdminGuide/Content/Topics-GAG/Gaia-Clish-Expert-Mode.htm)
- [Security Group status and membership](https://sc1.checkpoint.com/documents/R81.20/WebAdminGuides/EN/CP_R81.20_Maestro_AdminGuide/Content/Topics-Maestro-AG/Showing-Hardware-State-asg_stat.htm)
