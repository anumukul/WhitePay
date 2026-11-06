export default function Home() {
  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "40px 24px" }}>
      <h1 style={{ fontSize: 44, margin: 0 }}>WhitePay</h1>
      <p style={{ fontSize: 22, color: "#444", marginTop: 8 }}>
        USDT checkout for merchants on Whitechain. Buyers pay with zero WBT; the relayer covers gas.
      </p>

      <h2>Why on-chain USDT on Whitechain</h2>
      <p>
        Whitechain settles official Tether USD natively. WhitePay turns that into a Stripe-style merchant
        integration: a hosted checkout, a Node SDK, a React widget, and signed webhooks — the same shape
        developers already know, settled in real dollars on an L2 their buyers are already on.
      </p>

      <h2>What is in this testnet build</h2>
      <ul>
        <li>Contract <code>WhitePayCheckout</code> (Step 03): 20 forge tests, 256-run fuzz, atomic merchant/fee split, signed-order replay protection.</li>
        <li>Merchant API (Step 05): checkout sessions, payments, idempotency, strict merchant isolation. 8 tests green.</li>
        <li>Relayer (Step 06): gas / daily-budget caps, per-order submission dedup, mock-chain validated. 11 tests green.</li>
        <li>Indexer + signed webhooks (Step 07): HMAC signing, delivery retries, restart-safe cursor. 7 tests green.</li>
        <li><code>@whitepay/node</code> and <code>@whitepay/react</code> SDKs (Steps 08–09): packable, integrated against the real API. 11 tests green combined.</li>
        <li>Dashboard (Step 10) and demo apps (Steps 11–12): two separate merchants with separate secrets.</li>
      </ul>

      <h2>What is still gated</h2>
      <ul>
        <li>Live settlement of real official-USDT. Blocked on Step 02 funding approval.</li>
        <li>Contract deployed + Blockscout-verified on Whitechain Sepolia (<a href="https://sepolia.whitechain.io">explorer</a>). Prepared; awaiting &quot;approve deploy&quot;.</li>
        <li>npm publish of SDKs. Tarballs built and locally verified; awaiting &quot;approve publish&quot;.</li>
      </ul>

      <p style={{ marginTop: 32, color: "#777" }}>
        Testnet-only. No production funds move. See the GitHub repo for runbooks and test evidence.
      </p>
    </main>
  );
}
