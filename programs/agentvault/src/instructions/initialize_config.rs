use anchor_lang::prelude::*;

use crate::errors::AgentVaultError;
use crate::state::config::ProtocolConfig;

// ──────────────────────────────────────────────────────
// Initialize Protocol Config — called once by deployer
//
// Creates the singleton ProtocolConfig PDA that stores
// the fee wallet, fee rates, and admin authority.
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
    fee_wallet: Pubkey,
    protocol_fee_bps: u16,
    arbitrator_fee_bps: u16,
    min_escrow_amount: u64,
    max_escrow_amount: u64,
) -> Result<()> {
    // Validate fee rates
    require!(protocol_fee_bps <= 500, AgentVaultError::FeeTooHigh);     // max 5%
    require!(arbitrator_fee_bps <= 500, AgentVaultError::FeeTooHigh);   // max 5%
    require!(min_escrow_amount > 0, AgentVaultError::AmountZero);

    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.fee_wallet = fee_wallet;
    config.protocol_fee_bps = protocol_fee_bps;
    config.arbitrator_fee_bps = arbitrator_fee_bps;
    config.min_escrow_amount = min_escrow_amount;
    config.max_escrow_amount = max_escrow_amount;
    config.paused = false;
    config.bump = ctx.bumps.config;

    msg!(
        "Protocol initialized: admin={}, fee_wallet={}, fee={}bps",
        config.admin,
        config.fee_wallet,
        config.protocol_fee_bps
    );

    Ok(())
}
