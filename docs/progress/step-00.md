# Step 00 — Repository and baseline

Status: APPROVED_COMMITTED — baseline commit 8a38005 pushed to origin/main.

## Scope

Isolated this folder from an unrelated parent Git repository without modifying parent files or index. GitHub repository advertised no refs. Added pnpm workspace, shared required network constants, strict TypeScript build, native Node tests, formatting checks, baseline CI, documentation, environment placeholders, and milestone/review skills.

Copied supplied `PR (2).md` verbatim to canonical `PR.md`; original retained. No requirements changed.

## TDD evidence

`node --test tests/baseline.test.mjs` exited 1: 0 passed, 3 failed. Failures were missing package.json, missing built shared module, and missing PR.md. These were genuine absent prerequisites before implementation.

## Toolchain observed

- Node v25.8.1; CI targets Node 24 LTS. Node 24 has not been exercised locally.
- pnpm 10.25.0; TypeScript 5.9.3; Prettier 3.6.2.
- Git 2.52.0; GitHub CLI 2.87.2.
- Forge and Cast 1.6.0-v1.7.0, commit f83bad912a9dba7bf0371def1e70bb1896048356.
- Docker CLI 29.2.0; daemon unavailable.

## Checks

`pnpm lint`, `pnpm typecheck`, `pnpm test` (3/3), and `pnpm build` exited 0. All four unavailable future suite scripts exited 1 with actionable messages. `git diff --check` and exact requirements-file comparison exited 0. Ignore probes confirmed environment files, keystores, and generated builds are excluded.

A fresh temporary copy without node_modules or dist installed using `pnpm install --frozen-lockfile` and passed lint, typecheck, and tests (3/3), all exit 0. An initial offline-only clean install failed due to an unavailable cached tarball; the registry-enabled retry passed. Network dependency installation required sandbox escalation. No live chain calls, transactions, deployment, package publication, or hosted migrations performed.

## Manual verification

1. Run `pnpm install --frozen-lockfile`.
2. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`; expect successful exits and three passing baseline tests.
3. Run `pnpm test:integration`, `pnpm test:e2e`, `pnpm test:contracts`, and `pnpm test:sepolia`; expect nonzero exits with implementation/prerequisite messages.
4. Run `git rev-parse --show-toplevel`; expect this WhitePay folder. Run `git remote -v`; expect only the WhitePay GitHub URL.
5. Inspect `.env.example`, `.gitignore`, `PR.md`, shared constants, and the state report. USDT decimals must remain unspecified pending live discovery.

## Limitations

CI definition exists but no GitHub Actions run has occurred. No contracts or application exist. No live Whitechain compatibility claim. Future suites are intentionally unavailable. `git diff --stat` is empty because all files are untracked in the new repository; `git status --short` lists the baseline additions. No user work has been staged.

Human signoff: user explicitly instructed pushing all baseline code to the supplied WhitePay repository. Manual test execution by user was not reported. Proposed commit: `chore(workspace): establish tested WhitePay baseline and milestone tracking`. Authorized initial destination: `origin/main`.

Next step: 01 — Official USDT capability investigation. Do not begin before separate authorization.

## Commit and push evidence

`git push -u origin main` exited 0 and created `main` in `https://github.com/anumukul/WhitePay.git`. Baseline commit: `8a38005`. The staged whitespace check flagged existing Markdown hard-break spaces in the two verbatim supplied requirements files; these were retained intentionally.
