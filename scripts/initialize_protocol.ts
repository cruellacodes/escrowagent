#!/usr/bin/env node

/**
 * EscrowAgent Protocol Initialization Script
 * 
 * Initializes the protocol config PDA after deployment.
 * 
 * Usage:
 *   npx ts-node scripts/initialize_protocol.ts <FEE_WALLET_ADDRESS>
 * 
 * Or with custom parameters:
 *   FEE_WALLET=<address> PROTOCOL_FEE_BPS=50 ARBITRATOR_FEE_BPS=100 \
 *     MIN_AMOUNT=1000000 MAX_AMOUNT=1000000000000 \
 *     npx ts-node scripts/initialize_protocol.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

// ──────────────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────────────

const FEE_WALLET_ARG = process.argv[2];
const FEE_WALLET_ENV = process.env.FEE_WALLET;

// Protocol parameters (can be overridden via env vars)
const PROTOCOL_FEE_BPS = parseInt(process.env.PROTOCOL_FEE_BPS || "50", 10); // 0.5%
const ARBITRATOR_FEE_BPS = parseInt(process.env.ARBITRATOR_FEE_BPS || "100", 10); // 1.0%
const MIN_ESCROW_AMOUNT = BigInt(process.env.MIN_AMOUNT || "1000000"); // 1 USDC (6 decimals)
const MAX_ESCROW_AMOUNT = BigInt(process.env.MAX_AMOUNT || "1000000000000"); // 1M USDC (0 = no limit)

// ──────────────────────────────────────────────────────
// Helper Functions
// ──────────────────────────────────────────────────────

function getFeeWallet(): PublicKey {
  const feeWalletStr = FEE_WALLET_ARG || FEE_WALLET_ENV;
  
  if (!feeWalletStr) {
    console.error("❌ Error: Fee wallet address required");
    console.error("");
    console.error("Usage:");
    console.error("  npx ts-node scripts/initialize_protocol.ts <FEE_WALLET_ADDRESS>");
    console.error("");
    console.error("Or set environment variable:");
    console.error("  FEE_WALLET=<address> npx ts-node scripts/initialize_protocol.ts");
    process.exit(1);
  }
  
  try {
    return new PublicKey(feeWalletStr);
  } catch (err) {
    console.error(`❌ Error: Invalid fee wallet address: ${feeWalletStr}`);
    process.exit(1);
  }
}

function deriveConfigPDA(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("protocol_config")],
    programId
  );
}

async function getProgram(): Promise<anchor.Program> {
  // Load provider from environment
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  // Try to use Anchor workspace first (if available)
  try {
    const workspace = anchor.workspace;
    if (workspace && workspace.Escrowagent) {
      return workspace.Escrowagent as anchor.Program;
    }
  } catch (err) {
    // Fall back to loading IDL manually
  }
  
  // Load IDL manually
  const cwd = process.cwd();
  const idlPath = path.join(cwd, "target", "idl", "escrowagent.json");
  
  if (!fs.existsSync(idlPath)) {
    console.error(`❌ Error: IDL not found at ${idlPath}`);
    console.error("   Run 'anchor build' first");
    process.exit(1);
  }
  
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  
  // Get program ID from IDL metadata or Anchor.toml
  let programId: PublicKey;
  if (idl.metadata && idl.metadata.address) {
    programId = new PublicKey(idl.metadata.address);
  } else {
    console.error("❌ Error: Program ID not found in IDL");
    console.error("   Ensure Anchor.toml has the correct program ID");
    process.exit(1);
  }
  
  return new anchor.Program(idl, programId, provider);
}

// ──────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────

async function main() {
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║     EscrowAgent Protocol Initialization                 ║");
  console.log("╚════════════════════════════════════════════════════════╝");
  console.log("");
  
  // Get fee wallet
  const feeWallet = getFeeWallet();
  console.log(`📋 Fee Wallet: ${feeWallet.toBase58()}`);
  
  // Load program
  console.log("");
  console.log("📦 Loading program...");
  const program = await getProgram();
  const programId = program.programId;
  console.log(`   Program ID: ${programId.toBase58()}`);
  
  // Derive config PDA
  const [configPDA, bump] = deriveConfigPDA(programId);
  console.log(`   Config PDA: ${configPDA.toBase58()}`);
  console.log(`   Bump: ${bump}`);
  
  // Check if already initialized
  console.log("");
  console.log("🔍 Checking if protocol is already initialized...");
  try {
    const configAccount = await program.account.protocolConfig.fetch(configPDA);
    console.log("⚠️  Protocol is already initialized!");
    console.log("");
    console.log("Current config:");
    console.log(`  Admin: ${configAccount.admin.toBase58()}`);
    console.log(`  Fee Wallet: ${configAccount.feeWallet.toBase58()}`);
    console.log(`  Protocol Fee: ${configAccount.protocolFeeBps} bps`);
    console.log(`  Arbitrator Fee: ${configAccount.arbitratorFeeBps} bps`);
    console.log(`  Min Escrow: ${configAccount.minEscrowAmount.toString()}`);
    console.log(`  Max Escrow: ${configAccount.maxEscrowAmount.toString()}`);
    console.log(`  Paused: ${configAccount.paused}`);
    console.log("");
    console.log("To update config, use update_protocol_config instruction.");
    process.exit(0);
  } catch (err: any) {
    if (err.message?.includes("Account does not exist")) {
      console.log("✓ Protocol not initialized yet");
    } else {
      throw err;
    }
  }
  
  // Display parameters
  console.log("");
  console.log("📝 Initialization parameters:");
  console.log(`  Protocol Fee: ${PROTOCOL_FEE_BPS} bps (${(PROTOCOL_FEE_BPS / 100).toFixed(2)}%)`);
  console.log(`  Arbitrator Fee: ${ARBITRATOR_FEE_BPS} bps (${(ARBITRATOR_FEE_BPS / 100).toFixed(2)}%)`);
  console.log(`  Min Escrow Amount: ${MIN_ESCROW_AMOUNT.toString()} (${Number(MIN_ESCROW_AMOUNT) / 1e6} USDC)`);
  if (MAX_ESCROW_AMOUNT === BigInt(0)) {
    console.log(`  Max Escrow Amount: No limit`);
  } else {
    console.log(`  Max Escrow Amount: ${MAX_ESCROW_AMOUNT.toString()} (${Number(MAX_ESCROW_AMOUNT) / 1e6} USDC)`);
  }
  
  // Get admin (wallet from provider)
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const admin = provider.wallet.publicKey;
  console.log(`  Admin: ${admin.toBase58()}`);
  
  // Confirm
  console.log("");
  console.log("⚠️  This will initialize the protocol on-chain.");
  console.log("   Press Ctrl+C to cancel, or wait 5 seconds to continue...");
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Initialize
  console.log("");
  console.log("🚀 Initializing protocol...");
  
  try {
    const txSignature = await program.methods
      .initializeProtocol(
        feeWallet,
        PROTOCOL_FEE_BPS,
        ARBITRATOR_FEE_BPS,
        new anchor.BN(MIN_ESCROW_AMOUNT.toString()),
        new anchor.BN(MAX_ESCROW_AMOUNT.toString())
      )
      .accounts({
        admin: admin,
        config: configPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    
    console.log(`✓ Transaction sent: ${txSignature}`);
    console.log("");
    console.log("⏳ Confirming transaction...");
    
    // Wait for confirmation
    await provider.connection.confirmTransaction(txSignature, "confirmed");
    
    console.log("✓ Transaction confirmed!");
    
    // Fetch and display config
    console.log("");
    console.log("📊 Protocol Config:");
    const configAccount = await program.account.protocolConfig.fetch(configPDA);
    console.log(`  Admin: ${configAccount.admin.toBase58()}`);
    console.log(`  Fee Wallet: ${configAccount.feeWallet.toBase58()}`);
    console.log(`  Protocol Fee: ${configAccount.protocolFeeBps} bps`);
    console.log(`  Arbitrator Fee: ${configAccount.arbitratorFeeBps} bps`);
    console.log(`  Min Escrow: ${configAccount.minEscrowAmount.toString()}`);
    console.log(`  Max Escrow: ${configAccount.maxEscrowAmount.toString()}`);
    console.log(`  Paused: ${configAccount.paused}`);
    console.log(`  Bump: ${configAccount.bump}`);
    
    console.log("");
    console.log("✅ Protocol initialized successfully!");
    console.log("");
    console.log("Next steps:");
    console.log("  1. Set up indexer (see DEPLOYMENT.md)");
    console.log("  2. Set up dashboard (see DEPLOYMENT.md)");
    console.log("  3. Start creating escrows!");
    
  } catch (err: any) {
    console.error("");
    console.error("❌ Initialization failed:");
    console.error(err.message);
    if (err.logs) {
      console.error("");
      console.error("Transaction logs:");
      err.logs.forEach((log: string) => console.error(`  ${log}`));
    }
    process.exit(1);
  }
}

// Run
main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
