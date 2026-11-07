import { spawn, type ChildProcess } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

function defaultAnvilPath(): string {
  if (process.platform === 'win32') {
    const home = process.env.USERPROFILE ?? process.env.HOME ?? 'C:/Users/HP';
    return `${home}\\.foundry\\bin\\anvil.exe`;
  }
  return `${process.env.HOME ?? '~'}/.foundry/bin/anvil`;
}
const ANVIL_PATH = process.env.ANVIL_PATH ?? defaultAnvilPath();

export interface AnvilHandle {
  process: ChildProcess;
  rpcUrl: string;
  port: number;
  deployerPrivateKey: `0x${string}`;
  deployerAddress: `0x${string}`;
  relayerPrivateKey: `0x${string}`;
  relayerAddress: `0x${string}`;
  payerPrivateKey: `0x${string}`;
  payerAddress: `0x${string}`;
  stop: () => Promise<void>;
}

// Default anvil pre-funded accounts (deterministic, PUBLIC keys — anvil docs).
const ACCOUNTS = {
  deployer: {
    privateKey:
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const,
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const,
  },
  relayer: {
    privateKey:
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const,
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const,
  },
  payer: {
    privateKey:
      '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cde8b9fa' as const,
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as const,
  },
};

async function pickPort(): Promise<number> {
  // Avoid 8545 (common dev port). Try 8600–8700 range; let OS assign via 0 is cleaner.
  return 0;
}

export async function spawnAnvil(
  options: { chainId?: number } = {},
): Promise<AnvilHandle> {
  const chainId = options.chainId ?? 1874;
  const port = await pickPort();
  const args = [
    '--port',
    String(port),
    '--chain-id',
    String(chainId),
    '--host',
    '127.0.0.1',
  ];
  const proc = spawn(ANVIL_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] });

  const actualPort = await new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('anvil startup timeout')),
      15000,
    );
    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      const match = /Listening on 127\.0\.0\.1:(\d+)/.exec(text);
      if (match) {
        clearTimeout(timeout);
        proc.stdout?.off('data', onData);
        resolve(Number(match[1]));
      }
    };
    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', (c) => {
      /* silence */
    });
    proc.on('error', (e) => {
      clearTimeout(timeout);
      reject(e);
    });
    proc.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`anvil exited early with code ${code}`));
    });
  });

  return {
    process: proc,
    rpcUrl: `http://127.0.0.1:${actualPort}`,
    port: actualPort,
    deployerPrivateKey: ACCOUNTS.deployer.privateKey,
    deployerAddress: ACCOUNTS.deployer.address,
    relayerPrivateKey: ACCOUNTS.relayer.privateKey,
    relayerAddress: ACCOUNTS.relayer.address,
    payerPrivateKey: ACCOUNTS.payer.privateKey,
    payerAddress: ACCOUNTS.payer.address,
    stop: () =>
      new Promise<void>((resolve) => {
        if (proc.exitCode !== null) return resolve();
        proc.once('exit', () => resolve());
        proc.kill('SIGTERM');
        setTimeout(() => {
          if (proc.exitCode === null) proc.kill('SIGKILL');
        }, 2000);
      }),
  };
}

export interface CompiledArtifact {
  abi: readonly unknown[];
  bytecode: `0x${string}`;
}

export async function readForgeArtifact(
  path: string,
): Promise<CompiledArtifact> {
  const raw = await readFile(path, 'utf8');
  const json = JSON.parse(raw);
  const bytecode =
    typeof json.bytecode === 'string' ? json.bytecode : json.bytecode?.object;
  if (!bytecode) throw new Error(`No bytecode in artifact at ${path}`);
  return { abi: json.abi, bytecode: bytecode as `0x${string}` };
}

export function repoRoot(): string {
  // packages/chain/test → repo root is three parents up.
  return join(
    new URL('.', import.meta.url).pathname.replace(/^\/([a-zA-Z]):/, '$1:'),
    '..',
    '..',
    '..',
  );
}
