use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount, Transfer};

use crate::errors::AgentVaultError;
use crate::events::{DisputeRaised, DisputeResolved};
use crate::state::config::ProtocolConfig;
use crate::state::enums::*;
use crate::state::escrow::Escrow;

// ──────────────────────────────────────────────────────
// Raise Dispute — either client or provider
// ──────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct RaiseDispute<'info> {
    /// The party raising the dispute
    #[account(mut)]
    pub raiser: Signer<'info>,

    /// Protocol config — check paused status
    /// H-1: Dispute raising blocked when protocol is paused
    #[account(
        seeds = [ProtocolConfig::SEED],
        bump = config.bump,
        constraint = !config.paused @ AgentVaultError::ProtocolPaused,
    )]
    pub config: Account<'info, ProtocolConfig>,

    /// The escrow account
    #[account(
        mut,
        constraint = (escrow.client == raiser.key() || escrow.provider == raiser.key())
            @ AgentVaultError::NotParticipant,
    )]
    pub escrow: Account<'info, Escrow>,
}

pub fn raise_handler(ctx: Context<RaiseDispute>) -> Result<()> {
    let clock = Clock::get()?;
    let escrow = &mut ctx.accounts.escrow;

    // Only Active or ProofSubmitted can be disputed
    // L-5: can_dispute() already excludes Disputed status, no redundant check needed
    require!(escrow.can_dispute(), AgentVaultError::InvalidStatus);

    // Must have an arbitrator assigned
    require!(
        escrow.arbitrator != Pubkey::default(),
        AgentVaultError::NoArbitrator
    );

    // Verify within grace period if past deadline
    if clock.unix_timestamp > escrow.deadline {
        require!(
            clock.unix_timestamp <= escrow.deadline + escrow.grace_period,
            AgentVaultError::GracePeriodExpired
        );
    }

    escrow.status = EscrowStatus::Disputed;
    escrow.dispute_raised_by = ctx.accounts.raiser.key();

    emit!(DisputeRaised {
        escrow: escrow.key(),
        raised_by: ctx.accounts.raiser.key(),
        raised_at: clock.unix_timestamp,
    });

    Ok(())
}

