# Step 15 — review the landing and pitch

Prerequisites: repository Node 24/25, pnpm 10.25.0 and dependencies installed. No database, wallet, password, key or real transaction is required.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @whitepay/website test
pnpm --filter @whitepay/website typecheck
pnpm --filter @whitepay/website build
pnpm --filter @whitepay/website dev
```

1. Open [https://whitepay-website.vercel.app](https://whitepay-website.vercel.app) (or http://localhost:3500 locally). Expect the USDT/zero-WBT message, historical 1-USDT + .001-USDT receipt, published SDK links and explicit testnet/hosting limitations. The old real-dollar, funding-blocked and unpublished-package claims must be gone.
2. Click Explore the payment proof. On `/demo`, switch Buyer view / Merchant view. Expect 1.001-USDT total and WBT 0→0; then 1-USDT merchant and .001-USDT fee payouts. The historical label, official token, chain 1874 and exact transaction link must remain visible.
3. Follow the explorer, package, [live docs](https://whitepay-docs.vercel.app) and hosted SaaS/local shop links. The hosted Forma UI is available; its live purchase still needs merchant and worker configuration. The receipt viewer remains historical evidence. npm's website blocked automated HTTP checks, so confirm those page links privately in your normal browser if needed.
4. Open `/pitch`. Expect exactly 8 slides, working arrow keys, expandable source/speaker notes and readable mobile layout. The outstanding source-verification/hosting/video/qualification gaps must not disappear.
5. Open `docs/pitch/whitepay-pitch.pdf`. Expect exactly 8 landscape pages, no clipping, the actual proof link on slide 5 and the roadmap/limitations on slide 8. The browser route can also print/save a PDF.

Reproduce export and automated browser checks with local Chrome:

```sh
CHROME_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  pnpm --filter @whitepay/website export:pitch
CHROME_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  pnpm --filter @whitepay/website test:browser
```

For Linux/CI, install Playwright Chromium using the website package and omit CHROME_EXECUTABLE_PATH. The browser tests serve the real static export and close their temporary server/browser. They generate the PDF and copy it into `out/` for the download link; dev mode shows Print if no downloadable PDF is available.

The deck is HTML/PDF, not PowerPoint. Public deployment, video, new live payments and final qualification remain separate gates. Code review/commit authorization must not be treated as permission to sign or broadcast a transaction.

## Phantom injection error in Chrome

`Cannot redefine property: ethereum` with a stack in `chrome-extension://bfnaelmomeimhlpmgjnjophhpkkoljpa/evmAsk.js` originates in Phantom's provider injection, not a WhitePay property definition. Runtime source inspection found no assignment or defineProperty for ethereum; the checkout SDK only reads an injected/explicit provider, and the public website never uses one.

Open chrome://extensions/, temporarily switch Phantom off (do not uninstall or reset it), then hard-refresh the local page with Cmd+Shift+R on macOS. The landing/docs/proof/pitch do not need any wallet extension. For an actual checkout, keep only the intended compatible wallet enabled in that browser profile. Phantom documents wallet competition and separate profiles at https://help.phantom.com/articles/12182813094163. No seed/key import is required to test a non-wallet public page.

The isolated browser regression reproduces the same TypeError when a simulated second extension redefines a nonconfigurable provider, then confirms all three marketing pages preserve that provider and make zero wallet requests. It is a controlled collision model, not a test with the user's actual Phantom extension installed. No global error suppression, provider monkey-patch or wallet-selection change was added. Resolution in the user's browser remains to be confirmed after the extension setting change.
