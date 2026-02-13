use anchor_lang::prelude::*;

use crate::errors::AgentVaultError;
use crate::state::config::ProtocolConfig;

// ──────────────────────────────────────────────────────
// Update Protocol Config — admin only
//
// Allows the admin to change fee authority, fee rates,
// escrow limits, timing bounds, pause/unpause, or
// transfer admin authority.
// ──────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct UpdateProtocolConfig<'info> {
    /// The current admin
    #[account(
        constraint = admin.key() == config.admin @ AgentVaultError::UnauthorizedAdmin,
    )]
    pub admin: Signer<'info>,

    /// The protocol config PDA
    #[account(
        mut,
        seeds = [ProtocolConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, ProtocolConfig>,
}

/// What to update — all fields optional (None = don't change)
/// C-2: Renamed fee_wallet to fee_authority (wallet Pubkey, not token account)
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ConfigUpdate {
    pub fee_authority: Option<Pubkey>,
    pub protocol_fee_bps: Option<u16>,
    pub arbitrator_fee_bps: Option<u16>,
    pub min_escrow_amount: Option<u64>,
    pub max_escrow_amount: Option<u64>,
    pub min_grace_period: Option<i64>,
    pub max_deadline_seconds: Option<i64>,
    pub paused: Option<bool>,
    pub new_admin: Option<Pubkey>,
}

pub fn handler(
    ctx: Context<UpdateProtocolConfig>,
    update: ConfigUpdate,
) -> Result<()> {
    let config = &mut ctx.accounts.config;

    if let Some(fee_authority) = update.fee_authority {
        config.fee_authority = fee_authority;
        msg!("Fee authority updated to {}", fee_authority);
    }

    if let Some(protocol_fee_bps) = update.protocol_fee_bps {
        require!(protocol_fee_bps <= 500, AgentVaultError::FeeTooHigh);
        config.protocol_fee_bps = protocol_fee_bps;
        msg!("Protocol fee updated to {}bps", protocol_fee_bps);
    }

    if let Some(arbitrator_fee_bps) = update.arbitrator_fee_bps {
        require!(arbitrator_fee_bps <= 500, AgentVaultError::FeeTooHigh);
        config.arbitrator_fee_bps = arbitrator_fee_bps;
        msg!("Arbitrator fee updated to {}bps", arbitrator_fee_bps);
    }

    if let Some(min_escrow_amount) = update.min_escrow_amount {
        require!(min_escrow_amount > 0, AgentVaultError::AmountZero);
        config.min_escrow_amount = min_escrow_amount;
    }

    if let Some(max_escrow_amount) = update.max_escrow_amount {
        config.max_escrow_amount = max_escrow_amount;
    }

    if let Some(min_grace_period) = update.min_grace_period {
        require!(min_grace_period >= 0, AgentVaultError::InvalidGracePeriod);
        config.min_grace_period = min_grace_period;
        msg!("Min grace period updated to {}s", min_grace_period);
    }

    if let Some(max_deadline_seconds) = update.max_deadline_seconds {
        require!(max_deadline_seconds > 0, AgentVaultError::DeadlineInPast);
        config.max_deadline_seconds = max_deadline_seconds;
        msg!("Max deadline seconds updated to {}s", max_deadline_seconds);
    }

    if let Some(paused) = update.paused {
        config.paused = paused;
        msg!("Protocol paused: {}", paused);
    }

    if let Some(new_admin) = update.new_admin {
        msg!(
            "Admin authority transferred from {} to {}",
            config.admin,
            new_admin
        );
        config.admin = new_admin;
    }

    Ok(())
}
