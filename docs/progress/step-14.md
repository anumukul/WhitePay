# Step 14 — docs and SDK alpha release

Status: SDK_PUBLICATION_VERIFIED; DOCS_LOCAL_CHECKS_GREEN; HUMAN_DOCS_WALKTHROUGH_OPEN; LATEST_TAG_CLEANUP_FAILED.

The user approved both exact public MIT alpha releases, then explicitly authorized committing/pushing the reviewed release work to origin/main and continuing implementation. npm publisher anumukul is the verified owner of the whitepay organization.

## Released packages

| Package                                                                          | Version       | Registry integrity verified |
| -------------------------------------------------------------------------------- | ------------- | --------------------------- |
| [@whitepay/node](https://www.npmjs.com/package/@whitepay/node/v/0.1.0-alpha.0)   | 0.1.0-alpha.0 | yes                         |
| [@whitepay/react](https://www.npmjs.com/package/@whitepay/react/v/0.1.0-alpha.0) | 0.1.0-alpha.0 | yes                         |

Exact archives were audited and published from `/private/tmp/whitepay-npm-release-y8v2ylfd/`. Public file lists and SHA-256/SHA-512 hashes are in `docs/evidence/sdk-publish-preview.json`. Each contains eight files: compiled ESM, declarations, package.json, README, CHANGELOG and LICENSE. Node has no runtime dependencies; React pins viem 2.38.5 and requires React >=18. No SDK payment behavior changed.

Release preparation added MIT licenses/changelogs, GitHub metadata, public alpha publishConfig and clean prepack builds. Development maps were removed from emitted output. README configuration matches explicit self-hosted API and ESM usage. Archive audit rejects private/operator/runtime-workspace material and credential patterns. Both exact archives passed npm publish --dry-run before the specific publication approval.

## Executed validation

- Both SDK typechecks, 23 Node SDK tests and 25 React safety tests passed.
- Independent Node archive installation passed real local API/idempotency/webhook/type checks; six React archive Chrome scenarios passed.
- After publication, fresh registry installs passed Node HTTP transport/idempotency/error/webhook checks against a disposable loopback fixture; TypeScript positive/negative consumer checks; React imports/SSR; browser bundling/rendering and missing-wallet rejection in isolated headless Chrome.
- Registry SHA-512 integrity matched both approved archives. Alpha tags resolve to the exact approved versions.
- No real wallets, new signatures or chain broadcasts were used by these checks. Post-publication fixture/browser smoke tests do not prove a hosted API or another live payment.

## npm processing and unresolved tag behavior

Both archive uploads exited 0. npm initially reported processing; exact versions temporarily returned E404, and a temporary 0.0.0-stage placeholder appeared. The newer CLI's stage queue was empty: this was processing, not a confirmed staged approval queue. Both actual versions subsequently became public. Do not install the placeholder or retry uploads.

Although both publishes explicitly used --tag alpha, npm processing also assigned latest automatically. Removing latest failed with registry HTTP 400 (E400); it has not been verified removed. No cleanup process remains running. Browser verification was opened directly in Google Chrome and authentication URLs/raw authentication output were withheld. Consumers should explicitly install @alpha. No stable release is claimed.

## Documentation website continuation

SDK release preparation and evidence were committed as `8704393` and pushed to origin/main. Git author identity was missing in this execution environment; the commit used the same author name/email as the previous repository commits through per-command configuration, without altering global settings.

Implemented `apps/docs` with pinned Nextra 3.3.1, Next.js 15.5.12 and React 18.3.1, following the plan's Nextra option. This is a separate static documentation app; no existing runtime framework/dependency declarations were changed. The lockfile adds docs dependencies and exact public registry SDK versions, not workspace SDK links. The 19 pages cover overview, architecture/trust, prerequisites, install, quickstart, merchant bridge, products/prices/sessions, wallets, statuses, fees, webhooks, idempotency, API/errors, contracts/evidence, local development, security, limitations, troubleshooting and changelog. The frontend example is under 20 lines and explicitly requires authenticated server ownership and webhook fulfillment.

Updated root README to reflect actual npm releases and remove a misleading real-dollar/testnet claim. Extended the existing Step 14 runbook. Added a docs-smoke project skill and a CI docs job. CI has not run remotely for these uncommitted additions.

### TDD and fixes

RED: three initial documentation tests failed with ENOENT because the required pages did not exist. GREEN: all required pages and links now pass. A fourth check verifies examples consume actual exact registry SDK artifacts, rejecting workspace symlinks.

The build caught unsupported Nextra v3 theme options (removed after checking installed types) and Next's reserved /api route (reference page moved to /api-reference). Browser harness fixes normalize its export root and independently HTTP-check same-page anchors, whose browser navigation returns no response. The added search regression also failed: Nextra 3's lazy search loader discarded the first query while its index loaded (No results found, no missing resources or runtime errors). Replaced the search through Nextra's supported theme component hook with a generated static page index and React query state that recomputes after data arrives. The same immediate-query test now passes, including result navigation. Mobile Menu → Limitations navigation also passes. No assertion was skipped to hide a missing page.

### Commands actually run

- `pnpm install --frozen-lockfile --ignore-scripts`: exit 0.
- `pnpm --filter @whitepay/docs test`: exit 0, 4 tests; 6 literal TypeScript/React blocks compile against registry SDKs; 3 shell blocks syntax-check only (not executed).
- `pnpm --filter @whitepay/docs typecheck`: exit 0.
- `pnpm --filter @whitepay/docs build`: exit 0; static export with all 19 content pages in ignored out/.
- `CHROME_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' pnpm --filter @whitepay/docs test:browser`: exit 0, all 19 pages plus 24 internal links/anchors; desktop/mobile layout, initial-query search, search result navigation and mobile menu; no browser runtime errors. Screenshots stored only in the OS temporary directory and inspected.
- Scoped Prettier check and `git diff --check`: pass. Frozen lockfile verified; existing workspace importer declarations remain unchanged.
- SDK typechecks and both SDK suites rerun successfully using a disposable loopback PostgreSQL cluster; the cluster was stopped and removed. The first attempt without TEST_DATABASE_URL/loopback permission failed for environment prerequisites and was not treated as a product regression.

### Manual review and remaining gates

Run `pnpm --filter @whitepay/docs dev` and open http://localhost:3400. Review install/quickstart/server/webhooks/contracts/limitations; navigate on mobile and desktop. Full commands and expected results are in the existing publishing runbook and apps/docs/README.md.

A new developer's docs-only actual checkout walkthrough remains open: no extra live payment is authorized or performed by docs checks. Public docs hosting, Step 13 hosting/operational hardening and Step 04 explorer source verification remain open. The user explicitly approved committing/pushing this documentation implementation and moving to Step 15. The docs-only actual payment walkthrough remains open as evidence, rather than being inferred from that code approval. The SDK release commit is already pushed.

Step 13 hosted-service gaps and Step 04 explorer source verification remain open. No hosted deployment or further npm/chain write is included in the current continuation. Git commit/push of this reviewed release preparation is explicitly authorized by the user's latest request.

Human code approval: user requested committing/pushing the completed docs work and starting Step 15. This authorizes the reviewed docs commit to origin/main; it does not close hosted/payment/source-verification gaps or authorize another chain transaction.
