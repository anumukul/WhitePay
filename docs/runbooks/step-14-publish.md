# Step 14 — SDK alpha publication

Status: both exact alpha releases published and clean registry consumer checks passed. npm automatically assigned latest during processing; tag cleanup still requires publisher verification. Scope remains `@whitepay`, as requested. Website organization creation does not log the local npm CLI in.

## Reviewed release

| Package           | Version         | Visibility | Distribution tag |
| ----------------- | --------------- | ---------- | ---------------- |
| `@whitepay/node`  | `0.1.0-alpha.0` | public     | alpha            |
| `@whitepay/react` | `0.1.0-alpha.0` | public     | alpha            |

Both packages are MIT licensed and include their own LICENSE, CHANGELOG, README, compiled ESM JavaScript and declarations. Each reviewed archive has eight files. Tests, local operators, keystores, credentials, database fixtures and development source maps are excluded. Node has no runtime workspace dependencies; React depends on pinned viem and peer React. Metadata identifies this GitHub repository and the package directories. Publish configuration defaults to the public npm registry and alpha tag; never promote this candidate to latest as part of this release.

Public archive manifest and integrity hashes: `docs/evidence/sdk-publish-preview.json`.

## Authentication — private operator terminal

```sh
npm login --registry https://registry.npmjs.org/ --auth-type=web
npm whoami --registry https://registry.npmjs.org/
npm org ls whitepay --registry https://registry.npmjs.org/ --json
```

Expected user: anumukul. Confirm organization membership/publishing role. Complete browser/passkey/2FA prompts locally. Never paste passwords, npm tokens, recovery codes or authentication URLs/codes into chat. Do not add an npm token or .npmrc to this repository.

## Prepare reproducible archives

```sh
pnpm --filter @whitepay/node --filter @whitepay/react typecheck
pnpm --filter @whitepay/node test
pnpm --filter @whitepay/react test
pnpm --filter @whitepay/node test:package
pnpm --filter @whitepay/react test:browser
```

The Node integration/package and browser checks require an isolated TEST_DATABASE_URL and a local test browser; they do not use the real wallets. Packing runs a clean build, removing stale files from generated dist before compiling. Pack into a private temporary release directory outside Git, then run:

```sh
node scripts/verify-sdk-release.mjs \
  /PATH/whitepay-node-0.1.0-alpha.0.tgz \
  /PATH/whitepay-react-0.1.0-alpha.0.tgz
```

The verifier checks archive file allowlists, package identity/version/license, exports, public-alpha registry settings, absence of operator/runtime-workspace dependencies and credential patterns. It records SHA-256 and npm SHA-512 integrity without printing sensitive contents. Test installation of the exact tarballs, then run npm publish --dry-run against them. The independently installed Node SDK was checked against the real local API and packaged types; the React archive was installed in an independent React app and exercised in Chrome with test-only signatures and a controlled receipt.

## Publication — separate exact approval required

Confirm the requested names/version are still unpublished and verify the archive hashes match the reviewed manifest. Publish the exact reviewed archives, not a folder that could rebuild or pick up later changes:

```sh
npm publish /PATH/whitepay-node-0.1.0-alpha.0.tgz \
  --registry https://registry.npmjs.org/ --access public --tag alpha
npm publish /PATH/whitepay-react-0.1.0-alpha.0.tgz \
  --registry https://registry.npmjs.org/ --access public --tag alpha
```

Enter any required publisher verification only in the private terminal/browser. Stop on an unexpected account, scope, version collision, package-content change or requested permission. Do not put an OTP in shell arguments or chat. Do not retry an ambiguous publish blindly: first inspect the registry for the exact version and compare dist.integrity. If one package succeeds and the other fails, record partial publication rather than claiming both succeeded.

A zero exit code can precede public availability: npm may report processing and expose a temporary 0.0.0-stage placeholder. Query the exact approved versions; do not install the placeholder, retry uploads, or claim completion. An empty `npm stage list` does not establish a pending staged approval.

## Verify after publication

```sh
npm view @whitepay/node@0.1.0-alpha.0 version dist.integrity --json
npm view @whitepay/react@0.1.0-alpha.0 version dist.integrity --json
npm dist-tag ls @whitepay/node
npm dist-tag ls @whitepay/react
```

Registry integrity must match the reviewed manifest and alpha must resolve to this version. If npm processing automatically assigns latest, remove it with `npm dist-tag rm @whitepay/node latest` and `npm dist-tag rm @whitepay/react latest`, completing publisher verification privately, then recheck tags. Never claim alpha-only distribution until latest is absent. Install from the registry in fresh independent applications and repeat runtime/type/browser checks. Only then record published URLs and mark npm publication complete. Git commit/push, website deployment and a stable/latest release are separate actions, not implied by this alpha publication.

Consumer install after the verified release:

```sh
npm install @whitepay/node@alpha
npm install @whitepay/react@alpha react react-dom
```

These are testnet SDK packages, not a hosted API deployment. Configure a WhitePay API URL and implement customer authorization on the merchant server. The package READMEs contain the current API examples, including the required explicit apiBaseUrl; the old example relying on an implicit hosted endpoint is obsolete.

## Documentation website and manual review

The SDK release work is pushed as 8704393. The remaining docs implementation is a local Nextra website at apps/docs, with a static out/ build and no hosted deployment. It consumes exact registry SDK packages so copied examples cannot accidentally depend on unshipped workspace APIs.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @whitepay/docs test
pnpm --filter @whitepay/docs typecheck
pnpm --filter @whitepay/docs build
pnpm --filter @whitepay/docs dev
```

1. Open http://localhost:3400. Confirm Testnet only/Public alpha and no hosted API claim.
2. Follow Install → React quickstart → Merchant server bridge → Verify webhooks. The small frontend example must point to authenticated ownership checks; fulfillment comes from verified webhook evidence, never a browser callback.
3. Open API & typed errors at /api-reference, Contracts & evidence and Limitations. Confirm chain 1874, exact official token, actual explorer payment link, outstanding source verification, hosting gaps and npm latest-tag caveat.
4. Navigate the sidebar and mobile menu. Type webhook into search and follow a result. Inspect code blocks, pagination and readable mobile layout. No wallet should connect merely by reading docs.
5. Run the static browser check after building. It verifies all 19 content pages, 24 internal links/anchors, snippet display, mobile overflow and browser errors. External links are references, not a certification of remote uptime.

```sh
CHROME_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  pnpm --filter @whitepay/docs test:browser
```

On CI/Linux, install Playwright Chromium and omit CHROME_EXECUTABLE_PATH. The CI docs job contains that setup. Local checks passed; remote CI for the new docs work has not run yet. The shell examples are syntax checked without executing authenticated requests. A fresh developer's actual payment walkthrough remains a separate acceptance action with exact signing/broadcast approvals. Do not begin new payment execution or publish hosting to satisfy documentation tests automatically.
