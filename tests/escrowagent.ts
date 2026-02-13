import * as anchor from "@coral-xyz/anchor";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";

describe("escrowagent", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Escrowagent as any;

  // ── Test keypairs ──
  const client = anchor.web3.Keypair.generate();
  const providerAgent = anchor.web3.Keypair.generate();
  const arbitrator = anchor.web3.Keypair.generate();
  const protocolFeeWallet = anchor.web3.Keypair.generate();
  const admin = anchor.web3.Keypair.generate();

  let tokenMint: anchor.web3.PublicKey;
  let clientTokenAccount: anchor.web3.PublicKey;
  let providerTokenAccount: anchor.web3.PublicKey;
  let arbitratorTokenAccount: anchor.web3.PublicKey;
  let protocolFeeTokenAccount: anchor.web3.PublicKey;
  let configPDA: anchor.web3.PublicKey;
  let configBump: number;

  // Task hash (SHA-256 of task description)
  const taskHash = Buffer.alloc(32);
  taskHash.write("test-task-hash-for-swap-execution", "utf-8");

  const ESCROW_AMOUNT = 50_000_000; // 50 USDC (6 decimals)
  const TEN_MINUTES = 600;

  // ── Helper: derive config PDA ──
  function deriveConfigPDA(): [anchor.web3.PublicKey, number] {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("protocol_config")],
      program.programId
    );
  }

  function deriveEscrowPDA(
    clientKey: anchor.web3.PublicKey,
    providerKey: anchor.web3.PublicKey,
    hash: Buffer
  ): [anchor.web3.PublicKey, number] {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        clientKey.toBuffer(),
        providerKey.toBuffer(),
        hash,
      ],
      program.programId
    );
  }

  function deriveVaultPDA(
    escrowKey: anchor.web3.PublicKey
  ): [anchor.web3.PublicKey, number] {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), escrowKey.toBuffer()],
      program.programId
    );
  }

  function deriveVaultAuthorityPDA(
    escrowKey: anchor.web3.PublicKey
  ): [anchor.web3.PublicKey, number] {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault_authority"), escrowKey.toBuffer()],
      program.programId
    );
  }

  // ── Setup ──
  before(async () => {
    const airdropAmount = 10 * anchor.web3.LAMPORTS_PER_SOL;
    const airdropPromises = [
      client, providerAgent, arbitrator, protocolFeeWallet, admin,
    ].map(async (kp) => {
      const sig = await provider.connection.requestAirdrop(kp.publicKey, airdropAmount);
      await provider.connection.confirmTransaction(sig);
    });
    await Promise.all(airdropPromises);

    tokenMint = await createMint(
      provider.connection, client, client.publicKey, null, 6
    );

    clientTokenAccount = await createAssociatedTokenAccount(
      provider.connection, client, tokenMint, client.publicKey
    );
    providerTokenAccount = await createAssociatedTokenAccount(
      provider.connection, providerAgent, tokenMint, providerAgent.publicKey
    );
    arbitratorTokenAccount = await createAssociatedTokenAccount(
      provider.connection, arbitrator, tokenMint, arbitrator.publicKey
    );
    protocolFeeTokenAccount = await createAssociatedTokenAccount(
      provider.connection, protocolFeeWallet, tokenMint, protocolFeeWallet.publicKey
    );

    await mintTo(
      provider.connection, client, tokenMint, clientTokenAccount, client, 1_000_000_000
    );

    // ── Initialize Protocol Config ──
    [configPDA, configBump] = deriveConfigPDA();

    await program.methods
      .initializeProtocol(
        protocolFeeWallet.publicKey, // fee_authority (the WALLET that owns fee token accounts)
        50,                          // protocol_fee_bps (0.5%)
        100,                         // arbitrator_fee_bps (1.0%)
        new anchor.BN(1000),         // min_escrow_amount
        new anchor.BN(0),            // max_escrow_amount (0 = no limit)
        new anchor.BN(300),          // min_grace_period (5 min)
        new anchor.BN(604800),       // max_deadline_seconds (7 days)
      )
      .accounts({
        admin: admin.publicKey,
        config: configPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    const config = await program.account.protocolConfig.fetch(configPDA);
    expect(config.feeAuthority.toBase58()).to.equal(protocolFeeWallet.publicKey.toBase58());
    expect(config.protocolFeeBps).to.equal(50);
    expect(config.arbitratorFeeBps).to.equal(100);
    expect(config.minEscrowAmount.toNumber()).to.equal(1000);
    expect(config.maxEscrowAmount.toNumber()).to.equal(0);
    expect(config.paused).to.equal(false);
  });

  // ══════════════════════════════════════════════════════
  // PROTOCOL CONFIG TESTS
  // ══════════════════════════════════════════════════════

  describe("Protocol Config", () => {
    it("Can update protocol config", async () => {
      const newProtocolFeeBps = 75;
      const newMinEscrow = new anchor.BN(2000);

      await program.methods
        .updateProtocolConfig({
          feeAuthority: null,
          protocolFeeBps: newProtocolFeeBps,
          arbitratorFeeBps: null,
          minEscrowAmount: newMinEscrow,
          maxEscrowAmount: null,
          minGracePeriod: null,
          maxDeadlineSeconds: null,
          paused: null,
          newAdmin: null,
        })
        .accounts({
          admin: admin.publicKey,
          config: configPDA,
        })
        .signers([admin])
        .rpc();

      const config = await program.account.protocolConfig.fetch(configPDA);
      expect(config.protocolFeeBps).to.equal(newProtocolFeeBps);
      expect(config.minEscrowAmount.toNumber()).to.equal(newMinEscrow.toNumber());
      expect(config.feeAuthority.toBase58()).to.equal(protocolFeeWallet.publicKey.toBase58());
      expect(config.arbitratorFeeBps).to.equal(100);
    });

    it("Can pause and unpause protocol", async () => {
      await program.methods
        .updateProtocolConfig({
          feeAuthority: null,
          protocolFeeBps: null,
          arbitratorFeeBps: null,
          minEscrowAmount: null,
          maxEscrowAmount: null,
          minGracePeriod: null,
          maxDeadlineSeconds: null,
          paused: true,
          newAdmin: null,
        })
        .accounts({
          admin: admin.publicKey,
          config: configPDA,
        })
        .signers([admin])
        .rpc();

      let config = await program.account.protocolConfig.fetch(configPDA);
      expect(config.paused).to.equal(true);

      await program.methods
        .updateProtocolConfig({
          feeAuthority: null,
          protocolFeeBps: null,
          arbitratorFeeBps: null,
          minEscrowAmount: null,
          maxEscrowAmount: null,
          minGracePeriod: null,
          maxDeadlineSeconds: null,
          paused: false,
          newAdmin: null,
        })
        .accounts({
          admin: admin.publicKey,
          config: configPDA,
        })
        .signers([admin])
        .rpc();

      config = await program.account.protocolConfig.fetch(configPDA);
      expect(config.paused).to.equal(false);
    });

    after(async () => {
      await program.methods
        .updateProtocolConfig({
          feeAuthority: null,
          protocolFeeBps: 50,
          arbitratorFeeBps: null,
          minEscrowAmount: new anchor.BN(1000),
          maxEscrowAmount: null,
          minGracePeriod: null,
          maxDeadlineSeconds: null,
          paused: null,
          newAdmin: null,
        })
        .accounts({
          admin: admin.publicKey,
          config: configPDA,
        })
        .signers([admin])
        .rpc();
    });
  });

  // ══════════════════════════════════════════════════════
  // HAPPY PATH: Create → Accept → Submit Proof → Confirm
  // ══════════════════════════════════════════════════════

  describe("Happy Path (MultiSig Verification)", () => {
    let escrowPDA: anchor.web3.PublicKey;
    let escrowBump: number;
    let vaultPDA: anchor.web3.PublicKey;
    let vaultAuthorityPDA: anchor.web3.PublicKey;

    it("Creates an escrow", async () => {
      [escrowPDA, escrowBump] = deriveEscrowPDA(client.publicKey, providerAgent.publicKey, taskHash);
      [vaultPDA] = deriveVaultPDA(escrowPDA);
      [vaultAuthorityPDA] = deriveVaultAuthorityPDA(escrowPDA);

      const deadline = Math.floor(Date.now() / 1000) + TEN_MINUTES;

      await program.methods
        .createEscrow(
          new anchor.BN(ESCROW_AMOUNT),
          new anchor.BN(deadline),
          new anchor.BN(300),
          Array.from(taskHash),
          { multiSigConfirm: {} },
          1
        )
        .accounts({
          client: client.publicKey,
          provider: providerAgent.publicKey,
          arbitrator: arbitrator.publicKey,
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

      const escrow = await program.account.escrow.fetch(escrowPDA);
      expect(escrow.client.toBase58()).to.equal(client.publicKey.toBase58());
      expect(escrow.provider.toBase58()).to.equal(providerAgent.publicKey.toBase58());
      expect(escrow.amount.toNumber()).to.equal(ESCROW_AMOUNT);
      expect(escrow.status).to.deep.include({ awaitingProvider: {} });

      const vaultAccount = await getAccount(provider.connection, vaultPDA);
      expect(Number(vaultAccount.amount)).to.equal(ESCROW_AMOUNT);
    });

    it("Provider accepts the escrow", async () => {
      await program.methods
        .acceptEscrow()
        .accounts({
          provider: providerAgent.publicKey,
          config: configPDA,
          escrow: escrowPDA,
        })
        .signers([providerAgent])
        .rpc();

      const escrow = await program.account.escrow.fetch(escrowPDA);
      expect(escrow.status).to.deep.include({ active: {} });
    });

    it("Provider submits proof", async () => {
      const proofData = Buffer.alloc(64);
      proofData.write("fake-tx-signature-proof-data", "utf-8");

      await program.methods
        .submitProof(
          { signedConfirmation: {} },
          Array.from(proofData)
        )
        .accounts({
          provider: providerAgent.publicKey,
          config: configPDA,
          escrow: escrowPDA,
        })
        .signers([providerAgent])
        .rpc();

      const escrow = await program.account.escrow.fetch(escrowPDA);
      expect(escrow.status).to.deep.include({ proofSubmitted: {} });
    });

    it("Client confirms completion — funds released", async () => {
      const providerBalanceBefore = await getAccount(provider.connection, providerTokenAccount);

      await program.methods
        .confirmCompletion()
        .accounts({
          client: client.publicKey,
          config: configPDA,
          escrow: escrowPDA,
          escrowVault: vaultPDA,
          escrowVaultAuthority: vaultAuthorityPDA,
          providerTokenAccount: providerTokenAccount,
          protocolFeeAccount: protocolFeeTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([client])
        .rpc();

      // Verify provider received funds (minus 0.5% fee)
      const providerBalanceAfter = await getAccount(provider.connection, providerTokenAccount);
      const expectedPayout = ESCROW_AMOUNT - Math.floor((ESCROW_AMOUNT * 50) / 10_000);
      expect(
        Number(providerBalanceAfter.amount) - Number(providerBalanceBefore.amount)
      ).to.equal(expectedPayout);

      // Verify protocol fee collected
      const feeAccount = await getAccount(provider.connection, protocolFeeTokenAccount);
      expect(Number(feeAccount.amount)).to.equal(Math.floor((ESCROW_AMOUNT * 50) / 10_000));
    });
  });

  // ══════════════════════════════════════════════════════
  // CANCELLATION
  // ══════════════════════════════════════════════════════

  describe("Cancellation Flow", () => {
    let escrowPDA: anchor.web3.PublicKey;
    let vaultPDA: anchor.web3.PublicKey;
    let vaultAuthorityPDA: anchor.web3.PublicKey;
    const cancelTaskHash = Buffer.alloc(32);
    cancelTaskHash.write("cancel-test-task-hash", "utf-8");

    it("Creates and then cancels an escrow — full refund", async () => {
      [escrowPDA] = deriveEscrowPDA(client.publicKey, providerAgent.publicKey, cancelTaskHash);
      [vaultPDA] = deriveVaultPDA(escrowPDA);
      [vaultAuthorityPDA] = deriveVaultAuthorityPDA(escrowPDA);

      const clientBalanceBefore = await getAccount(provider.connection, clientTokenAccount);
      const deadline = Math.floor(Date.now() / 1000) + TEN_MINUTES;

      await program.methods
        .createEscrow(
          new anchor.BN(ESCROW_AMOUNT),
          new anchor.BN(deadline),
          new anchor.BN(300),
          Array.from(cancelTaskHash),
          { multiSigConfirm: {} },
          0
        )
        .accounts({
          client: client.publicKey,
          provider: providerAgent.publicKey,
          arbitrator: arbitrator.publicKey,
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

      await program.methods
        .cancelEscrow()
        .accounts({
          client: client.publicKey,
          config: configPDA,
          escrow: escrowPDA,
          escrowVault: vaultPDA,
          escrowVaultAuthority: vaultAuthorityPDA,
          clientTokenAccount: clientTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([client])
        .rpc();

      const clientBalanceAfter = await getAccount(provider.connection, clientTokenAccount);
      expect(Number(clientBalanceAfter.amount)).to.equal(Number(clientBalanceBefore.amount));
    });
  });

  // ══════════════════════════════════════════════════════
  // DISPUTE FLOW
  // ══════════════════════════════════════════════════════

  describe("Dispute Flow", () => {
    let escrowPDA: anchor.web3.PublicKey;
    let vaultPDA: anchor.web3.PublicKey;
    let vaultAuthorityPDA: anchor.web3.PublicKey;
    const disputeTaskHash = Buffer.alloc(32);
    disputeTaskHash.write("dispute-test-task-hash", "utf-8");

    before(async () => {
      [escrowPDA] = deriveEscrowPDA(client.publicKey, providerAgent.publicKey, disputeTaskHash);
      [vaultPDA] = deriveVaultPDA(escrowPDA);
      [vaultAuthorityPDA] = deriveVaultAuthorityPDA(escrowPDA);

      const deadline = Math.floor(Date.now() / 1000) + TEN_MINUTES;

      // Create
      await program.methods
        .createEscrow(
          new anchor.BN(ESCROW_AMOUNT),
          new anchor.BN(deadline),
          new anchor.BN(300),
          Array.from(disputeTaskHash),
          { multiSigConfirm: {} },
          1
        )
        .accounts({
          client: client.publicKey,
          provider: providerAgent.publicKey,
          arbitrator: arbitrator.publicKey,
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

      // Accept
      await program.methods
        .acceptEscrow()
        .accounts({
          provider: providerAgent.publicKey,
          config: configPDA,
          escrow: escrowPDA,
        })
        .signers([providerAgent])
        .rpc();

      // Submit proof
      const proofData = Buffer.alloc(64);
      proofData.write("disputed-proof-data", "utf-8");

      await program.methods
        .submitProof({ signedConfirmation: {} }, Array.from(proofData))
        .accounts({
          provider: providerAgent.publicKey,
          config: configPDA,
          escrow: escrowPDA,
        })
        .signers([providerAgent])
        .rpc();
    });

    it("Client raises a dispute", async () => {
      await program.methods
        .raiseDispute()
        .accounts({
          raiser: client.publicKey,
          config: configPDA,
          escrow: escrowPDA,
        })
        .signers([client])
        .rpc();

      const escrow = await program.account.escrow.fetch(escrowPDA);
      expect(escrow.status).to.deep.include({ disputed: {} });
      expect(escrow.disputeRaisedBy.toBase58()).to.equal(client.publicKey.toBase58());
    });

    it("Arbitrator resolves with 50/50 split", async () => {
      const providerBalanceBefore = await getAccount(provider.connection, providerTokenAccount);
      const clientBalanceBefore = await getAccount(provider.connection, clientTokenAccount);

      await program.methods
        .resolveDispute({
          split: { clientBps: 5000, providerBps: 5000 },
        })
        .accounts({
          arbitrator: arbitrator.publicKey,
          config: configPDA,
          escrow: escrowPDA,
          escrowVault: vaultPDA,
          escrowVaultAuthority: vaultAuthorityPDA,
          clientTokenAccount: clientTokenAccount,
          providerTokenAccount: providerTokenAccount,
          arbitratorTokenAccount: arbitratorTokenAccount,
          protocolFeeAccount: protocolFeeTokenAccount,
          client: client.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([arbitrator])
        .rpc();

      // Verify funds distributed
      const protocolFee = Math.floor((ESCROW_AMOUNT * 50) / 10_000);
      const arbitratorFee = Math.floor((ESCROW_AMOUNT * 100) / 10_000);

      const arbAccount = await getAccount(provider.connection, arbitratorTokenAccount);
      expect(Number(arbAccount.amount)).to.equal(arbitratorFee);
    });
  });
});
