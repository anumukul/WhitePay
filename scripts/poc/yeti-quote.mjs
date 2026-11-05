import {
  decodeFunctionData,
  decodeAbiParameters,
  encodeAbiParameters,
  encodeFunctionData,
  parseAbi,
  isAddress,
} from 'viem';
export const YETI = Object.freeze({
  chainId: 1874,
  router: '0xbCB198083504E31293bC3765b3c791cF2B2202d8',
  factory: '0x94aFa2aB80E44163362D2952bdf1E95b81900738',
  quoter: '0x90f28c3a6233713d6Df00E5fa92a3f13EFe36191',
  permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  wrappedWbt: '0x4200000000000000000000000000000000000006',
  usdt: '0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7',
});
const executeAbi = parseAbi([
  'function execute(bytes commands,bytes[] inputs,uint256 deadline) payable',
]);
const wrapTypes = [{ type: 'address' }, { type: 'uint256' }];
const swapTypes = [
  { type: 'address' },
  { type: 'uint256' },
  { type: 'uint256' },
  { type: 'bytes' },
  { type: 'bool' },
];
const same = (a, b) =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  a.toLowerCase() === b.toLowerCase();
const requireCheck = (condition, field) => {
  if (!condition) throw new Error(`Unsafe or unsupported Yeti quote: ${field}`);
};
const integer = (value) => {
  requireCheck(
    typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value),
    'integer amount',
  );
  return BigInt(value);
};

/** Validate an untrusted quote without signing or broadcasting. Single-route native WBT only. */
export function verifyYetiNativeQuote(
  response,
  {
    taker,
    nowMs = Date.now(),
    amountIn = 150000000000000000n,
    minimumUsdt = 10000000n,
    slippageBps = 50,
  } = {},
) {
  const q = response.data;
  requireCheck(isAddress(taker, { strict: false }), 'taker');
  requireCheck(q?.chainId === YETI.chainId, 'chainId');
  requireCheck(q.side === 'EXACT_INPUT', 'side');
  requireCheck(q.slippageBps === slippageBps && slippageBps === 50, 'slippage');
  requireCheck(
    same(q.tokenIn?.address, YETI.wrappedWbt) && q.tokenIn.decimals === 18,
    'input token',
  );
  requireCheck(
    same(q.tokenOut?.address, YETI.usdt) && q.tokenOut.decimals === 6,
    'output token',
  );
  requireCheck(q.partner === undefined, 'unexpected partner fee');
  requireCheck(same(q.transaction?.to, YETI.router), 'router');
  requireCheck(same(q.allowanceTarget, YETI.permit2), 'allowance target');
  requireCheck(
    integer(q.amountIn) === amountIn &&
      integer(q.transaction.value) === amountIn,
    'native spend',
  );
  const expiry = Date.parse(q.expiresAt);
  requireCheck(
    Number.isFinite(expiry) && Number.isFinite(nowMs) && expiry > nowMs,
    'expired deadline',
  );
  requireCheck(expiry - nowMs <= 601000, 'deadline too distant');
  const decoded = decodeFunctionData({
    abi: executeAbi,
    data: q.transaction.data,
  });
  const [commands, inputs, deadline] = decoded.args;
  requireCheck(
    commands === '0x0b00' && inputs.length === 2,
    'commands/allow-failure',
  );
  requireCheck(
    encodeFunctionData({
      abi: executeAbi,
      functionName: 'execute',
      args: decoded.args,
    }).toLowerCase() === q.transaction.data.toLowerCase(),
    'noncanonical execute',
  );
  requireCheck(
    deadline === BigInt(Math.floor(expiry / 1000)),
    'encoded deadline',
  );
  const [wrapRecipient, wrapAmount] = decodeAbiParameters(wrapTypes, inputs[0]);
  requireCheck(
    encodeAbiParameters(wrapTypes, [
      wrapRecipient,
      wrapAmount,
    ]).toLowerCase() === inputs[0].toLowerCase(),
    'wrap encoding',
  );
  requireCheck(
    same(wrapRecipient, YETI.router) ||
      same(wrapRecipient, '0x0000000000000000000000000000000000000002'),
    'wrap recipient',
  );
  requireCheck(wrapAmount === amountIn, 'wrap amount');
  let values;
  for (const types of [[...swapTypes, { type: 'uint256[]' }], swapTypes]) {
    try {
      const parsed = decodeAbiParameters(types, inputs[1]);
      if (
        encodeAbiParameters(types, parsed).toLowerCase() ===
        inputs[1].toLowerCase()
      ) {
        values = parsed;
        break;
      }
    } catch {
      /* Try the other documented V3 command shape. */
    }
  }
  requireCheck(values, 'swap encoding');
  const [recipient, spend, minimumReceived, path, payerIsUser] = values;
  requireCheck(
    same(recipient, taker) ||
      same(recipient, '0x0000000000000000000000000000000000000001'),
    'output recipient',
  );
  requireCheck(
    spend === amountIn && payerIsUser === false,
    'swap spend/approval source',
  );
  const quotedOut = integer(q.amountOut);
  const conservativeMinimum =
    (quotedOut * BigInt(10000 - slippageBps)) / 10000n;
  requireCheck(
    minimumReceived >= minimumUsdt &&
      minimumReceived >= conservativeMinimum &&
      minimumReceived <= quotedOut,
    'minimum output',
  );
  requireCheck(
    Array.isArray(q.route) && q.route.length === 1 && q.route[0].length > 0,
    'single route',
  );
  const hops = q.route[0];
  let encodedPath = YETI.wrappedWbt.toLowerCase();
  for (let i = 0; i < hops.length; ++i) {
    const hop = hops[i];
    requireCheck(
      isAddress(hop.address, { strict: false }) &&
        isAddress(hop.tokenOut.address, { strict: false }),
      'route addresses',
    );
    requireCheck(
      same(
        hop.tokenIn.address,
        i === 0 ? YETI.wrappedWbt : hops[i - 1].tokenOut.address,
      ),
      'route continuity',
    );
    requireCheck([100, 500, 3000, 10000].includes(hop.feeTier), 'pool fee');
    encodedPath +=
      hop.feeTier.toString(16).padStart(6, '0') +
      hop.tokenOut.address.slice(2).toLowerCase();
  }
  requireCheck(
    same(hops.at(-1).tokenOut.address, YETI.usdt) &&
      path.toLowerCase() === encodedPath,
    'encoded token path',
  );
  return {
    chainId: YETI.chainId,
    router: YETI.router,
    amountIn,
    amountOut: quotedOut,
    minimumReceived,
    slippageBps,
    commands,
    path,
    recipient: taker,
    deadline,
    approvalRequired: false,
    allowanceTargetPublishedButUnused: q.allowanceTarget,
    simulationIncomplete: q.issues?.simulationIncomplete === true,
    hops,
    apiEstimatedGas: integer(q.gas.estimate),
  };
}
