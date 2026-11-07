# Framework Workbench Design Review

2026-09-20. Scope: review and standalone interactive mock.

## Direction
Reading this as an operator workbench for Check Point engineers, using neutral surfaces, pink selection states, compact navigation and evidence-first layout.

Taste settings: DESIGN_VARIANCE 3, MOTION_INTENSITY 2, VISUAL_DENSITY 6. Use native HTML/CSS and system fonts. Taste's landing-page-specific rules do not apply to dense product UI; its companion redesign guidance informs this proposal.

Reference inspected: the framework's design system, login patterns, public/index.html, and styles.css.

## Findings
| Current Pattern | Impact | Proposal |
| --- | --- | --- |
| Large stacked branding and uppercase connection URL | Competes with working area | Compact title and readable connection information |
| Four large context cards plus context selectors | Repeated information consumes space | Context selection alongside execution, with availability |
| Explorer, Gaia form and results stacked vertically | Scrolling separates action from evidence | Command navigation beside request and result |
| Oversized login typography | Form dominates screen | Hardening-style split login and 44px controls |
| Generic result section | Target relationship is harder to scan | Named targets and nearby decoded output |
| Preformatted output wraps anywhere | Gaia columns lose alignment | Horizontally scrollable monospace output |

## Mock
Open [design-mock.html](design-mock.html). Switch between login and workspace, choose SMS/Smart-1 Cloud/MDS, switch authentication, and preview API or Gaia output. All data is fictional. No network calls or credential storage.

The palette uses #eef2f7, #142033, #526278, #ca004c, and #ffe9f1, with 6px controls, modest typography and command-to-result navigation. Scanner checks and remediation content are not part of the framework.

## Integration Requirements
Retain all management types, field identities, contexts, SessionManager dispatch, throttling, risk confirmations and raw responses. Bind each result to the submitted context and target. Add pending, failed, partial, empty and expired-session states before integrating.

Source review found separate functional issues: the command explorer still uses the generic renderer for run-script; polling selects the first result containing output instead of aggregating all tasks to completion; unknown task status can be labeled completed; timestamp objects need formatting. The mock demonstrates presentation and does not fix or validate those behaviors.

## Review Boundaries
This is a source-based audit and design proposal. Production files are unchanged. Browser validation should cover desktop/mobile layouts, keyboard navigation, long tenant URLs and long Gaia output before production adoption.

## Required Login Default

Allow Self-Signed Certificate must default to checked for SMS, Smart-1 Cloud, and MDS. Preserve this default in derived apps and agent-driven changes. An omitted API login ignoreTls field defaults to true; an explicit false (unchecked) enables certificate verification for all session contexts. This setting disables TLS certificate verification, not encryption, and does not authenticate the server certificate. Users must remain able to uncheck it. Do not disable TLS verification globally or for catalog downloads.

## Password Changer polish — 2026-11-07

Refined against the toolbox workbench and login design system. Review covered active navigation, account/password field grouping, SIC badges and selected-row state, visible progress/error feedback, compact header, and narrow-screen containment. An independent source review found these five issues addressed and no material regression within that scope.

Browser checks used only the synthetic preview on port 3009: automatic inventory/SIC, Select All, account type switching, Expert review, disabled Apply without a prepared hash, and navigation. At a 390px viewport, document width was 390px; the target table scrolls internally. No live password changes were executed. All 27 automated checks pass.

Detector exceptions: its table-wrapper inset warning is intentional because cells provide their own padding and the table header meets the container edge. Thick side-border warnings trace to unused inherited base styles, not the rendered password workbench. Existing design tokens and DESIGN.md were preserved, with a scoped Password Changer pattern description added.

## Execution receipt refinement — 2026-11-07

Responded to the user's screenshot showing an oversized blank result area and weak target/status grouping. Added outcome receipt, account scope, timestamps, duration, status totals, adjacent target badges, failure-first ordering, and separate recovery/raw disclosures. Checked synthetic single-success and mixed-unknown outcomes in browser, including expanded recovery steps. Mobile viewport and page width both measured 390px. Detector returned no findings for the results renderer and stylesheet; all 35 checks pass. No live password reset was executed.
