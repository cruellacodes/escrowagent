use anchor_lang::prelude::*;

use crate::errors::AgentVaultError;
use crate::state::config::ProtocolConfig;

// ──────────────────────────────────────────────────────
// Update Protocol Config — admin only
//
// Allows the admin to change fee wallet, fee rates,
// escrow limits, pause/unpause, or transfer admin authority.
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
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ConfigUpdate {
    pub fee_wallet: Option<Pubkey>,
    pub protocol_fee_bps: Option<u16>,
    pub arbitrator_fee_bps: Option<u16>,
    pub min_escrow_amount: Option<u64>,
    pub max_escrow_amount: Option<u64>,
    pub paused: Option<bool>,
    pub new_admin: Option<Pubkey>,
}

pub fn handler(
    ctx: Context<UpdateProtocolConfig>,
    update: ConfigUpdate,
) -> Result<()> {
    let config = &mut ctx.accounts.config;

    if let Some(fee_wallet) = update.fee_wallet {
        config.fee_wallet = fee_wallet;
        msg!("Fee wallet updated to {}", fee_wallet);
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
