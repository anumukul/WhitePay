const suite = process.argv[2];
const requirements = {
  integration:
    'Step 05: implement database integration tests and start an isolated PostgreSQL instance.',
  e2e: 'Step 09: implement checkout and browser tests; install browser dependencies.',
  sepolia:
    'Steps 01–02: verify token compatibility, configure isolated test wallets, and obtain explicit broadcast approval.',
  contracts:
    'Step 03: implement Foundry contracts and tests after the authorization proof is approved.',
};
console.error(
  `NOT IMPLEMENTED: ${suite}. ${requirements[suite] ?? 'Unknown suite.'}`,
);
process.exitCode = 1;
