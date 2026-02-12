import { createHash } from "crypto";
import { PublicKey } from "@solana/web3.js";

/** The deployed AgentVault program ID */
export const PROGRAM_ID = new PublicKey(
  "AgntVLT1111111111111111111111111111111111111"
);

/** Well-known USDC mint on Solana mainnet */
export const USDC_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);

/** Well-known USDC mint on Solana devnet */
export const USDC_DEVNET_MINT = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);

// ──────────────────────────────────────────────────────
// PDA Derivation helpers
// ──────────────────────────────────────────────────────

export function deriveEscrowPDA(
  client: PublicKey,
  provider: PublicKey,
  taskHash: Buffer,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), client.toBuffer(), provider.toBuffer(), taskHash],
    programId
  );
}

export function deriveVaultPDA(
  escrow: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), escrow.toBuffer()],
    programId
  );
}

export function deriveVaultAuthorityPDA(
  escrow: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault_authority"), escrow.toBuffer()],
    programId
  );
}

export function deriveProtocolConfigPDA(
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("protocol_config")],
    programId
  );
}

// ──────────────────────────────────────────────────────
// Hashing helpers
// ──────────────────────────────────────────────────────

/**
 * Hash a task description to a 32-byte SHA-256 digest.
 * This is stored on-chain; the full description is stored off-chain.
 */
export function hashTask(description: string): Buffer {
  return createHash("sha256").update(description).digest();
}

/**
 * Convert a public key string or PublicKey to PublicKey
 */
export function toPublicKey(key: string | PublicKey): PublicKey {
  if (typeof key === "string") {
    return new PublicKey(key);
  }
  return key;
}

/**
 * Format a token amount for display (assumes 6 decimals like USDC)
 */
export function formatTokenAmount(
  amount: number,
  decimals: number = 6
): string {
  return (amount / Math.pow(10, decimals)).toFixed(decimals);
}

/**
 * Parse a human-readable token amount to smallest unit
 */
export function parseTokenAmount(
  amount: number | string,
  decimals: number = 6
): number {
  const parsed = typeof amount === "string" ? parseFloat(amount) : amount;
  return Math.floor(parsed * Math.pow(10, decimals));
}

/**
 * Sleep utility for polling
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
