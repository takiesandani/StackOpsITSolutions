# Automated Reports dashboard correction

## Objective

Repair the existing client portal Automated Reports dashboard so its compact metric strip is responsive and never overlaps. Make every displayed summary metric derive only from the reports API response and clearly distinguish a historical trend from the current security health score.

## Existing application context

Work in the existing client portal implementation, principally `js/clientportal.js` and `css/clientportal.css`. Preserve its visual language and reusable dashboard patterns. Do not build a mockup or introduce manual/static report values.

## Required outcome

- The summary cards around the report intelligence area must have enough room for labels, pills, and values without collision at desktop, tablet, or mobile widths.
- Do not label a current security-health value as "Health trend". The trend must be calculated only from report history and should be omitted or shown as unavailable if fewer than two report snapshots exist.
- Retain a distinct current security-health card only when its value comes from the latest report/overview summary.
- Retain risk movement and resolved count only when computed from the report data; safely handle absent history/data without invented values.
- Keep the UI strictly read-only with respect to evidence: no hard-coded report score/count fallbacks or manual dashboard inputs.

## Visual direction

Compact dark operational dashboard; practical rather than decorative. Use stable CSS grid/flex wrapping, sensible min-widths, ellipsis/wrapping where appropriate, and clear hierarchy. Preserve existing typography, colors, and icon conventions.

## Verification

Run a syntax check for modified JavaScript and inspect the resulting UI with the project’s normal local setup if it can be accessed. Report the exact files changed.
