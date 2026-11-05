/** Required network constants from PR.md; live compatibility is not yet verified. */
export const WHITECHAIN_SEPOLIA = Object.freeze({
  id: 1874,
  name: 'Whitechain Sepolia',
  rpcUrl: 'https://rpc.testnet.whitechain.io',
  explorerUrl: 'https://explorer.testnet.whitechain.io',
  usdt: '0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7',
  nativeCurrency: Object.freeze({
    name: 'WhiteBIT Coin',
    symbol: 'WBT',
    decimals: 18,
  }),
} as const);
// USDT decimals and authorization support must be discovered in Step 01.
