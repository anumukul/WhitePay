# Step 14 — docs and SDK alpha release

Status: SDK_PUBLICATION_VERIFIED; DOCUMENTATION_WEBSITE_PENDING; LATEST_TAG_CLEANUP_FAILED.

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

## Remaining Step 14 work

The implementation plan also requires the complete documentation website, verified copy-paste snippets, link checks and a docs-only integration walkthrough. SDK publication alone does not close this milestone. Continue that work before Step 15 landing/deck; retain the existing runbook instead of creating a duplicate.

Step 13 hosted-service gaps and Step 04 explorer source verification remain open. No hosted deployment or further npm/chain write is included in the current continuation. Git commit/push of this reviewed release preparation is explicitly authorized by the user's latest request.
