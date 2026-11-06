// Minimal WhitePayCheckout ABI (just what relayer + worker need).
// Kept here instead of re-reading forge output to make the chain package self-contained.

export const whitepayCheckoutAbi = [
  {
    type: "constructor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_expectedChainId", type: "uint256" },
      { name: "allowedTokens", type: "address[]" },
    ],
  },
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "order",
        type: "tuple",
        components: [
          { name: "orderId", type: "bytes32" },
          { name: "payer", type: "address" },
          { name: "merchant", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "fee", type: "uint256" },
          { name: "feeRecipient", type: "address" },
          { name: "token", type: "address" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "quoteId", type: "bytes32" },
        ],
      },
      { name: "orderSignature", type: "bytes" },
      { name: "tokenSignature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "orderDigest",
    stateMutability: "view",
    inputs: [
      {
        name: "order",
        type: "tuple",
        components: [
          { name: "orderId", type: "bytes32" },
          { name: "payer", type: "address" },
          { name: "merchant", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "fee", type: "uint256" },
          { name: "feeRecipient", type: "address" },
          { name: "token", type: "address" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "quoteId", type: "bytes32" },
        ],
      },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "settled",
    stateMutability: "view",
    inputs: [{ name: "orderId", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "expectedChainId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "tokenAllowed",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "event",
    name: "PaymentSettled",
    inputs: [
      { name: "orderId", type: "bytes32", indexed: true },
      { name: "payer", type: "address", indexed: true },
      { name: "merchant", type: "address", indexed: true },
      { name: "token", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
      { name: "feeRecipient", type: "address", indexed: false },
      { name: "quoteId", type: "bytes32", indexed: false },
    ],
  },
] as const;
