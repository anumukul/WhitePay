# WhitePay pitch

Live deck: https://whitepay-website.vercel.app/pitch. For local editing, run `pnpm --filter @whitepay/website dev`, then open http://localhost:3500/pitch. Arrow keys move between slides; each has expandable notes and sources. `lib/content.mjs` in that app is the editable source.

The PDF is generated from the exact browser deck after a successful static build:

```sh
CHROME_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  pnpm --filter @whitepay/website export:pitch
```

`whitepay-pitch.pdf` is the shareable eight-page deliverable. It describes a testnet alpha and historical real settlement; it distinguishes the hosted applications from pending live merchant fulfillment, explorer source verification, two live merchant payments and final sponsor qualification. There is no PPTX artifact in this release because the dedicated authoring runtime was unavailable.
