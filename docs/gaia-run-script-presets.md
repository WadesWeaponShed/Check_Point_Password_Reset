# Adding Gaia Run-Script Presets

The preset catalog at `public/data/gateway-run-script-presets.json` is the reusable library for Gaia commands shown in the UI. Add a preset when a command is broadly useful and can be described safely.

## Preset Shape

```json
{
  "id": "unique-kebab-case-id",
  "name": "Readable Command Name",
  "script": "gaia command here",
  "description": "What it collects or changes.",
  "tags": ["Category", "Purpose"],
  "risk": "safe"
}
```

Use one of these risk levels:

| Risk | Use for | UI behavior |
| --- | --- | --- |
| `safe` | Read-only monitoring or information collection | Runs without an extra confirmation. |
| `caution` | Actions that trigger a check, update, install, stop a service, or change configuration | Shows a change warning and requires confirmation. |
| `danger` | Commands that disable protection, revert a patch, remove configuration, or have significant impact | Shows a high-risk warning and requires confirmation. |

## Rules

- Keep scripts literal and reviewable; never interpolate unchecked text into a preset.
- Prefer read-only commands when the goal is collection.
- Include required placeholders clearly, such as `/full/path/package.tar`.
- Do not add destructive commands as `safe`.
- Do not automatically execute a preset merely because it is selected.
- If a command is version-, platform-, Maestro-, or support-guidance-specific, state that in the description and tags.
- Add a test assertion in `test/framework.test.js` for any important new preset or risk classification.

## Result Handling

The framework decodes the Check Point task's Base64 `responseMessage` and presents outputs per gateway. A command can return a task status without output, or a mix of successful and failed targets. Preserve all of these results; do not reduce them to a single success/failure string.

## Required Login Default

Allow Self-Signed Certificate must default to checked for SMS, Smart-1 Cloud, and MDS. Preserve this default in derived apps and agent-driven changes. An omitted API login ignoreTls field defaults to true; an explicit false (unchecked) enables certificate verification for all session contexts. This setting disables TLS certificate verification, not encryption, and does not authenticate the server certificate. Users must remain able to uncheck it. Do not disable TLS verification globally or for catalog downloads.
