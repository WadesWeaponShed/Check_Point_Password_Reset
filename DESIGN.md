# Framework Design System

The approved interface is a compact operator workbench with a consistent toolbox design system. This document is the visual reference for applications built on this framework.

## Tokens
| Role | Value |
| --- | --- |
| Page | #eef2f7 |
| Surface | #ffffff |
| Subtle surface | #f8fafc |
| Navigation | #f4f6fa |
| Main text | #142033 |
| Secondary text | #526278 |
| Borders | #d8e0ea |
| Primary action | #ca004c |
| Primary hover | #a90040 |
| Selected surface | #ffe9f1 |
| Selected text / border | #a50040 / #f4c1d3 |

Use existing CSS variables; add named tokens for repeated new values. Green, amber, and red indicate actual status, with text labels as well as color.

## Typography and Geometry
Use local system sans-serif fonts and monospace for commands, JSON, IDs and output. No font downloads. Working headings are about 23px, labels 13px at weight 600, help text 12–13px. Login introduction may use 38px text; brand subtitle 25px. Keep uppercase and bold restrained.

Controls are at least 44px tall, with 6px corners. Status badges use 4px corners. The page has a 1440px maximum width and 20px side gutters. The desktop navigation is 244px wide. Content has 24px vertical and 28px horizontal padding. Prefer separators to nested cards.

## Layout
Login is a two-column introduction and form, maximum 1080px wide. Preserve the management selector, conditional fields, authentication modes and environment options.

The workspace has a compact connection header followed by navigation and a content column. API Command Explorer and Gaia Run-Script share a nearby result area. Context availability stays visible in navigation; context selection remains attached to the relevant form.

At 850px or narrower, navigation moves above content and login becomes one column. Existing form breakpoints still apply. Long URLs and IDs can wrap; columnar output scrolls horizontally within its own container.

## Implementation
Base styles: public/styles.css. Approved layout: public/workbench.css and public/workbench.js. Keep load order and existing form IDs/listeners intact. A new workflow should reuse the same surfaces and controls.

Avoid decorative dashboards, animated backgrounds, marketing hero treatments, large empty cards and unrelated fonts. Motion should explain feedback or state and respect reduced-motion preferences if introduced.

## Verification
Check desktop and narrow screens, keyboard focus, selected navigation, long tenant URLs, MDS field expansion, password/API-key switching and output overflow. Use sample or intercepted responses for visual checks; do not run live gateway operations solely to validate styling.

See docs/design-patterns.md and skills/framework-design/SKILL.md for extension guidance.

## Required Login Default

Allow Self-Signed Certificate must default to checked for SMS, Smart-1 Cloud, and MDS. Preserve this default in derived apps and agent-driven changes. An omitted API login ignoreTls field defaults to true; an explicit false (unchecked) enables certificate verification for all session contexts. This setting disables TLS certificate verification, not encryption, and does not authenticate the server certificate. Users must remain able to uncheck it. Do not disable TLS verification globally or for catalog downloads.

## Password Changer workbench

The password tool uses a compact header, slate navigation, pink active selection, and 6px controls. The workspace is capped at 1440px with 24px desktop gutters. Its four navigation buttons display one workflow panel at a time, retaining all entered state; the active button uses aria-pressed and aria-current. Navigation becomes a two-column control group below 850px.

SIC states use text badges: green for communicating, red for noncommunicating or test failure, neutral for pending or untested. Selected inventory rows use a restrained pink tint. API content stays text-only. The target table scrolls inside its own bounded container. Empty and filtered inventory states include explanatory text. Progress and errors appear above the workbench, near the connection context.

The password form pairs account type and username, separates password source, then pairs New password and Confirm password. Compatibility guidance stays available in a native disclosure. Review retains the warning, concealed command preview, and typed confirmation. Starting a reset opens Execution results; raw task details remain collapsed. The UI introduces no new gateway operations.

### Execution results

Render a compact execution receipt: semantic outcome band, account scope, timestamps/duration, and inline outcome counts. Keep target status beside its name, with address/type below. Sort unknown and failed outcomes before successes. Retain human-readable lock-recovery phases and collapsed raw responses with hash redaction. Preserve open disclosures during polling. Results size to their content rather than inheriting the workbench's minimum height. Single-target and multi-target runs use the same flat records, with explicit next-step guidance.
