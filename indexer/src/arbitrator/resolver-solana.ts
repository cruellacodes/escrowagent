import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import type { AiRuling, ArbitratorConfig } from "./types";

// ──────────────────────────────────────────────────────
// Solana On-Chain Resolver
// ──────────────────────────────────────────────────────

const RULING_MAP: Record<string, object> = {
  PayClient: { payClient: {} },
  PayProvider: { payProvider: {} },
  Split: {}, // filled dynamically
};

export async function resolveOnSolana(
  config: ArbitratorConfig,
  escrowAddress: string,
  ruling: AiRuling,
  escrowData: {
    client: string;
    provider: string;
    tokenMint: string;
    escrowVault: string;
  }
): Promise<string> {
  const connection = new Connection(config.solanaRpcUrl, "confirmed");
  const keypairBytes = JSON.parse(config.privateKeySolana);
  const arbitratorKeypair = Keypair.fromSecretKey(Uint8Array.from(keypairBytes));

  const programId = new PublicKey(config.solanaProgramId);
  const escrowPubkey = new PublicKey(escrowAddress);

  // Derive PDAs
  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("protocol_config")],
    programId
  );
  const [vaultAuthorityPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_authority"), escrowPubkey.toBuffer()],
    programId
  );

  // Get token accounts
  const tokenMint = new PublicKey(escrowData.tokenMint);
  const clientPubkey = new PublicKey(escrowData.client);
  const providerPubkey = new PublicKey(escrowData.provider);

  const clientTokenAccount = await getAssociatedTokenAddress(tokenMint, clientPubkey);
  const providerTokenAccount = await getAssociatedTokenAddress(tokenMint, providerPubkey);
  const arbitratorTokenAccount = await getAssociatedTokenAddress(tokenMint, arbitratorKeypair.publicKey);

  // Load program
  const walletAdapter = {
    publicKey: arbitratorKeypair.publicKey,
    signAllTransactions: async <T extends anchor.web3.Transaction | anchor.web3.VersionedTransaction>(txs: T[]): Promise<T[]> => {
      for (const tx of txs) {
        if (tx instanceof anchor.web3.Transaction) tx.sign(arbitratorKeypair);
      }
      return txs;
    },
    signTransaction: async <T extends anchor.web3.Transaction | anchor.web3.VersionedTransaction>(tx: T): Promise<T> => {
      if (tx instanceof anchor.web3.Transaction) tx.sign(arbitratorKeypair);
      return tx;
    },
  };

  const provider = new anchor.AnchorProvider(connection, walletAdapter, { commitment: "confirmed" });
  const idl = await anchor.Program.fetchIdl(programId, provider);
  if (!idl) throw new Error(`Could not fetch IDL for ${programId.toBase58()}`);

  const program = new anchor.Program(idl, provider);

  // Build ruling arg
  let rulingArg: object;
  if (ruling.ruling === "Split") {
    rulingArg = { split: { clientBps: ruling.clientBps, providerBps: ruling.providerBps } };
  } else {
    rulingArg = RULING_MAP[ruling.ruling];
  }

  // Derive protocol fee account from config
  const configAccount = await program.account.protocolConfig.fetch(configPDA) as any;
  const protocolFeeAccount = await getAssociatedTokenAddress(tokenMint, configAccount.feeAuthority);

  console.log(`[Arbitrator/Solana] Submitting ruling for escrow ${escrowAddress}: ${ruling.ruling}`);

  const sig = await program.methods
    .resolveDispute(rulingArg)
    .accounts({
      arbitrator: arbitratorKeypair.publicKey,
      config: configPDA,
      escrow: escrowPubkey,
      escrowVault: new PublicKey(escrowData.escrowVault),
      escrowVaultAuthority: vaultAuthorityPDA,
      clientTokenAccount,
      providerTokenAccount,
      arbitratorTokenAccount,
      protocolFeeAccount,
      client: clientPubkey,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([arbitratorKeypair])
    .rpc();

  console.log(`[Arbitrator/Solana] Ruling submitted: ${sig}`);
  return sig;
}
