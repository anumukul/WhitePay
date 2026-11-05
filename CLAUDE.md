# WhitePay Claude Code instructions

Read `PR.md` fully before any implementation. It defines the project architecture, security requirements, exact Whitechain Sepolia token/network, milestone acceptance checks, and the human-in-the-loop TDD workflow.

1. Start **only** the explicitly authorized `START STEP XX` milestone.
2. Test-first (RED -> GREEN -> REFACTOR); run tests and show honest evidence.
3. Present manual test commands, results, changed files and blockers; **STOP for human verification**.
4. On `FAIL STEP XX`, debug, add regression test, rerun; stop again.
5. Only on explicit approval may you commit reviewed files. **Push only with separate explicit remote/branch authorization**. No auto-deploy, onchain write, package publish or external mutation without human consent.
6. Never fabricate official USDT permit/EIP-3009 support, successful explorer transactions, wallet compatibility or external deployment.
7. Do not expose secrets. Payer holds zero WBT in the actual onchain proof; required token is `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` on Whitechain Sepolia 1874.
8. Read/update `docs/progress/STATE.md` and per-step reports, and record architecture changes via ADRs.
9. No World, refunds, recurring billing, bridging or mainnet features in MVP.
10. Security-critical changes require second teammate review.

First user command: `START STEP 00`. Do not start steps automatically.
