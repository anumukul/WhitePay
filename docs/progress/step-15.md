# Step 15 — landing page and pitch

Status: STATIC_SITES_DEPLOYED_AND_PUBLICLY_VERIFIED. Landing/pitch and SDK docs are live on Vercel Hobby; evidence is recorded below. Step 14 documentation was explicitly approved and pushed to origin/main as `9e57032` before this milestone began.

## Scope and implementation

Replaced the stale `apps/website` prototype with a responsive landing page, historical receipt walkthrough at `/demo`, and exactly eight browser slides at `/pitch`. The receipt viewer switches buyer/merchant perspectives using the verified Step 09 transaction; it cannot sign, connect a wallet, query a private balance or execute a payment. The hosted Forma SaaS and local shop setup guide are linked explicitly; the hosted SaaS purchase still needs merchant/worker configuration. All live-payment data is labelled historical, and controlled demo receipts are not presented as two live merchant settlements.

The site links the actual deployed checkout, confirmed payment, public alpha packages, published documentation and demo setup guides. Removed obsolete funding/deployment/npm blockers and the false description of valueless testnet assets as real dollars. Source verification, final security checks, embedded-wallet limitations and out-of-scope features remain visible.

## Public static hosting

- Landing, historical receipt viewer, eight-slide deck and PDF: [https://whitepay-website.vercel.app](https://whitepay-website.vercel.app)
- SDK docs: [https://whitepay-docs.vercel.app](https://whitepay-docs.vercel.app)
- Both are public static exports deployed to the Vercel Hobby team, with zero functions and no environment variables. Public routes return HTTP 200. Every staged file was compared with its SHA-256 manifest; Vercel appended its own toolbar loader to one webpack runtime chunk in each project, with the original audited bytes intact as the exact prefix. See `docs/evidence/website-deployment.json` and `docs/evidence/docs-deployment.json`.
- Docs export passed the Chrome check for 19 pages and 24 internal links/anchors. Landing export passed 3 content tests and 2 Chrome checks, including four internal CTAs, buyer/merchant receipt views, eight PDF pages and mobile layout.
- The live receipt page is historical evidence, not an interactive hosted checkout. This deployment creates no API, database, SaaS server, worker, webhook delivery or relayer.

The eight-slide narrative covers problem, sponsored checkout, buyer/merchant responsibilities, architecture/trust, actual official-USDT settlement, security/recovery, two independent integrations and remaining sponsor/roadmap gates. Shared editable facts, links, slide text and speaker notes live in `apps/website/lib/content.mjs`. The deck has keyboard navigation, expandable notes and print support. `docs/pitch/whitepay-pitch.pdf` is the shareable eight-page export; no PPTX is claimed. The dedicated presentation-authoring runtime was unavailable, so the deck uses browser HTML and Chrome PDF export, without installing substitute slide libraries.

Kept Next.js and aligned this prototype with the docs app's already verified pins (Next.js 15.5.12, stable React 18.3.1), replacing the older Next patch/React release candidate only in the website. Added local content/browser tests and CI commands. Port 3500 avoids the existing demo app ports. Static output remains ignored in Git; the isolated public exports were deployed to the two Vercel Hobby projects listed in the evidence.

## TDD and executed verification

RED: all three initial acceptance tests failed against the old prototype: no working demo CTA, missing shared evidence and no eight-slide deck. GREEN: all three pass after implementation.

- `pnpm --filter @whitepay/website test`: exit 0, 3 tests covering honest landing behavior, exact chain/token/payment/amount arithmetic and eight substantive slides with visible gaps.
- `pnpm --filter @whitepay/website typecheck`: exit 0.
- `pnpm --filter @whitepay/website build`: exit 0; static `/`, `/demo`, `/pitch` output.
- `pnpm install --frozen-lockfile --ignore-scripts`: exit 0.
- `CHROME_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' pnpm --filter @whitepay/website test:browser`: exit 0, now 2 browser tests after the injection regression. Four internal CTAs return 200; nine external destinations match the reviewed allowlist; buyer/merchant views, arrow-key navigation, eight slide text/footer fits, exactly eight PDF pages and mobile layouts pass. No browser runtime errors.
- Actual PDF rendered with macOS PDFKit: all eight pages inspected individually. Browser screenshots of desktop/mobile landing and each slide were also inspected. No text clipping or footer overlap observed.
- Scoped Prettier and `git diff --check`: pass. Existing docs/dependency declarations outside the website were retained. No full application/security certification is inferred from marketing tests.

The first PDF export resolved one directory above the repository. Its generated file was moved into `docs/pitch`, empty accidental directories removed, and the exporter path corrected and rerun. The final export is inside this repository. PDF download is shown only when the built file is available; the dev route still offers Print, avoiding a broken download CTA before export.

## External link checks

Read-only HTTP requests returned 200 for GitHub repository/docs/evidence/demo guides and explorer checkout/transaction (7 destinations). npm website requests returned 403 to the automated client (2 destinations), so those web pages are not claimed HTTP-verified by this check. Their canonical exact version URLs remain unchanged; public package availability and integrity were separately verified through the npm registry in Step 14. No unknown URL was substituted to hide the 403 responses.

## Manual review

Follow `docs/runbooks/step-15-site.md`. Start the website on http://localhost:3500, inspect the landing, toggle both receipt perspectives, follow proof and SDK/docs links, and open `/pitch`. Review every slide and the exported PDF. Compare the evidence link with the stated exact testnet amount/network. The site must not ask for a wallet or display a new payment success.

Step 15 code and deployment evidence are included in the user-approved polish publication. Static public hosting is complete; the live SaaS/API/worker, a live hosted checkout/video and sponsor qualification remain open. Step 16 adversarial release work is next; the known earlier release findings remain open.

## Follow-up — injected wallet collision

User reported TypeError Cannot redefine property: ethereum, with Phantom evmAsk.js extension frames. Verified runtime source: no WhitePay property definition/assignment; React SDK reads the provider only; marketing pages never access it. Official Phantom documentation confirms competition between wallet extensions. Reproduced the collision in a controlled isolated Chrome fixture with a nonconfigurable ethereum provider. New regression passes for /, /demo and /pitch: the provider remains unchanged, no app runtime errors and zero wallet calls. Both browser tests pass. This does not prove the actual user's extension configuration is fixed; the manual remedy is to disable Phantom temporarily for non-wallet pages and hard-refresh, or use a browser profile with only the intended wallet for checkout. No application error filter or global provider override was added. User page URL was requested; actual browser confirmation remains pending.
