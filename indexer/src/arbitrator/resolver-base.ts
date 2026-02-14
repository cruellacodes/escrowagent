import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import type { AiRuling, ArbitratorConfig } from "./types";

// ──────────────────────────────────────────────────────
// Base On-Chain Resolver
// ──────────────────────────────────────────────────────

// Minimal ABI for resolveDispute
const RESOLVE_ABI = [
  {
    name: "resolveDispute",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "escrowId", type: "uint256" },
      {
        name: "ruling",
        type: "tuple",
        components: [
          { name: "rulingType", type: "uint8" },
          { name: "clientBps", type: "uint16" },
          { name: "providerBps", type: "uint16" },
        ],
      },
    ],
    outputs: [],
  },
] as const;

const RULING_TYPE_MAP: Record<string, number> = {
  PayClient: 0,
  PayProvider: 1,
  Split: 2,
};

export async function resolveOnBase(
  config: ArbitratorConfig,
  escrowId: string,
  ruling: AiRuling
): Promise<string> {
  const account = privateKeyToAccount(config.privateKeyBase as Hex);
  const chain = config.baseChainId === 84532 ? baseSepolia : base;

  const publicClient = createPublicClient({
    chain,
    transport: http(config.baseRpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(config.baseRpcUrl),
  });

  const rulingArg = {
    rulingType: RULING_TYPE_MAP[ruling.ruling] ?? 0,
    clientBps: ruling.clientBps,
    providerBps: ruling.providerBps,
  };

  console.log(`[Arbitrator/Base] Submitting ruling for escrow ${escrowId}: ${ruling.ruling}`);

  const hash = await walletClient.writeContract({
    chain,
    account,
    address: config.baseContractAddress as Address,
    abi: RESOLVE_ABI,
    functionName: "resolveDispute",
    args: [BigInt(escrowId), rulingArg],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status === "reverted") {
    throw new Error(`resolveDispute transaction reverted: ${hash}`);
  }

  console.log(`[Arbitrator/Base] Ruling submitted: ${hash}`);
  return hash;
}
