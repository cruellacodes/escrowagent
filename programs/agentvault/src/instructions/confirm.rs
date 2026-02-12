use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::AgentVaultError;
use crate::events::EscrowCompleted;
use crate::state::config::ProtocolConfig;
use crate::state::enums::EscrowStatus;
use crate::state::escrow::Escrow;

#[derive(Accounts)]
pub struct ConfirmCompletion<'info> {
    /// The client confirming the task is done
    #[account(mut)]
    pub client: Signer<'info>,

    /// Protocol config — used to validate the fee account
    #[account(
        seeds = [ProtocolConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, ProtocolConfig>,

    /// The escrow account
    #[account(
        mut,
        constraint = escrow.client == client.key() @ AgentVaultError::UnauthorizedClient,
        constraint = escrow.status == EscrowStatus::ProofSubmitted @ AgentVaultError::NoProofSubmitted,
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

    /// Provider's token account to receive payment
    #[account(
        mut,
        constraint = provider_token_account.owner == escrow.provider,
        constraint = provider_token_account.mint == escrow.token_mint,
    )]
    pub provider_token_account: Account<'info, TokenAccount>,

    /// Protocol fee token account — MUST match the config's fee_wallet
    #[account(
        mut,
        constraint = protocol_fee_account.key() == config.fee_wallet @ AgentVaultError::InvalidFeeAccount,
    )]
    pub protocol_fee_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ConfirmCompletion>) -> Result<()> {
    let clock = Clock::get()?;
    let escrow = &mut ctx.accounts.escrow;

    let protocol_fee = escrow.calculate_protocol_fee();
    let provider_amount = escrow.provider_payout();

    let escrow_key = escrow.key();
    let vault_authority_bump = ctx.bumps.escrow_vault_authority;
    let seeds = &[
        b"vault_authority".as_ref(),
        escrow_key.as_ref(),
        &[vault_authority_bump],
    ];
    let signer_seeds = &[&seeds[..]];

    // Transfer to provider
    let transfer_provider = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.escrow_vault.to_account_info(),
            to: ctx.accounts.provider_token_account.to_account_info(),
            authority: ctx.accounts.escrow_vault_authority.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(transfer_provider, provider_amount)?;

    // Transfer protocol fee to the validated fee wallet
    if protocol_fee > 0 {
        let transfer_fee = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow_vault.to_account_info(),
                to: ctx.accounts.protocol_fee_account.to_account_info(),
                authority: ctx.accounts.escrow_vault_authority.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(transfer_fee, protocol_fee)?;
    }

    // Update state
    escrow.status = EscrowStatus::Completed;
    escrow.client_escrow_count = escrow.client_escrow_count.checked_add(1).unwrap();
    escrow.provider_escrow_count = escrow.provider_escrow_count.checked_add(1).unwrap();

    emit!(EscrowCompleted {
        escrow: escrow.key(),
        amount_paid: provider_amount,
        fee_collected: protocol_fee,
        completed_at: clock.unix_timestamp,
    });

    Ok(())
}
