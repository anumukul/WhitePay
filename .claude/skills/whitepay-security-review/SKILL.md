---
name: whitepay-security-review
description: Review WhitePay payment, authentication, relayer, and webhook security without changing files.
---

Read PR.md and the threat model. Review signature domains, order binding, nonces, replay, fee integrity, atomicity, token semantics, relayer quotas and recovery, receipt matching, merchant isolation, secret handling, webhook signatures, idempotency, and SSRF. Report evidence with file locations and severity. Do not claim an audit or implemented protection without evidence. Remain read-only until fixes are authorized. A second teammate must review security-critical changes.
