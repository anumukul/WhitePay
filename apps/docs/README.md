# WhitePay documentation

Local/static Nextra 3.3.1 documentation on Next.js 15.5.12 and React 18.3.1. No hosted service or public docs URL is implied. All 19 planned topics live in `pages/`; `_meta.js` owns navigation. A generated public search index and a theme search component preserve the first query even while its index loads; predev/prebuild regenerate it from reviewed page content. Keep limitations and real settlement evidence explicit.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @whitepay/docs test
pnpm --filter @whitepay/docs build
pnpm --filter @whitepay/docs dev
```

Open http://localhost:3400. Build output is `out/` (ignored). Source, compiled snippets and content checks require no database, wallet or credentials. The docs devDependencies deliberately install exact **registry** SDK versions instead of linking workspace SDKs; the lockfile preserves their integrity.

Content tests check topic coverage, local links, small frontend example and disclosures. The snippet checker extracts literal ts/tsx blocks into a temporary consumer and invokes TypeScript; shell snippets are syntax-checked without execution. The production build validates Nextra/MDX/types. Browser tests serve the real static export, visit all 19 pages, check internal links/anchors, verify snippets, initial-query search/result navigation and mobile menu/overflow, and reject page runtime errors:

```sh
pnpm --filter @whitepay/docs exec playwright install chromium
pnpm --filter @whitepay/docs test:browser
```

For an installed local Chrome instead of a Playwright download:

```sh
CHROME_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  pnpm --filter @whitepay/docs test:browser
```

The browser check never connects to a real wallet or starts a payment. `/api-reference` intentionally avoids Next's reserved `/api` route. External npm/GitHub/explorer links are evidence references; internal link/browser checks do not certify remote uptime or explorer source verification. See the existing Step 14 report and runbook for review status.
