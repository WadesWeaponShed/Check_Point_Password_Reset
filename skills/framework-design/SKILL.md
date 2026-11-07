---
name: framework-design
description: Extend or review the Check Point API Framework UI using its approved workbench design, login patterns, and command/result presentation. Use for frontend changes in this framework or apps derived from it.
---

# Framework Design

Use this skill from a checkout of the framework. It requires no external service or design package.

Before UI work, read AGENTS.md, DESIGN.md, and docs/design-patterns.md at the repository root. If invoked outside the checkout, locate those files before changing the interface.

Inspect public/index.html, public/styles.css, public/workbench.css, public/workbench.js and the affected behavior in public/app.js. Reuse existing tokens, controls and form identities. Preserve SMS, Smart-1 Cloud and MDS behavior through the existing session layer.

For a new feature, identify its place in navigation, input/context selection, execution and result presentation. Prefer the established compact layout and native stack. Use the requested scope: review requests produce findings; mock requests produce clearly labeled examples; implementation requests change the working interface.

Use DESIGN.md for visual values and docs/design-patterns.md for interaction requirements. These project-specific choices override generic taste defaults; explicit user direction can evolve them. Update the design documents when the user approves a new convention.

Verify affected states at desktop and narrow widths, with keyboard access and realistic long text. Test API-dependent UI using synthetic data unless live operation is requested. Run npm run check and syntax checks for changed frontend scripts. Report what was verified and what still requires a live environment.

## Required Login Default

Allow Self-Signed Certificate must default to checked for SMS, Smart-1 Cloud, and MDS. Preserve this default in derived apps and agent-driven changes. An omitted API login ignoreTls field defaults to true; an explicit false (unchecked) enables certificate verification for all session contexts. This setting disables TLS certificate verification, not encryption, and does not authenticate the server certificate. Users must remain able to uncheck it. Do not disable TLS verification globally or for catalog downloads.
