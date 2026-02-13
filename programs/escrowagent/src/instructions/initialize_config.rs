use anchor_lang::prelude::*;

use crate::errors::AgentVaultError;
use crate::state::config::ProtocolConfig;

// ──────────────────────────────────────────────────────
// Initialize Protocol Config — called once by deployer
//
// Creates the singleton ProtocolConfig PDA that stores
// the fee authority, fee rates, and admin authority.
//
// M-5: fee_authority is a wallet Pubkey (not a token account).
//      Fee token accounts are derived as ATAs per mint at runtime.
//
// M-6: The `init` constraint ensures this can only be called once.
//      There is a theoretical front-running risk at deployment time
//      where an attacker could initialize the config before the
//      legitimate deployer. Mitigate by deploying and initializing
//      in the same transaction, or by adding the deployer as a
//      hardcoded constant in a future version.
// ──────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    /// The deployer/admin initializing the protocol
    #[account(mut)]
    pub admin: Signer<'info>,

    /// The protocol config PDA — singleton, derived from a fixed seed
    #[account(
        init,
        payer = admin,
        space = ProtocolConfig::LEN,
        seeds = [ProtocolConfig::SEED],
        bump,
    )]
    pub config: Account<'info, ProtocolConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeProtocol>,
    fee_authority: Pubkey,
    protocol_fee_bps: u16,
    arbitrator_fee_bps: u16,
    min_escrow_amount: u64,
    max_escrow_amount: u64,
    min_grace_period: i64,
    max_deadline_seconds: i64,
) -> Result<()> {
    // Validate fee rates
    require!(protocol_fee_bps <= 500, AgentVaultError::FeeTooHigh);     // max 5%
    require!(arbitrator_fee_bps <= 500, AgentVaultError::FeeTooHigh);   // max 5%
    require!(min_escrow_amount > 0, AgentVaultError::AmountZero);
    require!(fee_authority != Pubkey::default(), AgentVaultError::InvalidFeeAccount);
    require!(min_grace_period > 0, AgentVaultError::InvalidGracePeriod);
    require!(max_deadline_seconds > 0, AgentVaultError::DeadlineInPast);

    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.fee_authority = fee_authority;
    config.protocol_fee_bps = protocol_fee_bps;
    config.arbitrator_fee_bps = arbitrator_fee_bps;
    config.min_escrow_amount = min_escrow_amount;
    config.max_escrow_amount = max_escrow_amount;
    config.min_grace_period = min_grace_period;
    config.max_deadline_seconds = max_deadline_seconds;
    config.paused = false;
    config.bump = ctx.bumps.config;

    msg!(
        "Protocol initialized: admin={}, fee_authority={}, fee={}bps, min_grace={}s, max_deadline={}s",
        config.admin,
        config.fee_authority,
        config.protocol_fee_bps,
        config.min_grace_period,
        config.max_deadline_seconds,
    );

    Ok(())
}
