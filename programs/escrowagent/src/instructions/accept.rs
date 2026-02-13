use anchor_lang::prelude::*;

use crate::errors::AgentVaultError;
use crate::events::EscrowAccepted;
use crate::state::config::ProtocolConfig;
use crate::state::enums::EscrowStatus;
use crate::state::escrow::Escrow;

#[derive(Accounts)]
pub struct AcceptEscrow<'info> {
    /// The provider (Agent B) accepting the task
    /// I-4: No `mut` needed — provider pays no SOL and no account writes target it
    pub provider: Signer<'info>,

    /// Protocol config — check paused status
    #[account(
        seeds = [ProtocolConfig::SEED],
        bump = config.bump,
        constraint = !config.paused @ AgentVaultError::ProtocolPaused,
    )]
    pub config: Account<'info, ProtocolConfig>,

    /// The escrow account to accept
    #[account(
        mut,
        constraint = escrow.provider == provider.key() @ AgentVaultError::UnauthorizedProvider,
        constraint = escrow.status == EscrowStatus::AwaitingProvider @ AgentVaultError::NotAwaitingProvider,
    )]
    pub escrow: Account<'info, Escrow>,
}

pub fn handler(ctx: Context<AcceptEscrow>) -> Result<()> {
    let clock = Clock::get()?;
    let escrow = &mut ctx.accounts.escrow;

    // Verify deadline hasn't already passed
    require!(
        clock.unix_timestamp < escrow.deadline,
        AgentVaultError::DeadlinePassed
    );

    // Transition state
    escrow.status = EscrowStatus::Active;

    // Emit event
    emit!(EscrowAccepted {
        escrow: escrow.key(),
        provider: escrow.provider,
        accepted_at: clock.unix_timestamp,
    });

    Ok(())
}
