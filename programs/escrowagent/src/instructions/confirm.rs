use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount, Transfer};

use crate::errors::AgentVaultError;
use crate::events::EscrowCompleted;
use crate::state::config::ProtocolConfig;
use crate::state::enums::*;
use crate::state::escrow::Escrow;

#[derive(Accounts)]
pub struct ConfirmCompletion<'info> {
    /// The client confirming the task is done
    #[account(mut)]
    pub client: Signer<'info>,

    /// Protocol config — used to validate the fee account
    /// H-1: Confirmation blocked when protocol is paused
    #[account(
        seeds = [ProtocolConfig::SEED],
        bump = config.bump,
        constraint = !config.paused @ AgentVaultError::ProtocolPaused,
    )]
    pub config: Account<'info, ProtocolConfig>,

    /// The escrow account
    /// M-2: Only MultiSigConfirm and OnChain verification types allow client confirmation
    /// M-1: Close escrow after completion, rent recovered to client
    #[account(
        mut,
        close = client,
        constraint = escrow.client == client.key() @ AgentVaultError::UnauthorizedClient,
        constraint = escrow.status == EscrowStatus::ProofSubmitted @ AgentVaultError::NoProofSubmitted,
        constraint = matches!(
            escrow.verification_type,
            VerificationType::MultiSigConfirm | VerificationType::OnChain
        ) @ AgentVaultError::VerificationTypeMismatch,
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

    /// Protocol fee token account
    /// C-2: Validated against config.fee_authority (owner) + escrow.token_mint (mint)
    #[account(
        mut,
        constraint = protocol_fee_account.owner == config.fee_authority @ AgentVaultError::InvalidFeeAccount,
        constraint = protocol_fee_account.mint == escrow.token_mint @ AgentVaultError::InvalidFeeAccount,
    )]
    pub protocol_fee_account: Account<'info, TokenAccount>,

    /// Client's token account to receive any vault remainder (H-1 griefing fix)
    #[account(
        mut,
        constraint = client_token_account.owner == client.key(),
        constraint = client_token_account.mint == escrow.token_mint,
    )]
    pub client_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ConfirmCompletion>) -> Result<()> {
    let clock = Clock::get()?;
    let escrow = &mut ctx.accounts.escrow;

    let protocol_fee = escrow.calculate_protocol_fee()?;
    let provider_amount = escrow.provider_payout()?;

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

    // Transfer protocol fee to the validated fee account
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

    // H-1: Sweep any remaining vault balance to the client.
    // This handles griefing tokens sent directly to the vault PDA.
    ctx.accounts.escrow_vault.reload()?;
    let remainder = ctx.accounts.escrow_vault.amount;
    if remainder > 0 {
        let transfer_remainder = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow_vault.to_account_info(),
                to: ctx.accounts.client_token_account.to_account_info(),
                authority: ctx.accounts.escrow_vault_authority.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(transfer_remainder, remainder)?;
    }

    // M-1: Close vault token account, return rent to client
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

    // Update state
    escrow.status = EscrowStatus::Completed;

    emit!(EscrowCompleted {
        escrow: escrow.key(),
        amount_paid: provider_amount,
        fee_collected: protocol_fee,
        completed_at: clock.unix_timestamp,
    });

    Ok(())
}
