/**
 * Test script — creates a real escrow on devnet to verify the full flow:
 *   Script → Solana → Indexer → API → Dashboard
 *
 * Run:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   npx tsx scripts/test_devnet.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const BN = anchor.BN;

const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

async function main() {
  console.log(`\n${BOLD}EscrowAgent Devnet Test${RESET}\n`);

  // Setup provider
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Escrowagent as any;
  const connection = provider.connection;

  console.log(`${DIM}Program:  ${program.programId.toBase58()}${RESET}`);
  console.log(`${DIM}Wallet:   ${provider.wallet.publicKey.toBase58()}${RESET}`);
  console.log(`${DIM}Network:  ${connection.rpcEndpoint}${RESET}\n`);

  // ── Step 1: Use main wallet as client, generate provider ──
  console.log(`${CYAN}[1/6]${RESET} Setting up accounts...`);

  // Use the funded wallet as both client and provider for testing
  // In production these would be separate agents
  const walletKp = (provider.wallet as any).payer as Keypair;
  const client = walletKp;
  const providerAgent = Keypair.generate();
  const arbitrator = Keypair.generate();

  // Fund provider and arbitrator from client (transfer SOL, not airdrop)
  const fundTx = new anchor.web3.Transaction().add(
    anchor.web3.SystemProgram.transfer({
      fromPubkey: client.publicKey,
      toPubkey: providerAgent.publicKey,
      lamports: 0.1 * LAMPORTS_PER_SOL,
    }),
    anchor.web3.SystemProgram.transfer({
      fromPubkey: client.publicKey,
      toPubkey: arbitrator.publicKey,
      lamports: 0.05 * LAMPORTS_PER_SOL,
    })
  );
  await provider.sendAndConfirm(fundTx);

  console.log(`  Client:     ${client.publicKey.toBase58()}`);
  console.log(`  Provider:   ${providerAgent.publicKey.toBase58()}`);
  console.log(`  Arbitrator: ${arbitrator.publicKey.toBase58()}`);

  // ── Step 2: Create test token (mock USDC) ──
  console.log(`${CYAN}[2/6]${RESET} Creating test token...`);

  const tokenMint = await createMint(connection, client, client.publicKey, null, 6);
  const clientTokenAccount = await createAssociatedTokenAccount(connection, client, tokenMint, client.publicKey);
  const providerTokenAccount = await createAssociatedTokenAccount(connection, providerAgent, tokenMint, providerAgent.publicKey);

  // Mint 1000 tokens to client
  await mintTo(connection, client, tokenMint, clientTokenAccount, client, 1_000_000_000);

  const clientBalance = await getAccount(connection, clientTokenAccount);
  console.log(`  Mint:     ${tokenMint.toBase58()}`);
  console.log(`  Balance:  ${Number(clientBalance.amount) / 1_000_000} tokens`);

  // ── Step 3: Derive PDAs ──
  console.log(`${CYAN}[3/6]${RESET} Deriving PDAs...`);

  const taskHash = Buffer.alloc(32);
  taskHash.write("devnet-test-" + Date.now().toString(), "utf-8");

  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("protocol_config")],
    program.programId
  );
  const [escrowPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), client.publicKey.toBuffer(), providerAgent.publicKey.toBuffer(), taskHash],
    program.programId
  );
  const [vaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), escrowPDA.toBuffer()],
    program.programId
  );
  const [vaultAuthorityPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_authority"), escrowPDA.toBuffer()],
    program.programId
  );

  // The config's fee_wallet is for a specific mint. For testing with a new token,
  // we need a fee account for THIS mint. Create one owned by a separate fee keypair.
  const feeKeypair = Keypair.generate();
  const feeFundTx = new anchor.web3.Transaction().add(
    anchor.web3.SystemProgram.transfer({
      fromPubkey: client.publicKey,
      toPubkey: feeKeypair.publicKey,
      lamports: 0.05 * LAMPORTS_PER_SOL,
    })
  );
  await provider.sendAndConfirm(feeFundTx);
  const feeTokenAccount = await createAssociatedTokenAccount(
    connection, feeKeypair, tokenMint, feeKeypair.publicKey
  );

  // Update protocol config to use this fee account for testing
  await program.methods
    .updateProtocolConfig({
      feeWallet: feeTokenAccount,
      protocolFeeBps: null,
      arbitratorFeeBps: null,
      minEscrowAmount: null,
      maxEscrowAmount: null,
      paused: null,
      newAdmin: null,
    })
    .accounts({
      admin: client.publicKey,
      config: configPDA,
    })
    .signers([client])
    .rpc();

  const feeWallet = feeTokenAccount;
  console.log(`  Fee acct: ${feeWallet.toBase58()}`);

  console.log(`  Config:   ${configPDA.toBase58()}`);
  console.log(`  Escrow:   ${escrowPDA.toBase58()}`);

  // ── Step 4: Create Escrow ──
  const escrowAmount = 10_000_000; // 10 tokens
  const deadline = Math.floor(Date.now() / 1000) + 600; // 10 min

  console.log(`${CYAN}[4/6]${RESET} Creating escrow for ${escrowAmount / 1_000_000} tokens...`);

  const createTx = await program.methods
    .createEscrow(
      new BN(escrowAmount),
      new BN(deadline),
      new BN(300),
      Array.from(taskHash),
      { multiSigConfirm: {} },
      1
    )
    .accounts({
      client: client.publicKey,
      provider: providerAgent.publicKey,
      arbitrator: arbitrator.publicKey, // separate neutral third party
      config: configPDA,
      escrow: escrowPDA,
      tokenMint: tokenMint,
      clientTokenAccount: clientTokenAccount,
      escrowVault: vaultPDA,
      escrowVaultAuthority: vaultAuthorityPDA,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .signers([client])
    .rpc();

  console.log(`  ${GREEN}TX: ${createTx}${RESET}`);

  // Verify
  const escrow = await program.account.escrow.fetch(escrowPDA);
  console.log(`  Status: ${JSON.stringify(escrow.status)}`);
  console.log(`  Amount: ${escrow.amount.toNumber() / 1_000_000} tokens`);

  // ── Step 5: Provider accepts ──
  console.log(`${CYAN}[5/6]${RESET} Provider accepting escrow...`);

  const acceptTx = await program.methods
    .acceptEscrow()
    .accounts({
      provider: providerAgent.publicKey,
      config: configPDA,
      escrow: escrowPDA,
    })
    .signers([providerAgent])
    .rpc();

  console.log(`  ${GREEN}TX: ${acceptTx}${RESET}`);

  const escrowAfterAccept = await program.account.escrow.fetch(escrowPDA);
  console.log(`  Status: ${JSON.stringify(escrowAfterAccept.status)}`);

  // ── Step 6: Submit proof ──
  console.log(`${CYAN}[6/6]${RESET} Provider submitting proof...`);

  const proofData = Buffer.alloc(64);
  proofData.write("devnet-test-proof-" + Date.now(), "utf-8");

  const proofTx = await program.methods
    .submitProof(
      { signedConfirmation: {} },
      Array.from(proofData)
    )
    .accounts({
      provider: providerAgent.publicKey,
      config: configPDA,
      escrow: escrowPDA,
      escrowVault: vaultPDA,
      escrowVaultAuthority: vaultAuthorityPDA,
      providerTokenAccount: providerTokenAccount,
      protocolFeeAccount: feeWallet,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([providerAgent])
    .rpc();

  console.log(`  ${GREEN}TX: ${proofTx}${RESET}`);

  const escrowAfterProof = await program.account.escrow.fetch(escrowPDA);
  console.log(`  Status: ${JSON.stringify(escrowAfterProof.status)}`);

  // ── Step 7: Client confirms completion ──
  console.log(`${CYAN}[7/7]${RESET} Client confirming completion — releasing funds...`);

  const confirmTx = await program.methods
    .confirmCompletion()
    .accounts({
      client: client.publicKey,
      config: configPDA,
      escrow: escrowPDA,
      escrowVault: vaultPDA,
      escrowVaultAuthority: vaultAuthorityPDA,
      providerTokenAccount: providerTokenAccount,
      protocolFeeAccount: feeWallet,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([client])
    .rpc();

  console.log(`  ${GREEN}TX: ${confirmTx}${RESET}`);

  const escrowAfterConfirm = await program.account.escrow.fetch(escrowPDA);
  console.log(`  Status: ${JSON.stringify(escrowAfterConfirm.status)}`);

  // Check provider got paid
  const providerBalance = await getAccount(connection, providerTokenAccount);
  const protocolFee = escrowAmount * 50 / 10_000;
  console.log(`  Provider received: ${(Number(providerBalance.amount)) / 1_000_000} tokens`);
  console.log(`  Protocol fee:      ${protocolFee / 1_000_000} tokens (0.5%)`);

  // ── Done ──
  console.log(`
${GREEN}${BOLD}Full escrow lifecycle complete!${RESET}

${BOLD}Escrow:${RESET}  ${escrowPDA.toBase58()}
${BOLD}Status:${RESET}  ${GREEN}Completed${RESET} — funds released to provider

${BOLD}Check it:${RESET}
  ${DIM}Dashboard:${RESET}  http://localhost:3000/escrows/${escrowPDA.toBase58()}
  ${DIM}Solscan:${RESET}   https://solscan.io/account/${escrowPDA.toBase58()}?cluster=devnet
  ${DIM}API:${RESET}       http://localhost:3001/stats
`);
}

main().catch((err) => {
  console.error(`\n${YELLOW}Error:${RESET}`, err.message || err);
  process.exit(1);
});
