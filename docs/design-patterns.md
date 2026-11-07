# Workbench Component Patterns

## Login
Keep SMS as the default. Smart-1 Cloud uses the tenant/context/web_api placeholder. MDS conditionally reveals Domain / CMA and MDS Object Name. Retain both authentication modes, TLS choice and large-environment mode. Use visible labels, associated help text, and inline connection errors. Never replace the working login with mock credentials or data.

## Navigation
Use native buttons for workspace selection and aria-pressed for the active button. Only the selected tool's form is visible. Preserve its entered values while switching. Keep available and unavailable contexts distinguishable with text; never invent availability. New workflow navigation belongs alongside the two existing tools.

## Command Forms
Use the catalog for command choices and parameter metadata. Put context near the request. Keep descriptions concise and advanced parameter details expandable. Show risk before execution and retain existing confirmation handlers. Custom scripts remain editable. Avoid moving or recreating forms in a way that loses listeners.

## Results

Catalog update actions show an inline live status beside the version controls: checking, no changes available, new versions installed, existing catalogs refreshed, or failure. Disable the button while checking and restore it afterward. Keep the summary visible without opening technical details. Do not announce a discovered version as installed before the update completes.
Bind results to the submitted request, context and target. Identify each gateway, distinguish output from errors, and keep raw responses collapsed but accessible. Use textContent for API-controlled text. Preserve monospace whitespace and horizontal scrolling for Gaia tables. Unknown or pending status must not become a success message.

For new result UI, cover initial, waiting, succeeded, partial, failed and empty-output states. Format timestamp objects before display. Expose elapsed/polling limits accurately. Existing backend limitations require separate functional work, not a cosmetic claim of correctness.

## Responsive and Accessible Behavior
Stack content at narrow widths. Do not hide required controls to make them fit. Keep focus outlines, readable contrast and labels. Confine wide output to a scrollable region. Keep primary actions visible and avoid wrapping short button labels. Let longer navigation labels wrap.

## Review Handoff
Report changed surfaces, checks performed, and unverified behavior. Screenshots or browser checks should use realistic long names and mixed results. Run npm run check and JavaScript syntax checks for changed UI scripts. Never claim live SMS/Cloud/MDS verification based solely on mocked tests.

## Required Login Default

Allow Self-Signed Certificate must default to checked for SMS, Smart-1 Cloud, and MDS. Preserve this default in derived apps and agent-driven changes. An omitted API login ignoreTls field defaults to true; an explicit false (unchecked) enables certificate verification for all session contexts. This setting disables TLS certificate verification, not encryption, and does not authenticate the server certificate. Users must remain able to uncheck it. Do not disable TLS verification globally or for catalog downloads.
