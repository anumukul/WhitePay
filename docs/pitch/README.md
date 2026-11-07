# WhitePay pitch

Eight-slide browser deck: run `pnpm --filter @whitepay/website dev`, then open http://localhost:3500/pitch. Arrow keys move between slides; each has expandable notes and sources. `lib/content.mjs` in that app is the editable source.

The PDF is generated from the exact browser deck after a successful static build:

```sh
CHROME_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  pnpm --filter @whitepay/website export:pitch
```

`whitepay-pitch.pdf` is the shareable eight-page deliverable. It describes a testnet alpha and historical real settlement; it does not claim a public hosted checkout, explorer source verification, two live merchant payments or final sponsor qualification. There is no PPTX artifact in this release because the dedicated authoring runtime was unavailable.
