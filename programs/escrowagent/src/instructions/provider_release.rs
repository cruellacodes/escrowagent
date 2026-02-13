use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount, Transfer};

use crate::errors::AgentVaultError;
use crate::events::EscrowCompleted;
use crate::state::config::ProtocolConfig;
use crate::state::enums::EscrowStatus;
use crate::state::escrow::Escrow;

// ──────────────────────────────────────────────────────
// Provider Release — H-2 fix
//
// Allows the provider to self-release funds when:
// 1. Status is ProofSubmitted (proof was submitted, not disputed)
// 2. The confirmation timeout has elapsed:
//    proof_submitted_at + grace_period < now
// 3. No dispute was raised (guaranteed by status == ProofSubmitted,
//    since disputes change status to Disputed)
//
// This protects providers from clients who ignore proof
// and wait for expiry to reclaim funds.
// ──────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct ProviderRelease<'info> {
    /// The provider self-releasing funds after confirmation timeout
    pub provider: Signer<'info>,

    /// Protocol config — check paused status
    #[account(
        seeds = [ProtocolConfig::SEED],
        bump = config.bump,
        constraint = !config.paused @ AgentVaultError::ProtocolPaused,
    )]
    pub config: Account<'info, ProtocolConfig>,

    /// The escrow account — must be ProofSubmitted and provider must match
    /// M-1: Close escrow after release, rent recovered to client
    #[account(
        mut,
        close = client,
        constraint = escrow.provider == provider.key() @ AgentVaultError::UnauthorizedProvider,
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
        constraint = provider_token_account.owner == provider.key(),
        constraint = provider_token_account.mint == escrow.token_mint,
    )]
    pub provider_token_account: Account<'info, TokenAccount>,

    /// Protocol fee token account — validated against config.fee_authority + escrow.token_mint
    #[account(
        mut,
        constraint = protocol_fee_account.owner == config.fee_authority @ AgentVaultError::InvalidFeeAccount,
        constraint = protocol_fee_account.mint == escrow.token_mint @ AgentVaultError::InvalidFeeAccount,
    )]
    pub protocol_fee_account: Account<'info, TokenAccount>,

    /// Client's token account to receive any vault remainder (H-1 griefing fix)
    #[account(
        mut,
        constraint = client_token_account.owner == escrow.client,
        constraint = client_token_account.mint == escrow.token_mint,
    )]
    pub client_token_account: Account<'info, TokenAccount>,

    /// CHECK: The original client, receives vault rent on close
    #[account(
        mut,
        constraint = client.key() == escrow.client,
    )]
    pub client: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ProviderRelease>) -> Result<()> {
    let clock = Clock::get()?;
    let escrow = &mut ctx.accounts.escrow;

    // H-2: Time gate — provider can self-release only after BOTH:
    //   1. proof_submitted_at + grace_period  (confirmation timeout)
    //   2. deadline + grace_period            (deadline timeout)
    // Using max() prevents early release when proof is submitted before deadline.
    let release_after_proof = escrow.proof_submitted_at + escrow.grace_period;
    let release_after_deadline = escrow.deadline + escrow.grace_period;
    let release_time = std::cmp::max(release_after_proof, release_after_deadline);
    require!(
        clock.unix_timestamp > release_time,
        AgentVaultError::AutoReleaseNotReady
    );

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

    // Close vault token account, return rent to client
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

    escrow.status = EscrowStatus::Completed;

    emit!(EscrowCompleted {
        escrow: escrow.key(),
        amount_paid: provider_amount,
        fee_collected: protocol_fee,
        completed_at: clock.unix_timestamp,
    });

    Ok(())
}
