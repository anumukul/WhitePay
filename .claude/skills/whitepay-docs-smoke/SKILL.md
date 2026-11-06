---
name: whitepay-docs-smoke
description: Verify WhitePay's literal docs snippets, published SDK consumption and local documentation links without wallets or broadcasts.
---

Read docs/progress/STATE.md and docs/progress/step-14.md before running checks. Respect the user's current authorization. Never request or print secrets, signatures, keystores or authentication URLs.

1. Install the frozen workspace lockfile with lifecycle scripts disabled. Verify apps/docs resolves @whitepay/node and @whitepay/react to the exact published npm versions recorded in its package.json and lockfile, rather than workspace links.
2. Run `pnpm --filter @whitepay/docs test`. This checks content and compiles literal copied TypeScript/React snippets in a temporary consumer. Report real failures; fix incorrect docs/API references without weakening the compiler or removing examples to hide errors.
3. Run `pnpm --filter @whitepay/docs build`, then `pnpm --filter @whitepay/docs test:browser` with an installed Playwright browser or CHROME_EXECUTABLE_PATH. Visit all planned pages, verify internal links/anchors, and inspect desktop/mobile output. Browser checks are local and do not broadcast.
4. Check public registry integrity against docs/evidence/sdk-publish-preview.json when assessing publication. A build, tarball or zero-exit upload is not registry availability. Inspect exact versions/tags before retrying any ambiguous publication.
5. Update the existing Step 14 report with results, mismatch/blockers and manual commands. Label controlled receipts and incomplete hosted/source-verification work. A docs-only live checkout walkthrough remains a separate human/payment gate.

Never publish a package, deploy a site, sign a payment or broadcast as part of smoke checks. Commit/push only within explicit user authorization; do not infer authority from a passing test.
