# WhitePay landing page and pitch

Step 15 static marketing app, live at https://whitepay-website.vercel.app,, using the same pinned Next.js 15.5.12 and React 18.3.1 as the documentation site. Port 3500 keeps it separate from the SaaS demo. The exported app has no wallet connection, signing or transaction execution.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @whitepay/website test
pnpm --filter @whitepay/website typecheck
pnpm --filter @whitepay/website build
pnpm --filter @whitepay/website dev
```

Open http://localhost:3500:

- `/`: landing page with real settlement evidence, published packages, developer guide and explicit testnet/hosting limitations.
- `/demo`: historical verified widget-payment viewer; switch buyer/merchant perspectives. This cannot execute a payment. The hosted Forma SaaS and local shop setup guide are linked separately.
- `/pitch`: exactly eight slides, source/speaker notes, arrow-key navigation and print support. The source is editable in `lib/content.mjs`; its content is shared with receipt evidence and links.

## PDF and browser checks

Use an installed Playwright Chromium or set CHROME_EXECUTABLE_PATH. Export after the static build:

```sh
CHROME_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  pnpm --filter @whitepay/website export:pitch
CHROME_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  pnpm --filter @whitepay/website test:browser
```

The export writes `docs/pitch/whitepay-pitch.pdf` in this repository and copies it into the ignored static `out/` directory for the download link. The dev server has no access to `out/` assets; use Print on `/pitch` when previewing in dev mode, or serve the built export to test PDF download. The browser suite generates the PDF first, checks exactly eight pages, verifies every internal CTA and reviewed external destination, toggles both receipt perspectives, checks slide text/footer fit and mobile overflow, and captures screenshots in the OS temporary directory. It does not certify remote uptime; read-only external HTTP checks are separately recorded in the Step 15 report.

The deck is HTML + PDF, not PowerPoint: the dedicated slide-authoring runtime was unavailable. No substitute slide library was installed. The actual PDF pages are rendered separately for visual QA using system PDFKit when available.

## Evidence and limits

The displayed transaction is the historical verified Step 09 widget payment, not a new live checkout or current balance query. Two independent merchant app tests use controlled receipts and are labelled accordingly. Official USDT/chain/checkout identity is centralized in `lib/content.mjs`. Explorer source verification, hosted merchant fulfillment, independent security review, final qualification and video remain open. The marketing app does not change any of those statuses.
