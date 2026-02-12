use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::AgentVaultError;
use crate::events::EscrowCreated;
use crate::state::config::ProtocolConfig;
use crate::state::enums::*;
use crate::state::escrow::Escrow;

#[derive(Accounts)]
#[instruction(amount: u64, deadline: i64, grace_period: i64, task_hash: [u8; 32])]
pub struct CreateEscrow<'info> {
    /// The client (Agent A) creating and funding the escrow
    #[account(mut)]
    pub client: Signer<'info>,

    /// The provider (Agent B) who will do the work
    /// CHECK: We only store this pubkey; no signature needed at creation
    pub provider: UncheckedAccount<'info>,

    /// Optional arbitrator for dispute resolution
    /// CHECK: We only store this pubkey
    pub arbitrator: UncheckedAccount<'info>,

    /// Protocol config PDA — validated to ensure protocol is active
    #[account(
        seeds = [ProtocolConfig::SEED],
        bump = config.bump,
        constraint = !config.paused @ AgentVaultError::ProtocolPaused,
    )]
    pub config: Account<'info, ProtocolConfig>,

    /// The escrow PDA account — derived from client + provider + task_hash
    #[account(
        init,
        payer = client,
        space = Escrow::LEN,
        seeds = [
            b"escrow",
            client.key().as_ref(),
            provider.key().as_ref(),
            &task_hash,
        ],
        bump,
    )]
    pub escrow: Account<'info, Escrow>,

    /// The SPL token mint for the escrowed token
    pub token_mint: Account<'info, Mint>,

    /// The client's token account (source of funds)
    #[account(
        mut,
        constraint = client_token_account.owner == client.key(),
        constraint = client_token_account.mint == token_mint.key(),
    )]
    pub client_token_account: Account<'info, TokenAccount>,

    /// The escrow vault PDA token account (holds funds in custody)
    #[account(
        init,
        payer = client,
        token::mint = token_mint,
        token::authority = escrow_vault_authority,
        seeds = [b"vault", escrow.key().as_ref()],
        bump,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    /// CHECK: PDA authority over the vault — no data, just a signer seed
    #[account(
        seeds = [b"vault_authority", escrow.key().as_ref()],
        bump,
    )]
    pub escrow_vault_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<CreateEscrow>,
    amount: u64,
    deadline: i64,
    grace_period: i64,
    task_hash: [u8; 32],
    verification_type: VerificationType,
    criteria_count: u8,
) -> Result<()> {
    let config = &ctx.accounts.config;

    // ── Validate inputs against protocol config ──
    require!(amount >= config.min_escrow_amount, AgentVaultError::BelowMinimumAmount);
    require!(amount > 0, AgentVaultError::AmountZero);
    if config.max_escrow_amount > 0 {
        require!(amount <= config.max_escrow_amount, AgentVaultError::AboveMaximumAmount);
    }

    let clock = Clock::get()?;
    require!(deadline > clock.unix_timestamp, AgentVaultError::DeadlineInPast);
    require!(grace_period >= 0, AgentVaultError::InvalidGracePeriod);

    // ── Transfer tokens from client to escrow vault ──
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.client_token_account.to_account_info(),
            to: ctx.accounts.escrow_vault.to_account_info(),
            authority: ctx.accounts.client.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, amount)?;

    // ── Initialize escrow account (fees from config) ──
    let escrow = &mut ctx.accounts.escrow;
    escrow.client = ctx.accounts.client.key();
    escrow.provider = ctx.accounts.provider.key();
    escrow.arbitrator = ctx.accounts.arbitrator.key();
    escrow.token_mint = ctx.accounts.token_mint.key();
    escrow.escrow_vault = ctx.accounts.escrow_vault.key();
    escrow.amount = amount;
    escrow.protocol_fee_bps = config.protocol_fee_bps;
    escrow.arbitrator_fee_bps = config.arbitrator_fee_bps;
    escrow.task_hash = task_hash;
    escrow.verification_type = verification_type;
    escrow.criteria_count = criteria_count;
    escrow.created_at = clock.unix_timestamp;
    escrow.deadline = deadline;
    escrow.grace_period = grace_period;
    escrow.status = EscrowStatus::AwaitingProvider;
    escrow.proof_type = None;
    escrow.proof_data = [0u8; 64];
    escrow.proof_submitted_at = 0;
    escrow.dispute_raised_by = Pubkey::default();
    escrow.client_escrow_count = 0;
    escrow.provider_escrow_count = 0;
    escrow.bump = ctx.bumps.escrow;
    escrow.vault_bump = ctx.bumps.escrow_vault;

    // ── Emit event ──
    emit!(EscrowCreated {
        escrow: escrow.key(),
        client: escrow.client,
        provider: escrow.provider,
        amount,
        token_mint: escrow.token_mint,
        deadline,
        task_hash,
        verification_type,
    });

    Ok(())
}
