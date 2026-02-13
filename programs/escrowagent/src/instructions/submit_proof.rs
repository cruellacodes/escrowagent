use anchor_lang::prelude::*;

use crate::errors::AgentVaultError;
use crate::events::EscrowProofSubmitted;
use crate::state::config::ProtocolConfig;
use crate::state::enums::*;
use crate::state::escrow::Escrow;

// ──────────────────────────────────────────────────────
// Submit Proof — stores proof data and sets status to ProofSubmitted
//
// C-1: ALL verification types now set status to ProofSubmitted.
//      No auto-release path exists. Proof is stored, never
//      auto-released at submission time. Funds are released
//      only via confirm_completion (client) or provider_release
//      (provider after timeout).
//
// C-2: No fee account needed — no transfers happen at proof
//      submission. Fees are collected at release time.
// ──────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct SubmitProof<'info> {
    /// The provider submitting proof of work
    #[account(mut)]
    pub provider: Signer<'info>,

    /// Protocol config — check paused status
    /// H-1: Proof submission blocked when protocol is paused
    #[account(
        seeds = [ProtocolConfig::SEED],
        bump = config.bump,
        constraint = !config.paused @ AgentVaultError::ProtocolPaused,
    )]
    pub config: Account<'info, ProtocolConfig>,

    /// The escrow account
    #[account(
        mut,
        constraint = escrow.provider == provider.key() @ AgentVaultError::UnauthorizedProvider,
        constraint = escrow.status == EscrowStatus::Active @ AgentVaultError::NotActive,
    )]
    pub escrow: Account<'info, Escrow>,
}

pub fn handler(
    ctx: Context<SubmitProof>,
    proof_type: ProofType,
    proof_data: [u8; 64],
) -> Result<()> {
    let clock = Clock::get()?;
    let escrow = &mut ctx.accounts.escrow;

    // Verify deadline hasn't passed
    require!(
        clock.unix_timestamp <= escrow.deadline,
        AgentVaultError::DeadlinePassed
    );

    // Store proof
    escrow.proof_type = Some(proof_type);
    escrow.proof_data = proof_data;
    escrow.proof_submitted_at = clock.unix_timestamp;

    // C-1: ALL verification types transition to ProofSubmitted.
    // Release happens via confirm_completion or provider_release.
    escrow.status = EscrowStatus::ProofSubmitted;

    // Emit proof event
    emit!(EscrowProofSubmitted {
        escrow: escrow.key(),
        provider: escrow.provider,
        proof_type,
        submitted_at: clock.unix_timestamp,
    });

    Ok(())
}
