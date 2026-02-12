use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount, Transfer};

use crate::errors::AgentVaultError;
use crate::events::EscrowCancelled;
use crate::state::config::ProtocolConfig;
use crate::state::enums::EscrowStatus;
use crate::state::escrow::Escrow;

#[derive(Accounts)]
pub struct CancelEscrow<'info> {
    /// The client cancelling the escrow
    #[account(mut)]
    pub client: Signer<'info>,

    /// Protocol config — check paused status
    #[account(
        seeds = [ProtocolConfig::SEED],
        bump = config.bump,
        constraint = !config.paused @ AgentVaultError::ProtocolPaused,
    )]
    pub config: Account<'info, ProtocolConfig>,

    /// The escrow account
    #[account(
        mut,
        constraint = escrow.client == client.key() @ AgentVaultError::UnauthorizedClient,
        constraint = escrow.status == EscrowStatus::AwaitingProvider @ AgentVaultError::InvalidStatus,
    )]
    pub escrow: Account<'info, Escrow>,

    /// The escrow vault holding funds
    #[account(
        mut,
        constraint = escrow_vault.key() == escrow.escrow_vault,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    /// CHECK: PDA authority over the vault
    #[account(
        seeds = [b"vault_authority", escrow.key().as_ref()],
        bump,
    )]
    pub escrow_vault_authority: UncheckedAccount<'info>,

    /// Client's token account to receive refund
    #[account(
        mut,
        constraint = client_token_account.owner == client.key(),
        constraint = client_token_account.mint == escrow.token_mint,
    )]
    pub client_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<CancelEscrow>) -> Result<()> {
    let clock = Clock::get()?;
    let escrow = &mut ctx.accounts.escrow;

    let refund_amount = escrow.amount;

    let escrow_key = escrow.key();
    let vault_authority_bump = ctx.bumps.escrow_vault_authority;
    let seeds = &[
        b"vault_authority".as_ref(),
        escrow_key.as_ref(),
        &[vault_authority_bump],
    ];
    let signer_seeds = &[&seeds[..]];

    // Full refund to client — no cancellation fee
    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.escrow_vault.to_account_info(),
            to: ctx.accounts.client_token_account.to_account_info(),
            authority: ctx.accounts.escrow_vault_authority.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(transfer_ctx, refund_amount)?;

    // Close the vault token account, return rent to client
    let close_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.escrow_vault.to_account_info(),
            destination: ctx.accounts.client.to_account_info(),
            authority: ctx.accounts.escrow_vault_authority.to_account_info(),
        },
        signer_seeds,
    );
    token::close_account(close_ctx)?;

    escrow.status = EscrowStatus::Cancelled;

    emit!(EscrowCancelled {
        escrow: escrow.key(),
        client: escrow.client,
        cancelled_at: clock.unix_timestamp,
    });

    Ok(())
}
