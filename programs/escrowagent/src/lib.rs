use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;
use state::enums::*;

declare_id!("8rXSN62qT7hb3DkcYrMmi6osPxak7nhXi2cBGDNbh7Py");

#[program]
pub mod escrowagent {
    use super::*;

    // ──────────────────────────────────────────────────────
    // PROTOCOL ADMIN
    // ──────────────────────────────────────────────────────

    /// Initialize the protocol config. Called once by the deployer.
    /// Sets the fee authority, fee rates, escrow limits, and admin authority.
    pub fn initialize_protocol(
        ctx: Context<InitializeProtocol>,
        fee_authority: Pubkey,
        protocol_fee_bps: u16,
        arbitrator_fee_bps: u16,
        min_escrow_amount: u64,
        max_escrow_amount: u64,
        min_grace_period: i64,
        max_deadline_seconds: i64,
    ) -> Result<()> {
        instructions::initialize_config::handler(
            ctx,
            fee_authority,
            protocol_fee_bps,
            arbitrator_fee_bps,
            min_escrow_amount,
            max_escrow_amount,
            min_grace_period,
            max_deadline_seconds,
        )
    }

    /// Update protocol config. Admin only.
    /// All fields are optional — pass None to keep current value.
    pub fn update_protocol_config(
        ctx: Context<UpdateProtocolConfig>,
        update: ConfigUpdate,
    ) -> Result<()> {
        instructions::update_config::handler(ctx, update)
    }

    // ──────────────────────────────────────────────────────
    // ESCROW LIFECYCLE
    // ──────────────────────────────────────────────────────

    /// Create a new escrow and deposit funds.
    /// Fee rates are read from the protocol config.
    pub fn create_escrow(
        ctx: Context<CreateEscrow>,
        amount: u64,
        deadline: i64,
        grace_period: i64,
        task_hash: [u8; 32],
        verification_type: VerificationType,
        criteria_count: u8,
    ) -> Result<()> {
        instructions::create::handler(
            ctx,
            amount,
            deadline,
            grace_period,
            task_hash,
            verification_type,
            criteria_count,
        )
    }

    /// Provider (Agent B) accepts the escrow task.
    pub fn accept_escrow(ctx: Context<AcceptEscrow>) -> Result<()> {
        instructions::accept::handler(ctx)
    }

    /// Provider submits proof of task completion.
    /// Proof is stored and status moves to ProofSubmitted.
    /// No funds are transferred at this stage.
    pub fn submit_proof(
        ctx: Context<SubmitProof>,
        proof_type: ProofType,
        proof_data: [u8; 64],
    ) -> Result<()> {
        instructions::submit_proof::handler(ctx, proof_type, proof_data)
    }

    /// Client confirms task completion (MultiSig / OnChain verification).
    /// Releases funds to provider and collects protocol fee.
    pub fn confirm_completion(ctx: Context<ConfirmCompletion>) -> Result<()> {
        instructions::confirm::handler(ctx)
    }

    /// Client cancels escrow before provider accepts.
    /// Full refund, no fee.
    pub fn cancel_escrow(ctx: Context<CancelEscrow>) -> Result<()> {
        instructions::cancel::handler(ctx)
    }

    /// Anyone can expire an escrow after deadline + grace period.
    /// Only Active or AwaitingProvider — ProofSubmitted is protected.
    /// Full refund to client, no fee.
    pub fn expire_escrow(ctx: Context<ExpireEscrow>) -> Result<()> {
        instructions::expire::handler(ctx)
    }

    /// Provider self-releases funds after confirmation timeout.
    /// Available when status is ProofSubmitted and grace period
    /// has elapsed since proof submission without dispute.
    pub fn provider_release(ctx: Context<ProviderRelease>) -> Result<()> {
        instructions::provider_release::handler(ctx)
    }

    // ──────────────────────────────────────────────────────
    // DISPUTE HANDLING
    // ──────────────────────────────────────────────────────

    /// Either party raises a dispute.
    /// Freezes funds and sets status to Disputed.
    pub fn raise_dispute(ctx: Context<RaiseDispute>) -> Result<()> {
        instructions::dispute::raise_handler(ctx)
    }

    /// Arbitrator resolves a dispute with a ruling.
    /// Fee account is validated against the protocol config.
    pub fn resolve_dispute(
        ctx: Context<ResolveDispute>,
        ruling: DisputeRuling,
    ) -> Result<()> {
        instructions::dispute::resolve_handler(ctx, ruling)
    }
}
