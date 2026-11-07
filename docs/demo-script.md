# Demo script (2–4 minute video)

Record in one take. Browser + explorer side by side. Narration bullets below.

## Shot list

**0:00 — 0:20 Opening**

- Narrator on-camera or voiceover: "WhitePay is a Stripe-style checkout that settles in real USDT on Whitechain, with zero WBT for the buyer."
- Show the landing page (`apps/website`).

**0:20 — 0:50 Merchant A: SaaS credits**

- Open `apps/demo-saas` at `localhost:3000/checkout`.
- Click **Stripe** → pay with `4242 4242 4242 4242` → `/credits` shows 100.
- Narration: "Real Stripe test mode works the same way as WhitePay."
- Back to `/checkout`, click **WhitePay** → placeholder page clearly labeled → simulate → `/credits` shows 200 total.
- Open browser devtools, re-trigger the simulate action → **balance stays 200** (idempotent).

**0:50 — 1:20 Merchant B: digital shop**

- Open `apps/demo-shop` at `localhost:3100/checkout`.
- Different merchant banner at the top.
- WhitePay flow → `/download` → click single-use link → download. Click again → `already_consumed`.

**1:20 — 1:50 Dashboard + isolation**

- Open `apps/dashboard` at `localhost:3200`. Paste merchant A's key → see A's payments. Paste merchant B's key → see B's. Cross-merchant access is impossible.

**1:50 — 2:30 Contract**

- Show `forge test` output (20/20 + 256-run fuzz).
- Open the Whitechain Sepolia explorer at the deployed contract address (once Step 04 approves deploy). Show verified source + the real settlement tx hash from Step 02.

**2:30 — 3:00 Why on-chain USDT**

- One line: buyers pay with the real dollar-pegged token they already hold, merchants get instant settlement, no WBT friction.

**3:00 Close**

- GitHub URL. ETHGlobal submission tag.

## Required facts to verify before recording

- Deployed contract address exists on Blockscout with verified source.
- At least one real settlement tx hash links to a merchant payout in official USDT.
- Payer wallet shows zero WBT before and after the settlement.
- Relayer wallet shows WBT debit matching the gas cost.
- README links all three.