// ──────────────────────────────────────────────────────
// Resolve Dispute — arbitrator only
//
// TODO: M-4 — Consider adding a separate `reassign_arbitrator`
// instruction to allow changing the arbitrator if the assigned
// one is unresponsive. This would require admin or mutual-consent
// authorization to prevent abuse.
// ──────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    /// The arbitrator resolving the dispute
    #[account(mut)]
    pub arbitrator: Signer<'info>,

    /// Protocol config — used to validate the fee account
    /// H-1: Dispute resolution blocked when protocol is paused
    #[account(
        seeds = [ProtocolConfig::SEED],
        bump = config.bump,
        constraint = !config.paused @ AgentVaultError::ProtocolPaused,
    )]
    pub config: Account<'info, ProtocolConfig>,

    /// The escrow account
    /// M-1: Close escrow after resolution, rent recovered to client
    #[account(
        mut,
        close = client,
        constraint = escrow.arbitrator == arbitrator.key() @ AgentVaultError::UnauthorizedArbitrator,
        constraint = escrow.status == EscrowStatus::Disputed @ AgentVaultError::InvalidStatus,
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

    /// Client's token account (for refund if ruling favors client)
    /// Boxed to reduce stack frame size
    #[account(
        mut,
        constraint = client_token_account.owner == escrow.client,
        constraint = client_token_account.mint == escrow.token_mint,
    )]
    pub client_token_account: Box<Account<'info, TokenAccount>>,

    /// Provider's token account (for payment if ruling favors provider)
    #[account(
        mut,
        constraint = provider_token_account.owner == escrow.provider,
        constraint = provider_token_account.mint == escrow.token_mint,
    )]
    pub provider_token_account: Box<Account<'info, TokenAccount>>,

    /// Arbitrator's token account (for arbitrator fee)
    #[account(
        mut,
        constraint = arbitrator_token_account.owner == arbitrator.key(),
        constraint = arbitrator_token_account.mint == escrow.token_mint,
    )]
    pub arbitrator_token_account: Box<Account<'info, TokenAccount>>,

    /// Protocol fee token account
    /// C-2: Validated against config.fee_authority (owner) + escrow.token_mint (mint)
    #[account(
        mut,
        constraint = protocol_fee_account.owner == config.fee_authority @ AgentVaultError::InvalidFeeAccount,
        constraint = protocol_fee_account.mint == escrow.token_mint @ AgentVaultError::InvalidFeeAccount,
    )]
    pub protocol_fee_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: The original client, receives vault rent on close
    #[account(
        mut,
        constraint = client.key() == escrow.client,
    )]
    pub client: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn resolve_handler(
    ctx: Context<ResolveDispute>,
    ruling: DisputeRuling,
) -> Result<()> {
    let clock = Clock::get()?;
    let escrow = &mut ctx.accounts.escrow;

    let protocol_fee = escrow.calculate_protocol_fee()?;
    let arbitrator_fee = escrow.calculate_arbitrator_fee()?;
    let distributable = escrow
        .amount
        .checked_sub(protocol_fee)
        .and_then(|n| n.checked_sub(arbitrator_fee))
        .ok_or(AgentVaultError::Overflow)?;

    let escrow_key = escrow.key();
    let vault_authority_bump = ctx.bumps.escrow_vault_authority;
    let seeds = &[
        b"vault_authority".as_ref(),
        escrow_key.as_ref(),
        &[vault_authority_bump],
    ];
    let signer_seeds = &[&seeds[..]];

    match ruling {
        DisputeRuling::PayClient => {
            let transfer_client = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_vault.to_account_info(),
                    to: ctx.accounts.client_token_account.to_account_info(),
                    authority: ctx.accounts.escrow_vault_authority.to_account_info(),
                },
                signer_seeds,
            );
            token::transfer(transfer_client, distributable)?;
        }
        DisputeRuling::PayProvider => {
            let transfer_provider = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_vault.to_account_info(),
                    to: ctx.accounts.provider_token_account.to_account_info(),
                    authority: ctx.accounts.escrow_vault_authority.to_account_info(),
                },
                signer_seeds,
            );
            token::transfer(transfer_provider, distributable)?;
        }
        DisputeRuling::Split { client_bps, provider_bps } => {
            require!(
                client_bps as u32 + provider_bps as u32 == 10_000,
                AgentVaultError::InvalidSplitRuling
            );

            let client_amount = (distributable as u128)
                .checked_mul(client_bps as u128)
                .unwrap()
                .checked_div(10_000)
                .unwrap() as u64;
            let provider_amount = distributable - client_amount;

            if client_amount > 0 {
                let transfer_client = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.escrow_vault.to_account_info(),
                        to: ctx.accounts.client_token_account.to_account_info(),
                        authority: ctx.accounts.escrow_vault_authority.to_account_info(),
                    },
                    signer_seeds,
                );
                token::transfer(transfer_client, client_amount)?;
            }

            if provider_amount > 0 {
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
            }
        }
    }

    // Pay arbitrator fee
    if arbitrator_fee > 0 {
        let transfer_arb = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow_vault.to_account_info(),
                to: ctx.accounts.arbitrator_token_account.to_account_info(),
                authority: ctx.accounts.escrow_vault_authority.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(transfer_arb, arbitrator_fee)?;
    }

    // Pay protocol fee to the validated fee account
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

    escrow.status = EscrowStatus::Resolved;

    emit!(DisputeResolved {
        escrow: escrow.key(),
        arbitrator: ctx.accounts.arbitrator.key(),
        ruling,
        resolved_at: clock.unix_timestamp,
    });

    Ok(())
}
